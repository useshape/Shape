//! Token-budget repo map from open-file outlines + retrieval hits.

use crate::commands::outline::get_outline;
use std::collections::HashSet;
use std::path::Path;

/// Compact symbol outline for open files — tuned for token efficiency.
pub const DEFAULT_REPO_MAP_TOKENS: usize = 768;

pub fn estimate_tokens(text: &str) -> usize {
    (text.chars().count() + 3) / 4
}

pub struct RepoMapInput<'a> {
    pub open_files: &'a [String],
    pub active_file: Option<&'a str>,
    pub retrieval_files: &'a [String],
    pub token_budget: usize,
}

pub async fn build_repo_map(input: RepoMapInput<'_>) -> String {
    let mut seen = HashSet::new();
    let mut paths: Vec<String> = Vec::new();

    if let Some(active) = input.active_file {
        if seen.insert(active.to_string()) {
            paths.push(active.to_string());
        }
    }
    for p in input.open_files {
        if seen.insert(p.clone()) {
            paths.push(p.clone());
        }
    }
    for p in input.retrieval_files {
        if seen.insert(p.clone()) {
            paths.push(p.clone());
        }
    }

    let mut lines: Vec<String> = Vec::new();
    for path in paths.iter().take(24) {
        let Ok(content) = std::fs::read_to_string(path) else {
            continue;
        };
        let ext = Path::new(path)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if let Ok(outline) = get_outline(path.clone(), content, ext, 0).await {
            lines.push(format!("{path}:"));
            for sym in outline.symbols.iter().take(40) {
                lines.push(format!("  {} [{}]", sym.name, sym.kind));
            }
        }
    }

    fit_to_token_budget(&lines, input.token_budget)
}

fn fit_to_token_budget(lines: &[String], budget: usize) -> String {
    if lines.is_empty() {
        return String::new();
    }
    let mut lo = 0usize;
    let mut hi = lines.len();
    let mut best = String::new();

    while lo <= hi {
        let mid = (lo + hi) / 2;
        let candidate = lines.iter().take(mid).cloned().collect::<Vec<_>>().join("\n");
        let tokens = estimate_tokens(&candidate);
        if tokens <= budget {
            best = candidate;
            lo = mid + 1;
        } else {
            if mid == 0 {
                break;
            }
            hi = mid - 1;
        }
    }

    if best.is_empty() && !lines.is_empty() {
        let first = &lines[0];
        let max_chars = budget * 4;
        if first.chars().count() > max_chars {
            return first.chars().take(max_chars).collect();
        }
        return first.clone();
    }
    best
}

pub fn format_repo_map_section(map: &str) -> String {
    if map.trim().is_empty() {
        return String::new();
    }
    format!("=== REPO MAP ===\n{map}\n======================\n\n")
}
