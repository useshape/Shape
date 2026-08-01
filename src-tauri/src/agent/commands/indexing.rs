use crate::agent::index::{IndexState, IndexStatus, SearchHit};
use crate::app_state::AppState;
use crate::core::error::AppError;

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
    index_state: tauri::State<'_, IndexState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<SearchHit>, AppError> {
    let path = project_path
        .or_else(|| app_state.0.lock().ok()?.project_path.clone())
        .ok_or_else(|| AppError::Message("No project path".to_string()))?;
    let k = top_k.unwrap_or(8).min(20);
    index_state
        .hybrid_search(
            &path,
            &query,
            crate::agent::index::HybridOptions {
                top_k: k,
                n_retrieve: 50,
                embeddings_enabled: index_state.embeddings_enabled(),
                boost_paths: vec![],
            },
        )
        .map(|hits| {
            hits.into_iter()
                .map(|h| SearchHit {
                    file: h.file,
                    start_line: h.start_line,
                    end_line: h.end_line,
                    excerpt: h.excerpt,
                    score: h.score,
                })
                .collect()
        })
        .map_err(|e| AppError::Message(e))
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
