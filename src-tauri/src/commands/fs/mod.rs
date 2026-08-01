use crate::app_state::{AppState, FileInfo, ProjectState};
use crate::core::error::AppError;
use fsindex::{Config, FileIndexer};
use fst::{automaton::Automaton, automaton::Str, IntoStreamer, Set, Streamer};
use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config as MatcherConfig, Matcher};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, State};
use notify::{Watcher, RecursiveMode, Event};

#[derive(Clone, Serialize)]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Serialize)]
pub struct SearchResult {
    name: String,
    path: String,
    relative_path: String,
    score: i64,
}

#[derive(serde::Deserialize)]
pub struct SearchOptions {
    pub case_sensitive: bool,
    pub whole_word: bool,
    pub is_regex: bool,
    pub include_pattern: Option<String>,
    pub exclude_pattern: Option<String>,
    pub respect_gitignore: bool,
    pub include_hidden: bool,
    pub follow_symlinks: bool,
    pub exclude_tests: bool,
    pub exclude_docs: bool,
    pub exclude_build: bool,
    pub exclude_assets: bool,
    pub only_source: bool,
}

#[derive(Serialize)]
pub struct ContentSearchResult {
    pub path: String,
    pub relative_path: String,
    pub matches: Vec<ContentMatch>,
}

#[derive(Serialize, Clone, serde::Deserialize)]
pub struct ContentMatch {
    pub line_number: usize,
    pub line_text: String,
    pub column_start: usize,
    pub column_end: usize,
}

#[derive(Serialize)]
pub struct ReplaceResult {
    pub files_modified: usize,
    pub replacements_count: usize,
    pub errors: Vec<String>,
}

fn line_starts(content: &str) -> Vec<usize> {
    let mut starts = vec![0];
    for (i, c) in content.char_indices() {
        if c == '\n' {
            starts.push(i + c.len_utf8());
        }
    }
    starts
}

fn apply_replacements_to_content(
    content: &str,
    matches: &[ContentMatch],
    replacement: &str,
) -> (String, usize) {
    if matches.is_empty() {
        return (content.to_string(), 0);
    }

    let line_starts = line_starts(content);
    let mut ranges: Vec<(usize, usize)> = matches
        .iter()
        .map(|m| {
            let line_idx = m.line_number.saturating_sub(1);
            let line_start = line_starts.get(line_idx).copied().unwrap_or(0);
            (line_start + m.column_start, line_start + m.column_end)
        })
        .collect();

    ranges.sort_by(|a, b| b.0.cmp(&a.0));

    let mut result = content.to_string();
    let mut count = 0;
    for (start, end) in ranges {
        if start <= result.len() && end <= result.len() && start <= end {
            result.replace_range(start..end, replacement);
            count += 1;
        }
    }
    (result, count)
}

struct FsCache {
    root: String,
    file_rel_to_abs: HashMap<String, String>,
    file_rel_paths: Vec<String>,
}

static FS_CACHE: OnceLock<Mutex<Option<FsCache>>> = OnceLock::new();

fn fs_cache() -> &'static Mutex<Option<FsCache>> {
    FS_CACHE.get_or_init(|| Mutex::new(None))
}

fn normalize_rel(path: &Path) -> String {
    let raw = path.to_string_lossy().into_owned();
    raw.replace('\\', "/")
}

fn sort_entries(entries: &mut Vec<FileEntry>) {
    entries.sort_unstable_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });
}

fn build_fs_cache(root: &str) -> Result<FsCache, AppError> {
    let root_path = PathBuf::from(root);
    if !root_path.exists() {
        return Err(AppError::Message("Project path does not exist".to_string()));
    }

    let config = Config::builder()
        .respect_gitignore(true)
        .include_hidden(false)
        .read_contents(false)
        .parallel(true)
        .build();

    let indexer = FileIndexer::with_config(&root_path, config);
    let mut file_rel_to_abs: HashMap<String, String> = HashMap::new();
    let mut file_rel_paths: Vec<String> = Vec::new();

    for indexed in indexer.files_result().flatten() {
        let abs = indexed.path;
        if !abs.is_file() {
            continue;
        }

        let rel = match abs.strip_prefix(&root_path) {
            Ok(r) => r.to_path_buf(),
            Err(_) => continue,
        };

        let rel_norm = normalize_rel(&rel);
        let abs_norm = abs.to_string_lossy().into_owned();
        file_rel_to_abs.insert(rel_norm.clone(), abs_norm.clone());
        file_rel_paths.push(rel_norm);
    }

    Ok(FsCache {
        root: root.to_string(),
        file_rel_to_abs,
        file_rel_paths,
    })
}

fn ensure_cache(root: &str) -> Result<(), AppError> {
    let cache_mutex = fs_cache();
    let mut guard = cache_mutex.lock()?;
    let needs_rebuild = guard.as_ref().map(|c| c.root != root).unwrap_or(true);
    if needs_rebuild {
        *guard = Some(build_fs_cache(root)?);
    }
    Ok(())
}

fn clear_cache() {
    if let Ok(mut guard) = fs_cache().lock() {
        *guard = None;
    }
}

fn is_ignored_path(path: &Path) -> bool {
    if let Some(ext) = path.extension() {
        if ext == "tsbuildinfo" {
            return true;
        }
    }
    path.components().any(|component| {
        if let std::path::Component::Normal(p) = component {
            let s = p.to_string_lossy();
            s == ".git"
                || s == "node_modules"
                || s == ".next"
                || s == "target"
                || s == "dist"
                || s == "build"
                || s == "out"
                || s == ".shape"
                || s == ".idea"
                || s == ".vscode"
                || s == "venv"
                || s == ".venv"
                || s == "__pycache__"
        } else {
            false
        }
    })
}

static FILE_WATCHER: OnceLock<Mutex<Option<notify::RecommendedWatcher>>> = OnceLock::new();

fn start_watcher(app: AppHandle, path: &str) {
    let mut watcher_guard = FILE_WATCHER.get_or_init(|| Mutex::new(None)).lock().unwrap();
    *watcher_guard = None;

    let app_clone = app.clone();
    let pending_paths: std::sync::Arc<std::sync::Mutex<std::collections::HashSet<String>>> =
        std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashSet::new()));
    let pending_for_emit = pending_paths.clone();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<()>();

    tokio::spawn(async move {
        let mut delay: Option<std::pin::Pin<Box<tokio::time::Sleep>>> = None;
        loop {
            tokio::select! {
                res = rx.recv() => {
                    if res.is_none() {
                        break;
                    }
                    delay = Some(Box::pin(tokio::time::sleep(std::time::Duration::from_millis(250))));
                }
                _ = async {
                    if let Some(ref mut d) = delay {
                        d.as_mut().await;
                    } else {
                        std::future::pending::<()>().await;
                    }
                } => {
                    delay = None;
                    let count = pending_for_emit
                        .lock()
                        .map(|mut set| {
                            let n = set.len();
                            set.clear();
                            n
                        })
                        .unwrap_or(0);
                    if count > 0 {
                        let _ = app_clone.emit("shape-files-changed", count);
                    }
                }
            }
        }
    });

    let tx_clone = tx.clone();
    let pending_for_watch = pending_paths.clone();
    if let Ok(mut watcher) = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            let mut any_interesting = false;
            if let Ok(mut set) = pending_for_watch.lock() {
                for p in &event.paths {
                    if !is_ignored_path(p) {
                        set.insert(p.to_string_lossy().into_owned());
                        any_interesting = true;
                    }
                }
            }
            if any_interesting {
                let _ = tx_clone.send(());
            }
        }
    }) {
        let _ = watcher.watch(Path::new(path), RecursiveMode::Recursive);
        *watcher_guard = Some(watcher);
    }
}

pub async fn ls_dir(path: String) -> Result<Vec<FileEntry>, AppError> {
    let path_clone = path.clone();
    tokio::task::spawn_blocking(move || {
        let entries = fs::read_dir(&path_clone).map_err(|e| AppError::Io(e))?;
        let mut result = Vec::with_capacity(128);

        for entry in entries {
            if let Ok(entry) = entry {
                let file_type = entry.file_type().ok();
                let is_dir = file_type.map(|ft| ft.is_dir()).unwrap_or(false);
                let path_buf = entry.path();

                result.push(FileEntry {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    path: path_buf.to_string_lossy().into_owned(),
                    is_dir,
                });
            }
        }

        sort_entries(&mut result);
        Ok::<Vec<FileEntry>, AppError>(result)
    })
    .await
    .map_err(|e| AppError::Message(format!("Worker thread panicked: {}", e)))?
}

pub async fn read_file(path: String) -> Result<String, AppError> {
    let bytes = tokio::fs::read(&path).await.map_err(AppError::Io)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

pub async fn read_file_bytes(path: String) -> Result<Vec<u8>, AppError> {
    tokio::fs::read(&path).await.map_err(AppError::Io)
}

pub async fn create_file(path: String) -> Result<(), AppError> {
    tokio::fs::write(&path, "").await.map_err(|e| AppError::Io(e))?;
    clear_cache();
    Ok(())
}

pub async fn create_dir(path: String) -> Result<(), AppError> {
    tokio::fs::create_dir_all(&path).await.map_err(|e| AppError::Io(e))?;
    clear_cache();
    Ok(())
}

pub async fn delete_path(path: String) -> Result<(), AppError> {
    let p = PathBuf::from(path);
    tokio::task::spawn_blocking(move || {
        if p.is_dir() {
            fs::remove_dir_all(&p).map_err(|e| AppError::Io(e))?;
        } else {
            fs::remove_file(&p).map_err(|e| AppError::Io(e))?;
        }
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Message(format!("Worker thread panicked: {}", e)))??;
    clear_cache();
    Ok(())
}

pub async fn trash_path(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        trash::delete(&path).map_err(|e| AppError::Message(format!("Trash error: {}", e)))?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Message(format!("Worker thread panicked: {}", e)))??;
    clear_cache();
    Ok(())
}

pub async fn rename_path(
    app: AppHandle,
    state: State<'_, AppState>,
    old_path: String,
    new_path: String,
) -> Result<(), AppError> {
    tokio::fs::rename(&old_path, &new_path).await.map_err(|e| AppError::Io(e))?;
    
    let mut state = state.0.lock()?;
    let old_p = PathBuf::from(&old_path);
    let new_p = PathBuf::from(&new_path);
    let mut updated = false;

    for file in state.open_files.iter_mut() {
        if file.path == old_path {
            file.path = new_path.clone();
            file.name = new_p.file_name().unwrap_or_default().to_string_lossy().to_string();
            updated = true;
        } else {
            let file_path = PathBuf::from(&file.path);
            if file_path.starts_with(&old_p) {
                if let Ok(rel) = file_path.strip_prefix(&old_p) {
                    file.path = new_p.join(rel).to_string_lossy().to_string();
                    updated = true;
                }
            }
        }
    }

    if let Some(active) = state.active_file.as_mut() {
        if *active == old_path {
            *active = new_path.clone();
            updated = true;
        } else {
            let active_path = PathBuf::from(&active);
            if active_path.starts_with(&old_p) {
                if let Ok(rel) = active_path.strip_prefix(&old_p) {
                    *active = new_p.join(rel).to_string_lossy().to_string();
                    updated = true;
                }
            }
        }
    }

    if updated {
        let _ = app.emit("project-state-update", &*state);
    }

    clear_cache();
    Ok(())
}

pub async fn pin_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    pinned: bool,
) -> Result<(), AppError> {
    let mut state = state.0.lock()?;
    if let Some(file) = state.open_files.iter_mut().find(|f| f.path == path) {
        file.is_pinned = pinned;
        
        // Re-order: pinned files first
        state.open_files.sort_by(|a, b| {
            if a.is_pinned == b.is_pinned {
                std::cmp::Ordering::Equal
            } else if a.is_pinned {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        });
        
        let _ = app.emit("project-state-update", &*state);
    }
    Ok(())
}

pub async fn close_to_right(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), AppError> {
    let mut state = state.0.lock()?;
    if let Some(pos) = state.open_files.iter().position(|f| f.path == path) {
        state.open_files.truncate(pos + 1);
        if let Some(active) = &state.active_file {
             if !state.open_files.iter().any(|f| &f.path == active) {
                 state.active_file = state.open_files.last().map(|f| f.path.clone());
             }
        }
        let _ = app.emit("project-state-update", &*state);
    }
    Ok(())
}

pub async fn close_saved(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let mut state = state.0.lock()?;
    state.open_files.retain(|f| f.is_dirty);
    if let Some(active) = &state.active_file {
         if !state.open_files.iter().any(|f| &f.path == active) {
             state.active_file = state.open_files.last().map(|f| f.path.clone());
         }
    }
    let _ = app.emit("project-state-update", &*state);
    Ok(())
}

pub async fn copy_path(old_path: String, new_path: String) -> Result<(), AppError> {
    let old_p = PathBuf::from(old_path);
    let new_p = PathBuf::from(new_path);
    tokio::task::spawn_blocking(move || {
        if old_p.is_dir() {
            let mut stack = vec![old_p.clone()];
            while let Some(current) = stack.pop() {
                let current_new = new_p.join(current.strip_prefix(&old_p).unwrap());
                if !current_new.exists() {
                    fs::create_dir_all(&current_new).map_err(|e| AppError::Io(e))?;
                }
                for entry in fs::read_dir(current).map_err(|e| AppError::Io(e))? {
                    let entry = entry.map_err(|e| AppError::Io(e))?;
                    let path = entry.path();
                    if path.is_dir() {
                        stack.push(path);
                    } else {
                        let target = current_new.join(entry.file_name());
                        fs::copy(&path, target).map_err(|e| AppError::Io(e))?;
                    }
                }
            }
        } else {
            fs::copy(&old_p, &new_p).map_err(|e| AppError::Io(e))?;
        }
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Message(format!("Worker thread panicked: {}", e)))??;
    clear_cache();
    Ok(())
}

pub async fn reveal_path(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            Command::new("explorer")
                .arg(format!("/select,{}", path.replace("/", "\\")))
                .spawn()
                .map_err(|e| AppError::Io(e))?;
        }
        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .arg("-R")
                .arg(&path)
                .spawn()
                .map_err(|e| AppError::Io(e))?;
        }
        #[cfg(target_os = "linux")]
        {
            let parent = Path::new(&path).parent().unwrap_or(Path::new("/"));
            Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| AppError::Io(e))?;
        }
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Message(format!("Worker thread panicked: {}", e)))??;
    Ok(())
}

pub async fn save_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), AppError> {
    match tokio::fs::write(&path, &content).await {
        Ok(_) => {
            let state_mutex = app.state::<AppState>();
            let project_path = {
                let state = state_mutex.0.lock()?;
                state.project_path.clone()
            };

            if let Some(project) = project_path {
                let _ = crate::commands::history::save_history_version(&project, &path, &content);
                crate::commands::stats::bump_event(&project, "user_file_saves");
            }

            let mut state = state_mutex.0.lock()?;
            if let Some(file) = state.open_files.iter_mut().find(|f| f.path == path) {
                file.is_dirty = false;
            }
            let _ = app.emit("project-state-update", &*state);
            Ok(())
        }
        Err(e) => Err(AppError::Io(e)),
    }
}

pub async fn save_file_bytes(app: tauri::AppHandle, path: String, bytes: Vec<u8>) -> Result<(), AppError> {
    tokio::fs::write(&path, &bytes)
        .await
        .map_err(AppError::Io)?;

    let state_mutex = app.state::<AppState>();
    let mut state = state_mutex.0.lock()?;
    if let Some(file) = state.open_files.iter_mut().find(|f| f.path == path) {
        file.is_dirty = false;
    }
    let _ = app.emit("project-state-update", &*state);
    Ok(())
}

pub async fn mark_file_dirty(app: tauri::AppHandle, path: String, dirty: bool) -> Result<(), AppError> {
    let state_mutex = app.state::<AppState>();
    let mut state = state_mutex.0.lock()?;
    if let Some(file) = state.open_files.iter_mut().find(|f| f.path == path) {
        if file.is_dirty != dirty {
            file.is_dirty = dirty;
            let _ = app.emit("project-state-update", &*state);
        }
    }
    Ok(())
}

fn emit_state(app: &AppHandle, state: &ProjectState) {
    let _ = app.emit("project-state-update", state);
}

pub async fn set_project_path(
    app: AppHandle,
    state: State<'_, AppState>,
    _agent_state: State<'_, crate::agent::models::AgentState>,
    path: Option<String>,
) -> Result<(), AppError> {
    {
        let mut state = state.0.lock()?;
        if state.project_path != path {
            state.project_path = path.clone();
            state.open_files.clear();
            state.active_file = None;
        }
    }

    if let Some(p) = path {
        start_watcher(app.clone(), &p);
    }

    clear_cache();
    let state = state.0.lock()?;
    emit_state(&app, &state);
    Ok(())
}

pub async fn open_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<(), AppError> {
    // Virtual editor tabs (settings / subagent / design preview) are not real files.
    let is_virtual = path.starts_with("shape://");
    if !is_virtual {
        // Refuse to open missing paths as tabs (avoids broken "file not found" panes).
        let meta = std::fs::metadata(&path).map_err(|_| {
            AppError::Message(format!("File not found: {}", path))
        })?;
        if !meta.is_file() {
            return Err(AppError::Message(format!("Not a file: {}", path)));
        }
    }

    let mut state = state.0.lock()?;
    
    let mut normalized_request = path.replace("\\", "/");
    #[cfg(target_os = "windows")]
    { normalized_request = normalized_request.to_lowercase(); }

    let mut existing_path = None;
    for f in &state.open_files {
        let mut f_normalized = f.path.replace("\\", "/");
        #[cfg(target_os = "windows")]
        { f_normalized = f_normalized.to_lowercase(); }
        
        if f_normalized == normalized_request {
            existing_path = Some(f.path.clone());
            break;
        }
    }

    let was_new = existing_path.is_none();
    let project_for_stats = state.project_path.clone();
    let final_path = if let Some(p) = existing_path {
        p
    } else {
        state.open_files.push(FileInfo {
            path: path.clone(),
            name,
            is_dirty: false,
            is_pinned: false,
            kind: crate::app_state::FileKind::Text,
            diff_metadata: None,
        });
        path
    };

    state.active_file = Some(final_path);
    emit_state(&app, &state);
    if was_new {
        if let Some(project) = project_for_stats {
            crate::commands::stats::bump_event(&project, "user_files_opened");
        }
    }
    Ok(())
}

pub async fn close_file(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    let mut state = state.0.lock()?;
    if let Some(pos) = state.open_files.iter().position(|f| f.path == path) {
        state.open_files.remove(pos);
    }

    if state.active_file.as_ref() == Some(&path) {
        state.active_file = state.open_files.last().map(|f| f.path.clone());
    }
    emit_state(&app, &state);
    Ok(())
}

pub async fn close_all_files(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    let mut state = state.0.lock()?;
    state.open_files.clear();
    state.active_file = None;
    emit_state(&app, &state);
    Ok(())
}

pub async fn set_active_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), AppError> {
    let mut state = state.0.lock()?;
    state.active_file = Some(path);
    emit_state(&app, &state);
    Ok(())
}

pub async fn reorder_files(
    app: AppHandle,
    state: State<'_, AppState>,
    files: Vec<FileInfo>,
) -> Result<(), AppError> {
    let mut state = state.0.lock()?;
    state.open_files = files;
    emit_state(&app, &state);
    Ok(())
}

pub async fn get_rust_deps(project_path: String) -> Result<Vec<(String, String)>, AppError> {
    tokio::task::spawn_blocking(move || {
        let cargo_path = format!("{}/Cargo.toml", project_path);
        if !std::path::Path::new(&cargo_path).exists() {
            return Ok(vec![]);
        }
        let content = fs::read_to_string(cargo_path).map_err(|e| AppError::Io(e))?;

        let mut deps = Vec::new();
        let mut in_deps = false;
        for line in content.lines() {
            let line = line.trim();
            if line == "[dependencies]" {
                in_deps = true;
                continue;
            }
            if line.starts_with('[') {
                in_deps = false;
            }
            if in_deps && !line.is_empty() {
                if let Some((name, version)) = line.split_once('=') {
                    deps.push((
                        name.trim().to_string(),
                        version.trim().trim_matches('"').to_string(),
                    ));
                }
            }
        }
        Ok(deps)
    })
    .await
    .map_err(|e| AppError::Message(format!("Worker thread panicked: {}", e)))?
}

pub async fn get_project_state(state: State<'_, AppState>) -> Result<ProjectState, AppError> {
    let state = state.0.lock()?;
    // complex types need Clone or to be recreated
    Ok(ProjectState {
        project_path: state.project_path.clone(),
        open_files: state.open_files.clone(),
        active_file: state.active_file.clone(),
        diagnostics: state.diagnostics.clone(),
        color_history: state.color_history.clone(),
    })
}

pub async fn set_diagnostics(
    state: State<'_, AppState>,
    path: String,
    diagnostics: Vec<crate::app_state::Diagnostic>,
) -> Result<(), AppError> {
    let mut state = state.0.lock()?;
    state.diagnostics.insert(path, diagnostics);
    Ok(())
}

pub async fn search_project_files(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, AppError> {
    let project_root = {
        let state_guard = state.0.lock()?;
        state_guard
            .project_path
            .as_ref()
            .ok_or_else(|| AppError::Message("No project is open".to_string()))?
            .clone()
    };

    tokio::task::spawn_blocking(move || {
        ensure_cache(&project_root)?;

        let cache_guard = fs_cache().lock()?;
        let cache = cache_guard
            .as_ref()
            .ok_or_else(|| AppError::Message("Index cache unavailable".to_string()))?;

        let max_results = limit.unwrap_or(100).clamp(1, 500);
        let query_trimmed = query.trim();

        if query_trimmed.is_empty() {
            let mut initial = Vec::with_capacity(max_results);
            for rel in cache.file_rel_paths.iter().take(max_results) {
                if let Some(abs) = cache.file_rel_to_abs.get(rel) {
                    initial.push(SearchResult {
                        name: rel.rsplit('/').next().unwrap_or(rel).to_string(),
                        path: abs.clone(),
                        relative_path: rel.clone(),
                        score: 0,
                    });
                }
            }
            return Ok(initial);
        }

        let mut rg_hits: HashSet<String> = HashSet::new();
        let mut rg_cmd = Command::new("rg");
        rg_cmd.current_dir(&project_root)
            .arg("--files-with-matches")
            .arg("--max-count")
            .arg("1")
            .arg("--fixed-strings")
            .arg("--ignore-case")
            .arg("--glob")
            .arg("!.git")
            .arg("--glob")
            .arg("!node_modules")
            .arg("--")
            .arg(query_trimmed)
            .arg(".");
            
        #[cfg(windows)]
        rg_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            
        let rg_out = rg_cmd.output();

        if let Ok(out) = rg_out {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                for line in text.lines() {
                    let normalized = line.trim_start_matches("./").replace('\\', "/");
                    if !normalized.is_empty() {
                        rg_hits.insert(normalized);
                    }
                }
            }
        }

        let mut lower_paths: Vec<String> = cache
            .file_rel_paths
            .iter()
            .map(|p| p.to_lowercase())
            .collect();
        lower_paths.sort_unstable();
        lower_paths.dedup();

        let query_lower = query_trimmed.to_lowercase();
        let prefix = query_lower
            .split_whitespace()
            .next()
            .unwrap_or_default()
            .chars()
            .take(3)
            .collect::<String>();

        let narrowed: HashSet<String> = if !prefix.is_empty() {
            if let Ok(set) = Set::from_iter(lower_paths.iter()) {
                let automaton = Str::new(&prefix).starts_with();
                let mut stream = set.search(automaton).into_stream();
                let mut out = HashSet::new();
                while let Some(bytes) = stream.next() {
                    if let Ok(s) = String::from_utf8(bytes.to_vec()) {
                        out.insert(s);
                    }
                }
                out
            } else {
                HashSet::new()
            }
        } else {
            HashSet::new()
        };

        let candidate_rel: Vec<String> = if narrowed.is_empty() {
            cache.file_rel_paths.clone()
        } else {
            cache
                .file_rel_paths
                .iter()
                .filter(|rel| narrowed.contains(&rel.to_lowercase()))
                .cloned()
                .collect()
        };

        let candidate_refs: Vec<&str> = candidate_rel.iter().map(String::as_str).collect();
        let mut matcher = Matcher::new(MatcherConfig::DEFAULT.match_paths());
        let mut fuzzy = Pattern::parse(query_trimmed, CaseMatching::Ignore, Normalization::Smart)
            .match_list(candidate_refs, &mut matcher);

        fuzzy.sort_unstable_by(|a, b| b.1.cmp(&a.1));

        let mut results = Vec::with_capacity(max_results);
        for (relative_path, fuzzy_score) in fuzzy.into_iter().take(max_results * 3) {
            if let Some(abs) = cache.file_rel_to_abs.get(relative_path) {
                let basename = relative_path.rsplit('/').next().unwrap_or(relative_path);
                let rg_bonus = if rg_hits.contains(relative_path) {
                    1_000_i64
                } else {
                    0_i64
                };
                results.push(SearchResult {
                    name: basename.to_string(),
                    path: abs.clone(),
                    relative_path: relative_path.to_string(),
                    score: i64::from(fuzzy_score) + rg_bonus,
                });
            }

            if results.len() >= max_results {
                break;
            }
        }

        results.sort_unstable_by(|a, b| b.score.cmp(&a.score));
        Ok(results)
    })
    .await
    .map_err(|e| AppError::Message(format!("Worker thread panicked: {}", e)))?
}

pub async fn search_content(
    state: State<'_, AppState>,
    query: String,
    options: SearchOptions,
) -> Result<Vec<ContentSearchResult>, AppError> {
    let project_root = {
        let state_guard = state.0.lock()?;
        state_guard
            .project_path
            .as_ref()
            .ok_or_else(|| AppError::Message("No project is open".to_string()))?
            .clone()
    };

    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    tokio::task::spawn_blocking(move || {
        ensure_cache(&project_root)?;
        
        let mut args = vec![
            "--json".to_string(),
            "--column".to_string(),
            "--max-columns".to_string(),
            "500".to_string(),
            "--max-columns-preview".to_string(),
        ];

        if !options.case_sensitive {
            args.push("--ignore-case".to_string());
        }
        if options.whole_word {
            args.push("--word-regexp".to_string());
        }
        if !options.is_regex {
            args.push("--fixed-strings".to_string());
        }
        if !options.respect_gitignore {
            args.push("--no-ignore".to_string());
        }
        if options.include_hidden {
            args.push("--hidden".to_string());
        }
        if options.follow_symlinks {
            args.push("--follow".to_string());
        }

        if let Some(include) = &options.include_pattern {
            if !include.trim().is_empty() {
                for pattern in include.split(',') {
                    let trimmed = pattern.trim();
                    if !trimmed.is_empty() {
                        args.push("--glob".to_string());
                        args.push(trimmed.to_string());
                    }
                }
            }
        }
        if let Some(exclude) = &options.exclude_pattern {
            if !exclude.trim().is_empty() {
                for pattern in exclude.split(',') {
                    let trimmed = pattern.trim();
                    if !trimmed.is_empty() {
                        args.push("--glob".to_string());
                        args.push(format!("!{}", trimmed));
                    }
                }
            }
        } else if options.respect_gitignore {
            // Default excludes only if we are respecting ignore rules and no specific excludes provided
            args.push("--glob".to_string());
            args.push("!.git/*".to_string());
            args.push("--glob".to_string());
            args.push("!node_modules/*".to_string());
        }
        
        // --- Added the 5 general filters ---
        let mut exclusions = Vec::new();
        if options.exclude_tests {
            exclusions.extend(vec!["*test*", "*spec*", "tests/", "__tests__/", "test/"]);
        }
        if options.exclude_docs {
            exclusions.extend(vec!["*docs*", "*.md", "*.txt", "docs/", "doc/"]);
        }
        if options.exclude_build {
            exclusions.extend(vec!["build/", "dist/", "target/", "out/", ".next/", "node_modules/"]);
        }
        if options.exclude_assets {
            exclusions.extend(vec!["*.png", "*.jpg", "*.jpeg", "*.gif", "*.svg", "*.ico", "*.webp", "*.avif", "*.woff", "*.woff2", "*.ttf", "*.eot", "*.mp4", "*.webm", "*.mp3", "*.wav"]);
        }
        if options.only_source {
            exclusions.extend(vec!["*.json", "*.yaml", "*.yml", "*.toml", "*.xml", "*.csv", "*.lock", "*lock.json"]);
        }
        
        for excl in &exclusions {
            args.push("--glob".to_string());
            args.push(format!("!{}", excl));
        }

        if !options.respect_gitignore {
            args.push("--glob".to_string());
            args.push("!node_modules/*".to_string());
        }

        args.push("-m".to_string());
        args.push("50".to_string());
        args.push("--".to_string());
        args.push(query.clone());
        args.push(".".to_string());

        let mut rg_cmd = Command::new("rg");
        rg_cmd.current_dir(&project_root)
            .args(&args);
            
        #[cfg(windows)]
        rg_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            
        let output = match rg_cmd.output() {
            Ok(out) => out,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // FALLBACK TO GIT GREP
                let mut git_cmd = crate::core::git_bin::git_command().map_err(|e| {
                    std::io::Error::new(std::io::ErrorKind::NotFound, e.to_string())
                })?;
                git_cmd.current_dir(&project_root)
                    .arg("grep")
                    .arg("-I") // ignore binaries
                    .arg("-n")
                    .arg("--column");
                
                if !options.case_sensitive {
                    git_cmd.arg("-i");
                }
                if options.whole_word {
                    git_cmd.arg("-w");
                }
                git_cmd.arg("-e").arg(&query);

                git_cmd.arg("--");

                if let Some(include) = &options.include_pattern {
                    if !include.trim().is_empty() {
                        for pattern in include.split(',') {
                            let trimmed = pattern.trim();
                            if !trimmed.is_empty() {
                                git_cmd.arg(trimmed);
                            }
                        }
                    }
                }

                // For git grep, path exclusion uses `:^pattern`
                for excl in &exclusions {
                    git_cmd.arg(format!(":^{}", excl));
                }

                #[cfg(windows)]
                git_cmd.creation_flags(0x08000000);

                let git_out = git_cmd.output().map_err(|err| {
                    AppError::Message(format!("ripgrep not installed, and git grep failed: {}", err))
                })?;

                if !git_out.status.success() {
                    // FALLBACK TO PURE RUST FS SEARCH FOR NON-GIT FOLDERS
                    let mut parse_results: std::collections::HashMap<String, ContentSearchResult> = std::collections::HashMap::new();
                    let mut total_matches = 0;
                    
                    if let Ok(cache_guard) = fs_cache().lock() {
                        if let Some(cache) = cache_guard.as_ref() {
                            let query_lower = query.to_lowercase();
                            let exc_tests = options.exclude_tests;
                            let exc_docs = options.exclude_docs;
                            let exc_build = options.exclude_build;
                            let exc_assets = options.exclude_assets;
                            let exc_source = options.only_source;
                            
                            let inc_patterns: Vec<String> = if let Some(inc) = &options.include_pattern {
                                inc.split(',').map(|s| s.trim().to_lowercase().replace("*", "")).filter(|s| !s.is_empty()).collect()
                            } else {
                                Vec::new()
                            };

                            for (rel_path, abs_path) in cache.file_rel_to_abs.iter() {
                                if total_matches >= 3000 { break; }
                                
                                let lower_path = rel_path.to_lowercase();
                                
                                if !inc_patterns.is_empty() {
                                    let mut matched = false;
                                    for pat in &inc_patterns {
                                        if lower_path.contains(pat) || lower_path.ends_with(pat) {
                                            matched = true;
                                            break;
                                        }
                                    }
                                    if !matched { continue; }
                                }
                                
                                if exc_tests && (lower_path.contains("test") || lower_path.contains("spec")) { continue; }
                                if exc_docs && (lower_path.contains("docs") || lower_path.ends_with(".md") || lower_path.ends_with(".txt")) { continue; }
                                if exc_build && (lower_path.contains("build/") || lower_path.contains("dist/") || lower_path.contains("target/") || lower_path.contains(".next/")) { continue; }
                                if exc_assets && (lower_path.ends_with(".png") || lower_path.ends_with(".jpg") || lower_path.ends_with(".svg") || lower_path.ends_with(".ico") || lower_path.ends_with(".mp4")) { continue; }
                                if exc_source && (lower_path.ends_with(".json") || lower_path.ends_with(".yaml") || lower_path.ends_with(".toml") || lower_path.ends_with(".lock")) { continue; }
                                
                                if let Ok(content) = std::fs::read_to_string(abs_path) {
                                    for (line_idx, line) in content.lines().enumerate() {
                                        let line_match = if !options.case_sensitive {
                                            line.to_lowercase().find(&query_lower)
                                        } else {
                                            line.find(&query)
                                        };
                                        
                                        if let Some(col_start) = line_match {
                                            let entry = parse_results.entry(rel_path.to_string()).or_insert_with(|| {
                                                ContentSearchResult {
                                                    path: abs_path.clone(),
                                                    relative_path: rel_path.clone(),
                                                    matches: Vec::new(),
                                                }
                                            });
                                            entry.matches.push(ContentMatch {
                                                line_number: line_idx + 1,
                                                line_text: line.to_string(),
                                                column_start: col_start,
                                                column_end: col_start + query.len(),
                                            });
                                            total_matches += 1;
                                            if total_matches >= 3000 { break; }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    return Ok(parse_results.into_values().collect());
                }

                let stdout = String::from_utf8_lossy(&git_out.stdout);
                let mut results: std::collections::HashMap<String, ContentSearchResult> = std::collections::HashMap::new();
                let mut total_matches = 0;
                let root_path = Path::new(&project_root);
                
                for line in stdout.lines() {
                    if total_matches >= 3000 { break; }
                    // Format: filepath:line:column:content
                    let parts: Vec<&str> = line.splitn(4, ':').collect();
                    if parts.len() >= 4 {
                        let rel_path = parts[0];
                        let line_num: usize = parts[1].parse().unwrap_or(0);
                        let col_num: usize = parts[2].parse().unwrap_or(1);
                        let content = parts[3];

                        let entry = results.entry(rel_path.to_string()).or_insert_with(|| {
                            let abs_path = root_path.join(rel_path).to_string_lossy().to_string();
                            ContentSearchResult {
                                path: abs_path,
                                relative_path: rel_path.to_string(),
                                matches: Vec::new(),
                            }
                        });

                        entry.matches.push(ContentMatch {
                            line_number: line_num,
                            line_text: content.to_string(),
                            column_start: col_num.saturating_sub(1),
                            column_end: col_num.saturating_sub(1) + query.len(),
                        });
                        total_matches += 1;
                    }
                }
                return Ok(results.into_values().collect());
            }
            Err(e) => return Err(AppError::Message(format!("Failed to execute ripgrep: {}", e))),
        };

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut results: Vec<ContentSearchResult> = Vec::new();
        let mut current_file_result: Option<ContentSearchResult> = None;

        let root_path = Path::new(&project_root);

        let mut total_matches = 0;
        const MAX_MATCHES: usize = 3000;

        for line in stdout.lines() {
            if total_matches >= MAX_MATCHES {
                break;
            }
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
                match value["type"].as_str() {
                    Some("begin") => {
                        let path = value["data"]["path"]["text"].as_str().unwrap_or_default();
                        let abs_path = root_path.join(path).to_string_lossy().to_string();
                        current_file_result = Some(ContentSearchResult {
                            path: abs_path,
                            relative_path: path.to_string(),
                            matches: Vec::new(),
                        });
                    }
                    Some("match") => {
                        if let Some(ref mut file_result) = current_file_result {
                            let line_number =
                                value["data"]["line_number"].as_u64().unwrap_or(0) as usize;
                            let line_text = value["data"]["lines"]["text"]
                                .as_str()
                                .unwrap_or_default()
                                .trim_end()
                                .to_string();

                            if let Some(submatches) = value["data"]["submatches"].as_array() {
                                for submatch in submatches {
                                    let start = submatch["start"].as_u64().unwrap_or(0) as usize;
                                    let end = submatch["end"].as_u64().unwrap_or(0) as usize;
                                    file_result.matches.push(ContentMatch {
                                        line_number,
                                        line_text: line_text.clone(),
                                        column_start: start,
                                        column_end: end,
                                    });
                                    total_matches += 1;
                                    if total_matches >= MAX_MATCHES {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    Some("end") => {
                        if let Some(file_result) = current_file_result.take() {
                            if !file_result.matches.is_empty() {
                                results.push(file_result);
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        
        if let Some(file_result) = current_file_result.take() {
            if !file_result.matches.is_empty() {
                results.push(file_result);
            }
        }
        
        Ok(results)
    })
    .await
    .map_err(|e| AppError::Message(format!("Worker thread panicked: {}", e)))?
}

pub async fn replace_content(
    app: AppHandle,
    state: State<'_, AppState>,
    query: String,
    replacement: String,
    options: SearchOptions,
    single_match: Option<ContentMatch>,
    single_file_path: Option<String>,
) -> Result<ReplaceResult, AppError> {
    if query.trim().is_empty() {
        return Ok(ReplaceResult {
            files_modified: 0,
            replacements_count: 0,
            errors: Vec::new(),
        });
    }

    let search_results = search_content(state, query, options).await?;

    let mut files_modified = 0usize;
    let mut replacements_count = 0usize;
    let mut errors = Vec::new();

    for file_result in search_results {
        if let Some(ref target_path) = single_file_path {
            if file_result.path != *target_path && file_result.relative_path != *target_path {
                continue;
            }
        }

        let matches: Vec<ContentMatch> = if let Some(ref single) = single_match {
            file_result
                .matches
                .iter()
                .filter(|m| {
                    m.line_number == single.line_number
                        && m.column_start == single.column_start
                        && m.column_end == single.column_end
                })
                .cloned()
                .take(1)
                .collect()
        } else {
            file_result.matches.clone()
        };

        if matches.is_empty() {
            continue;
        }

        let path = file_result.path.clone();
        match tokio::fs::read_to_string(&path).await {
            Ok(content) => {
                let (new_content, count) =
                    apply_replacements_to_content(&content, &matches, &replacement);
                if count == 0 {
                    continue;
                }
                match save_file(app.clone(), path.clone(), new_content).await {
                    Ok(()) => {
                        let _ = app.emit("shape-file-edited", &path);
                        files_modified += 1;
                        replacements_count += count;
                    }
                    Err(e) => errors.push(format!("{}: {}", path, e)),
                }
            }
            Err(e) => errors.push(format!("{}: {}", path, e)),
        }

        if single_match.is_some() {
            break;
        }
    }

    Ok(ReplaceResult {
        files_modified,
        replacements_count,
        errors,
    })
}

pub fn close_active_file_helper(app: &AppHandle) -> Result<(), AppError> {
    let state_mutex = app.state::<AppState>();
    let mut state = state_mutex.0.lock()?;

    if let Some(active_path) = state.active_file.clone() {
        if let Some(pos) = state.open_files.iter().position(|f| f.path == active_path) {
            state.open_files.remove(pos);
        }
        // Logic to select next file
        state.active_file = state.open_files.last().map(|f| f.path.clone());

        let _ = app.emit("project-state-update", &*state);
    }
    Ok(())
}

pub fn close_all_files_helper(app: &AppHandle) -> Result<(), AppError> {
    let state_mutex = app.state::<AppState>();
    let mut state = state_mutex.0.lock()?;
    state.open_files.clear();
    state.active_file = None;
    let _ = app.emit("project-state-update", &*state);
    Ok(())
}
