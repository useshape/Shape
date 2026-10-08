//! Fast local map of the repo for the coding agent. No extra model calls.

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

use crate::agent::tools::dispatch::ToolCtx;

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

const INDEXABLE: &[&str] = &[
    "rs", "ts", "tsx", "js", "jsx", "py", "go", "java", "c", "cpp", "h", "md", "json",
];

const MAX_FILES: usize = 6_000;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct OverviewStore {
    areas: Vec<AreaDigest>,
    file_stamps: HashMap<String, u64>,
    updated_at: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct AreaDigest {
    name: String,
    purpose: String,
    entry_points: Vec<String>,
    important_files: Vec<String>,
    related: Vec<String>,
}

fn storage_dir(project_path: &str) -> PathBuf {
    let mut hash: u64 = 5381;
    for b in project_path.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(b as u64);
    }
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("shape-index")
        .join(format!("{:016x}", hash))
}

fn store_path(project_path: &str) -> PathBuf {
    storage_dir(project_path).join("overview.json")
}

fn load_store(project_path: &str) -> OverviewStore {
    std::fs::read_to_string(store_path(project_path))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_store(project_path: &str, store: &OverviewStore) {
    let path = store_path(project_path);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(store) {
        let _ = std::fs::write(path, json);
    }
}

fn should_skip(path: &Path, root: &Path) -> bool {
    if path == root {
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

fn stamp(path: &Path) -> u64 {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| {
            let modified = m.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs();
            Some(modified.wrapping_mul(33).wrapping_add(m.len()))
        })
        .unwrap_or(0)
}

fn area_name(rel: &str) -> String {
    let trimmed = rel.trim_start_matches(['/', '\\']);
    let first = trimmed
        .split(['/', '\\'])
        .next()
        .unwrap_or("root")
        .trim();
    if first.is_empty() || first.contains('.') {
        "root".to_string()
    } else {
        first.to_string()
    }
}

fn collect_files(project_path: &str) -> HashMap<String, Vec<(String, u64)>> {
    let root = PathBuf::from(project_path);
    let mut areas: HashMap<String, Vec<(String, u64)>> = HashMap::new();
    let mut counted = 0usize;
    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !should_skip(e.path(), &root))
        .flatten()
    {
        if counted >= MAX_FILES {
            break;
        }
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        if !INDEXABLE.contains(&ext.as_str()) {
            continue;
        }
        let rel = path
            .strip_prefix(&root)
            .ok()
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        if rel.is_empty() {
            continue;
        }
        let area = area_name(&rel);
        areas.entry(area).or_default().push((rel, stamp(path)));
        counted += 1;
    }
    areas
}

fn area_changed(store: &OverviewStore, files: &[(String, u64)]) -> bool {
    files
        .iter()
        .any(|(path, hash)| store.file_stamps.get(path) != Some(hash))
}

fn looks_like_entry(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path).to_ascii_lowercase();
    matches!(
        name.as_str(),
        "mod.rs"
            | "lib.rs"
            | "main.rs"
            | "main.ts"
            | "main.tsx"
            | "index.ts"
            | "index.tsx"
            | "index.js"
            | "app.tsx"
            | "page.tsx"
            | "layout.tsx"
    ) || name.starts_with("main.")
}

fn local_digest(name: &str, files: &[(String, u64)]) -> AreaDigest {
    let mut entries: Vec<String> = files
        .iter()
        .filter(|(p, _)| looks_like_entry(p))
        .map(|(p, _)| p.clone())
        .take(8)
        .collect();
    if entries.is_empty() {
        entries = files.iter().take(4).map(|(p, _)| p.clone()).collect();
    }
    let important: Vec<String> = files.iter().take(10).map(|(p, _)| p.clone()).collect();
    AreaDigest {
        name: name.to_string(),
        purpose: format!("{} files under `{name}/`.", files.len()),
        entry_points: entries,
        important_files: important,
        related: Vec::new(),
    }
}

fn ensure_overview(ctx: &ToolCtx<'_>) -> OverviewStore {
    let mut store = load_store(ctx.project_path);
    let areas = collect_files(ctx.project_path);
    let mut next_stamps = HashMap::new();
    let mut next_areas: Vec<AreaDigest> = Vec::new();
    for (name, files) in &areas {
        for (path, hash) in files {
            next_stamps.insert(path.clone(), *hash);
        }
        let existing = store.areas.iter().find(|a| a.name == *name).cloned();
        if let Some(area) = existing {
            if !area_changed(&store, files) {
                next_areas.push(area);
                continue;
            }
        }
        next_areas.push(local_digest(name, files));
    }
    next_areas.sort_by(|a, b| a.name.cmp(&b.name));
    store.areas = next_areas;
    store.file_stamps = next_stamps;
    store.updated_at = crate::agent::commands::history::now_f64();
    save_store(ctx.project_path, &store);
    store
}

fn query_overview(store: &OverviewStore, query: &str) -> String {
    let q = query.to_ascii_lowercase();
    let mut scored: Vec<(&AreaDigest, i32)> = store
        .areas
        .iter()
        .map(|area| {
            let blob = format!(
                "{} {} {} {} {}",
                area.name,
                area.purpose,
                area.entry_points.join(" "),
                area.important_files.join(" "),
                area.related.join(" ")
            )
            .to_ascii_lowercase();
            let mut score = 0;
            for token in q.split_whitespace() {
                if blob.contains(token) {
                    score += 2;
                }
                if area.name.to_ascii_lowercase() == token {
                    score += 5;
                }
            }
            (area, score)
        })
        .collect();
    scored.sort_by(|a, b| b.1.cmp(&a.1));
    let hits: Vec<&AreaDigest> = if scored.iter().any(|(_, s)| *s > 0) {
        scored
            .into_iter()
            .filter(|(_, s)| *s > 0)
            .take(6)
            .map(|(a, _)| a)
            .collect()
    } else {
        store.areas.iter().take(8).collect()
    };
    json!({
        "query": query,
        "areas": hits,
    })
    .to_string()
}

pub async fn answer_overview(args: &serde_json::Value, ctx: &ToolCtx<'_>) -> Result<String, String> {
    if ctx.project_path.trim().is_empty() {
        return Err("No project is open.".to_string());
    }
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if query.is_empty() {
        return Err("query is required.".to_string());
    }
    let store = ensure_overview(ctx);
    Ok(query_overview(&store, query))
}
