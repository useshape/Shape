mod ast_chunker;
mod bm25;
mod chunker;
mod embeddings;
mod hybrid;
mod manifest;

pub use bm25::{Bm25Index, SearchHit};
pub use embeddings::{ApiContext, EmbeddingStore, RemoteIndexClient};
pub use hybrid::{HybridOptions, RetrievalHit};

use bm25::build_indexed_chunk;
use chunker::chunk_file;
use manifest::IndexManifest as Manifest;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use walkdir::WalkDir;

const INDEXABLE_EXTENSIONS: &[&str] = &[
    "rs", "ts", "tsx", "js", "jsx", "py", "go", "java", "c", "cpp", "h", "hpp", "cs", "rb",
    "php", "swift", "kt", "scala", "md", "json", "yaml", "yml", "toml", "xml", "html", "css",
    "scss", "sql", "sh", "bash", "zsh", "ps1", "vue", "svelte", "astro", "lua", "r", "dart",
];

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".turbo",
    "coverage",
    ".cache",
    "__pycache__",
    ".venv",
    "venv",
];

const PROGRESS_EVERY_N_FILES: usize = 15;
const EMBED_BATCH: usize = 32;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub files_indexed: usize,
    pub total_files: usize,
    pub chunks: usize,
    pub vectors: usize,
    pub last_indexed_at: Option<f64>,
    pub project_path: Option<String>,
    pub indexing: bool,
    pub embeddings_enabled: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexProgress {
    pub files_indexed: usize,
    pub total_files: usize,
    pub chunks: usize,
    pub phase: String,
}

pub struct IndexManager {
    pub project_path: PathBuf,
    index_dir: PathBuf,
    index: Bm25Index,
    embeddings: EmbeddingStore,
    manifest: Manifest,
    remote: RemoteIndexClient,
    embeddings_enabled: bool,
}

impl IndexManager {
    pub fn for_project_with_opts(
        project_path: &str,
        embeddings_enabled: bool,
        api_context: ApiContext,
    ) -> std::io::Result<Self> {
        let project = PathBuf::from(project_path);
        let index_dir = index_storage_dir(project_path);
        std::fs::create_dir_all(&index_dir)?;

        let manifest_path = index_dir.join("manifest.json");
        let index_path = index_dir.join("index.bin");

        let manifest = Manifest::load(&manifest_path);
        let index = if index_path.exists() {
            std::fs::read(&index_path)
                .ok()
                .and_then(|bytes| bincode::deserialize(&bytes).ok())
                .unwrap_or_default()
        } else {
            Bm25Index::default()
        };

        let mut embeddings = EmbeddingStore::default();
        embeddings.enabled = embeddings_enabled;

        Ok(Self {
            project_path: project,
            index_dir,
            index,
            embeddings,
            manifest,
            remote: RemoteIndexClient::new(project_path, api_context),
            embeddings_enabled,
        })
    }

    pub fn status(&self, indexing: bool) -> IndexStatus {
        IndexStatus {
            files_indexed: self.manifest.files.len(),
            total_files: self.manifest.files.len(),
            chunks: self.index.chunks.len(),
            vectors: self.embeddings.server_vectors,
            last_indexed_at: self.manifest.last_indexed_at,
            project_path: Some(self.project_path.to_string_lossy().to_string()),
            indexing,
            embeddings_enabled: self.embeddings_enabled,
        }
    }

    pub fn hybrid_search(&self, query: &str, opts: &HybridOptions) -> Vec<RetrievalHit> {
        let mut opts = opts.clone();
        opts.embeddings_enabled = opts.embeddings_enabled && self.embeddings_enabled;
        hybrid::hybrid_search(
            &self.project_path.to_string_lossy(),
            query,
            &self.index,
            &self.embeddings,
            &self.remote,
            &opts,
        )
    }

    pub fn index_project_with_progress<F>(&mut self, mut on_progress: F) -> std::io::Result<IndexStatus>
    where
        F: FnMut(IndexProgress),
    {
        let project = self.project_path.clone();
        if !project.exists() {
            return Ok(self.status(false));
        }

        let mut current_files: HashMap<String, u64> = HashMap::new();
        let mut to_index: Vec<PathBuf> = Vec::new();

        on_progress(IndexProgress {
            files_indexed: 0,
            total_files: 0,
            chunks: self.index.chunks.len(),
            phase: "scanning".to_string(),
        });

        for entry in WalkDir::new(&project)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| !should_skip_entry(e.path(), &project))
        {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            if !is_indexable(path) {
                continue;
            }
            let rel = path
                .strip_prefix(&project)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/");
            let mtime = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            current_files.insert(rel.clone(), mtime);

            let prev = self.manifest.files.get(&rel).copied();
            if prev != Some(mtime) {
                to_index.push(path.to_path_buf());
            }
        }

        let total_files = current_files.len();
        on_progress(IndexProgress {
            files_indexed: 0,
            total_files,
            chunks: self.index.chunks.len(),
            phase: "indexing".to_string(),
        });

        let removed: HashSet<String> = self
            .manifest
            .files
            .keys()
            .filter(|p| !current_files.contains_key(*p))
            .cloned()
            .collect();
        if !removed.is_empty() {
            self.index.remove_paths(&removed);
        }

        let total_to_index = to_index.len();
        let mut pending_embed: Vec<(usize, String, usize, usize, String)> = Vec::new();

        for (i, path) in to_index.into_iter().enumerate() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if content.len() > 512_000 {
                    continue;
                }
                let rel = path
                    .strip_prefix(&project)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");

                self.index.remove_paths(&HashSet::from([rel.clone()]));

                for chunk in chunk_file(&rel, &content) {
                    let doc_id = self.index.chunks.len();
                    self.index.add_chunk(build_indexed_chunk(
                        &chunk.path,
                        chunk.start_line,
                        chunk.end_line,
                        &chunk.text,
                    ));
                    if self.embeddings_enabled {
                        pending_embed.push((
                            doc_id,
                            chunk.path.clone(),
                            chunk.start_line,
                            chunk.end_line,
                            chunk.text,
                        ));
                    }
                }
            }

            if pending_embed.len() >= EMBED_BATCH {
                self.flush_embeddings(&mut pending_embed);
            }

            if i % PROGRESS_EVERY_N_FILES == 0 || i + 1 == total_to_index {
                let indexed_so_far = total_files.saturating_sub(total_to_index - i - 1);
                on_progress(IndexProgress {
                    files_indexed: indexed_so_far.min(total_files),
                    total_files,
                    chunks: self.index.chunks.len(),
                    phase: "indexing".to_string(),
                });
            }
        }

        self.flush_embeddings(&mut pending_embed);

        if self.embeddings_enabled && (!removed.is_empty() || total_to_index > 0) {
            if let Ok(vectors) = self.sync_all_chunks_to_server(true) {
                self.embeddings.server_vectors = vectors;
            }
        }

        on_progress(IndexProgress {
            files_indexed: total_files,
            total_files,
            chunks: self.index.chunks.len(),
            phase: "persisting".to_string(),
        });

        self.manifest.files = current_files;
        self.manifest.last_indexed_at =
            Some(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs_f64());

        self.persist()?;
        Ok(self.status(false))
    }

    fn flush_embeddings(&mut self, pending: &mut Vec<(usize, String, usize, usize, String)>) {
        if !self.embeddings_enabled || pending.is_empty() {
            pending.clear();
            return;
        }

        use crate::agent::index::embeddings::SyncChunkPayload;
        let chunks: Vec<SyncChunkPayload> = pending
            .drain(..)
            .map(|(chunk_index, file_path, start_line, end_line, text)| SyncChunkPayload {
                chunk_index,
                file_path,
                start_line,
                end_line,
                text,
            })
            .collect();

        if let Ok(vectors) = self.remote.sync_chunks(chunks, false) {
            self.embeddings.server_vectors = vectors;
        }
    }

    fn sync_all_chunks_to_server(&self, full_replace: bool) -> Result<usize, String> {
        use crate::agent::index::embeddings::SyncChunkPayload;
        if !self.embeddings_enabled {
            return Ok(0);
        }

        let mut vectors = 0usize;
        let mut batch: Vec<SyncChunkPayload> = Vec::with_capacity(EMBED_BATCH);

        for (chunk_index, chunk) in self.index.chunks.iter().enumerate() {
            batch.push(SyncChunkPayload {
                chunk_index,
                file_path: chunk.path.clone(),
                start_line: chunk.start_line,
                end_line: chunk.end_line,
                text: chunk.text.clone(),
            });
            if batch.len() >= EMBED_BATCH {
                vectors = self.remote.sync_chunks(batch, full_replace && vectors == 0)?;
                batch = Vec::with_capacity(EMBED_BATCH);
            }
        }

        if !batch.is_empty() {
            vectors = self.remote.sync_chunks(batch, full_replace && vectors == 0)?;
        } else if full_replace {
            vectors = self.remote.sync_chunks(vec![], true)?;
        }

        Ok(vectors)
    }

    fn persist(&self) -> std::io::Result<()> {
        let manifest_path = self.index_dir.join("manifest.json");
        let index_path = self.index_dir.join("index.bin");
        self.manifest.save(&manifest_path)?;
        let bytes = bincode::serialize(&self.index).unwrap_or_default();
        std::fs::write(index_path, bytes)
    }
}

fn index_storage_dir(project_path: &str) -> PathBuf {
    let mut hash: u64 = 5381;
    for b in project_path.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(b as u64);
    }
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("shape-index")
        .join(format!("{:016x}", hash))
}

fn should_skip_entry(path: &Path, project_root: &Path) -> bool {
    if path == project_root {
        return false;
    }
    path.components().any(|c| {
        if let std::path::Component::Normal(name) = c {
            SKIP_DIRS.contains(&name.to_string_lossy().as_ref())
        } else {
            false
        }
    })
}

fn is_indexable(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| INDEXABLE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

struct IndexStateInner {
    current: Mutex<Option<IndexManager>>,
    indexing: AtomicBool,
    progress: Mutex<Option<IndexProgress>>,
    embeddings_enabled: AtomicBool,
    api_context: Mutex<ApiContext>,
}

impl IndexStateInner {
    fn api_context(&self) -> ApiContext {
        self.api_context
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    fn ensure_loaded(&self, project_path: &str) -> Result<(), String> {
        let mut guard = self.current.lock().map_err(|e| e.to_string())?;
        let emb = self.embeddings_enabled.load(Ordering::SeqCst);
        let ctx = self.api_context();
        let needs_load = guard
            .as_ref()
            .map(|m| {
                m.project_path.to_string_lossy() != project_path
                    || m.embeddings_enabled != emb
            })
            .unwrap_or(true);
        if needs_load {
            *guard = Some(
                IndexManager::for_project_with_opts(project_path, emb, ctx)
                    .map_err(|e| e.to_string())?,
            );
        }
        Ok(())
    }
}

/// Global index state managed by Tauri — one active project index at a time.
#[derive(Clone)]
pub struct IndexState {
    inner: Arc<IndexStateInner>,
}

impl IndexState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(IndexStateInner {
                current: Mutex::new(None),
                indexing: AtomicBool::new(false),
                progress: Mutex::new(None),
                embeddings_enabled: AtomicBool::new(true),
                api_context: Mutex::new(ApiContext::default()),
            }),
        }
    }

    pub fn embeddings_enabled(&self) -> bool {
        self.inner.embeddings_enabled.load(Ordering::SeqCst)
    }

    pub fn set_api_context(
        &self,
        token: Option<String>,
        turn_id: Option<String>,
        conversation_id: Option<String>,
    ) {
        if let Ok(mut guard) = self.inner.api_context.lock() {
            guard.token = token;
            guard.turn_id = turn_id;
            guard.conversation_id = conversation_id;
        }
        if let Ok(mut current) = self.inner.current.lock() {
            *current = None;
        }
    }

    pub fn is_indexing(&self) -> bool {
        self.inner.indexing.load(Ordering::SeqCst)
    }

    fn ensure_loaded(&self, project_path: &str) -> Result<(), String> {
        self.inner.ensure_loaded(project_path)
    }

    /// Skip background re-index when a fresh index already exists.
    pub fn should_background_index(&self, project_path: &str) -> bool {
        if self.is_indexing() {
            return false;
        }
        let Ok(status) = self.status(project_path) else {
            return true;
        };
        if status.chunks == 0 {
            return true;
        }
        let Some(ts) = status.last_indexed_at else {
            return true;
        };
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64();
        now - ts > 300.0
    }

    /// Start indexing on a background thread. Returns false if a job is already running.
    pub fn spawn_background_index(&self, app: tauri::AppHandle, project_path: String) -> bool {
        if self.inner.indexing.swap(true, Ordering::SeqCst) {
            return false;
        }

        let inner = self.inner.clone();
        std::thread::spawn(move || {
            let emb = inner.embeddings_enabled.load(Ordering::SeqCst);
            let ctx = inner.api_context();
            let run = || -> Result<(IndexManager, IndexStatus), String> {
                let mut manager =
                    IndexManager::for_project_with_opts(&project_path, emb, ctx)
                        .map_err(|e| e.to_string())?;
                let status = manager
                    .index_project_with_progress(|progress| {
                        if let Ok(mut snap) = inner.progress.lock() {
                            *snap = Some(progress.clone());
                        }
                        let _ = app.emit("codebase-index-progress", &progress);
                    })
                    .map_err(|e| e.to_string())?;
                Ok((manager, status))
            };

            match run() {
                Ok((manager, status)) => {
                    if let Ok(mut guard) = inner.current.lock() {
                        *guard = Some(manager);
                    }
                    let _ = app.emit("codebase-index-complete", &status);
                }
                Err(err) => {
                    let _ = app.emit("codebase-index-error", err);
                }
            }

            inner.indexing.store(false, Ordering::SeqCst);
            if let Ok(mut snap) = inner.progress.lock() {
                *snap = None;
            }
        });

        true
    }

    pub fn hybrid_search(
        &self,
        project_path: &str,
        query: &str,
        opts: HybridOptions,
    ) -> Result<Vec<RetrievalHit>, String> {
        self.with_manager(project_path, |m| Ok(m.hybrid_search(query, &opts)))
    }

    fn with_manager<T, F>(&self, project_path: &str, f: F) -> Result<T, String>
    where
        F: FnOnce(&IndexManager) -> Result<T, String>,
    {
        if self.is_indexing() {
            if let Ok(guard) = self.inner.current.try_lock() {
                if let Some(manager) = guard.as_ref() {
                    return f(manager);
                }
            }
            let emb = self.inner.embeddings_enabled.load(Ordering::SeqCst);
            let ctx = self.inner.api_context();
            let manager =
                IndexManager::for_project_with_opts(project_path, emb, ctx)
                    .map_err(|e| e.to_string())?;
            return f(&manager);
        }

        self.ensure_loaded(project_path)?;
        let guard = self.inner.current.lock().map_err(|e| e.to_string())?;
        f(guard
            .as_ref()
            .ok_or_else(|| "Index not loaded".to_string())?)
    }

    pub fn status(&self, project_path: &str) -> Result<IndexStatus, String> {
        self.ensure_loaded(project_path)?;
        let guard = self.inner.current.lock().map_err(|e| e.to_string())?;
        let indexing = self.is_indexing();
        let mut status = guard
            .as_ref()
            .ok_or_else(|| "Index not loaded".to_string())?
            .status(indexing);
        if indexing {
            if let Ok(progress) = self.inner.progress.lock() {
                if let Some(p) = progress.as_ref() {
                    status.files_indexed = p.files_indexed;
                    status.total_files = p.total_files;
                    status.chunks = p.chunks;
                }
            }
        }
        Ok(status)
    }
}
