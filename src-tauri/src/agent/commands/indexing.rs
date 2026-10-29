use crate::agent::index::{IndexState, IndexStatus, SearchHit};
use crate::agent::search::rg::rg_search;
use crate::app_state::AppState;
use crate::core::error::AppError;

const QUERY_STOP: &[&str] = &[
    "a", "an", "the", "of", "to", "for", "in", "on", "and", "or", "with", "that", "this",
    "how", "what", "where", "when", "who", "does", "do", "is", "are", "was", "be", "it",
    "from", "into", "about", "please", "show", "find", "me", "can", "could", "would",
];

/// Turn a sentence into the words that can match code, without a remote model.
fn local_query(query: &str) -> String {
    let kept: Vec<&str> = query
        .split_whitespace()
        .filter_map(|word| {
            let trimmed = word.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '_');
            let lower = trimmed.to_ascii_lowercase();
            if lower.len() > 1 && !QUERY_STOP.contains(&lower.as_str()) {
                Some(trimmed)
            } else {
                None
            }
        })
        .collect();
    if kept.is_empty() {
        query.trim().to_string()
    } else {
        kept.join(" ")
    }
}

fn rg_hits(path: &str, query: &str, k: usize) -> Vec<SearchHit> {
    rg_search(path, query, k)
        .into_iter()
        .map(|hit| SearchHit {
            file: hit.file,
            start_line: hit.line,
            end_line: hit.line,
            excerpt: hit.excerpt,
            score: 0.0,
        })
        .collect()
}

#[tauri::command]
pub fn index_project(
    app: tauri::AppHandle,
    project_path: Option<String>,
    access_token: Option<String>,
    index_state: tauri::State<'_, IndexState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<bool, AppError> {
    let path = project_path
        .or_else(|| app_state.0.lock().ok()?.project_path.clone())
        .ok_or_else(|| AppError::Message("No project path".to_string()))?;
    if let Some(token) = access_token.filter(|t| !t.trim().is_empty()) {
        index_state.set_api_context(Some(token), None, None);
    }
    Ok(index_state.spawn_background_index(app, path))
}

#[tauri::command]
pub fn search_codebase(
    query: String,
    top_k: Option<usize>,
    project_path: Option<String>,
    local_only: Option<bool>,
    index_state: tauri::State<'_, IndexState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<SearchHit>, AppError> {
    let path = project_path
        .or_else(|| app_state.0.lock().ok()?.project_path.clone())
        .ok_or_else(|| AppError::Message("No project path".to_string()))?;
    let k = top_k.unwrap_or(8).min(20);
    let local_only = local_only.unwrap_or(false);
    let searched = if local_only { local_query(&query) } else { query };
    let embedded = !local_only && index_state.embeddings_enabled();
    match index_state.hybrid_search(
        &path,
        &searched,
        crate::agent::index::HybridOptions {
            top_k: k,
            n_retrieve: 50,
            embeddings_enabled: embedded,
            boost_paths: vec![],
        },
    ) {
        Ok(hits) => Ok(hits
            .into_iter()
            .map(|h| SearchHit {
                file: h.file,
                start_line: h.start_line,
                end_line: h.end_line,
                excerpt: h.excerpt,
                score: h.score,
            })
            .collect()),
        Err(_) if local_only => {
            let mut hits = rg_hits(&path, &searched, k);
            if hits.is_empty() {
                if let Some(term) = searched.split_whitespace().max_by_key(|word| word.len()) {
                    hits = rg_hits(&path, term, k);
                }
            }
            Ok(hits)
        }
        Err(e) => Err(AppError::Message(e)),
    }
}

/// Toggle semantic embeddings for codebase search (BM25 keeps working either
/// way). Called by the settings UI on startup and on change.
#[tauri::command]
pub fn set_index_embeddings(
    enabled: bool,
    index_state: tauri::State<'_, IndexState>,
) -> Result<(), AppError> {
    index_state.set_embeddings_enabled(enabled);
    Ok(())
}

/// Toggle past-chat memory tools (`list_chats` / `read_chat`). Off by default.
#[tauri::command]
pub fn set_chat_memory_enabled(
    enabled: bool,
    state: tauri::State<'_, crate::agent::models::AgentState>,
) -> Result<(), AppError> {
    state.set_chat_memory_enabled(enabled);
    Ok(())
}

#[tauri::command]
pub fn get_index_status(
    project_path: Option<String>,
    index_state: tauri::State<'_, IndexState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<IndexStatus, AppError> {
    let path = project_path
        .or_else(|| app_state.0.lock().ok()?.project_path.clone())
        .ok_or_else(|| AppError::Message("No project path".to_string()))?;
    index_state
        .status(&path)
        .map_err(|e| AppError::Message(e))
}
