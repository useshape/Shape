//! Incremental codebase overview for the main coding agent.

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

use crate::agent::commands::streaming::{self, ProxyContext};
use crate::agent::model_router;
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
    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !should_skip(e.path(), &root))
        .flatten()
    {
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
    }
    areas
}

fn area_changed(store: &OverviewStore, files: &[(String, u64)]) -> bool {
    files
        .iter()
        .any(|(path, hash)| store.file_stamps.get(path) != Some(hash))
}

fn excerpt_area(project_path: &str, files: &[(String, u64)]) -> String {
    let root = PathBuf::from(project_path);
    let mut buf = String::new();
    for (rel, _) in files.iter().take(24) {
        let path = root.join(rel);
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        let snippet: String = content.chars().take(900).collect();
        buf.push_str(&format!("### {rel}\n{snippet}\n\n"));
        if buf.len() > 14_000 {
            break;
        }
    }
    buf
}

async fn summarize_area(
    ctx: &ToolCtx<'_>,
    name: &str,
    files: &[(String, u64)],
) -> Option<AreaDigest> {
    let listing = files
        .iter()
        .take(40)
        .map(|(p, _)| format!("- {p}"))
        .collect::<Vec<_>>()
        .join("\n");
    let body = excerpt_area(ctx.project_path, files);
    let prompt = format!(
        "Summarize this codebase area for another coding agent. Return JSON only with keys: purpose (string), entry_points (string array of paths), important_files (string array), related (string array of sibling areas).\n\nArea: {name}\nFiles:\n{listing}\n\nExcerpts:\n{body}"
    );
    let proxy = ProxyContext::new("overview")
        .with_turn(ctx.turn_id.clone(), ctx.conversation_id.clone())
        .with_project_path(Some(ctx.project_path.to_string()));
    let (text, _, _) = streaming::complete_chat_with_max_tokens(
        ctx.client,
        ctx.api_key,
        &prompt,
        model_router::MODEL_OVERVIEW,
        700,
        &proxy,
    )
    .await
    .ok()?;
    let json_text = text
        .find('{')
        .and_then(|start| text.rfind('}').map(|end| &text[start..=end]))
        .unwrap_or(&text);
    let value: serde_json::Value = serde_json::from_str(json_text).ok()?;
    Some(AreaDigest {
        name: name.to_string(),
        purpose: value
            .get("purpose")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        entry_points: string_list(&value, "entry_points"),
        important_files: string_list(&value, "important_files"),
        related: string_list(&value, "related"),
    })
}

fn string_list(value: &serde_json::Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

async fn ensure_overview(ctx: &ToolCtx<'_>) -> OverviewStore {
    let mut store = load_store(ctx.project_path);
    let areas = collect_files(ctx.project_path);
    let mut next_stamps = HashMap::new();
    let mut next_areas: Vec<AreaDigest> = Vec::new();
    for (name, files) in &areas {
        for (path, hash) in files {
            next_stamps.insert(path.clone(), *hash);
        }
        let existing = store.areas.iter().find(|a| a.name == *name).cloned();
        if existing.is_some() && !area_changed(&store, files) {
            if let Some(area) = existing {
                next_areas.push(area);
                continue;
            }
        }
        if let Some(digest) = summarize_area(ctx, name, files).await {
            next_areas.push(digest);
        } else if let Some(area) = existing {
            next_areas.push(area);
        } else {
            next_areas.push(AreaDigest {
                name: name.clone(),
                purpose: format!("Source under `{name}/`."),
                entry_points: files.iter().take(4).map(|(p, _)| p.clone()).collect(),
                important_files: files.iter().take(8).map(|(p, _)| p.clone()).collect(),
                related: Vec::new(),
            });
        }
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
    let store = ensure_overview(ctx).await;
    Ok(query_overview(&store, query))
}
