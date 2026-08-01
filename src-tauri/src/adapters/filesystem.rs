use crate::core::error::AppError;
use crate::core::state::{AppState, FileInfo, ProjectState};
use crate::domain::filesystem::service;
use tauri::{AppHandle, State};

pub use crate::commands::fs::{ContentSearchResult, FileEntry, ReplaceResult, SearchOptions, SearchResult};

#[tauri::command]
pub async fn ls_dir(path: String) -> Result<Vec<FileEntry>, AppError> {
    service::ls_dir(path).await
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, AppError> {
    service::read_file(path).await
}

#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Vec<u8>, AppError> {
    service::read_file_bytes(path).await
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), AppError> {
    service::create_file(path).await
}

#[tauri::command]
pub async fn create_dir(path: String) -> Result<(), AppError> {
    service::create_dir(path).await
}

#[tauri::command]
pub async fn delete_path(path: String) -> Result<(), AppError> {
    service::delete_path(path).await
}

#[tauri::command]
pub async fn trash_path(path: String) -> Result<(), AppError> {
    service::trash_path(path).await
}

#[tauri::command]
pub async fn rename_path(
    app: AppHandle,
    state: State<'_, AppState>,
    old_path: String,
    new_path: String,
) -> Result<(), AppError> {
    service::rename_path(app, state, old_path, new_path).await
}

#[tauri::command]
pub async fn pin_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    pinned: bool,
) -> Result<(), AppError> {
    service::pin_file(app, state, path, pinned).await
}

#[tauri::command]
pub async fn close_to_right(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), AppError> {
    service::close_to_right(app, state, path).await
}

#[tauri::command]
pub async fn close_saved(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    service::close_saved(app, state).await
}

#[tauri::command]
pub async fn copy_path(old_path: String, new_path: String) -> Result<(), AppError> {
    service::copy_path(old_path, new_path).await
}

#[tauri::command]
pub async fn reveal_path(path: String) -> Result<(), AppError> {
    service::reveal_path(path).await
}

#[tauri::command]
pub async fn save_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), AppError> {
    service::save_file(app, path, content).await
}

#[tauri::command]
pub async fn save_file_bytes(app: tauri::AppHandle, path: String, bytes: Vec<u8>) -> Result<(), AppError> {
    service::save_file_bytes(app, path, bytes).await
}

#[tauri::command]
pub async fn mark_file_dirty(app: tauri::AppHandle, path: String, dirty: bool) -> Result<(), AppError> {
    service::mark_file_dirty(app, path, dirty).await
}

#[tauri::command]
pub async fn set_project_path(
    app: AppHandle,
    state: State<'_, AppState>,
    agent_state: State<'_, crate::agent::models::AgentState>,
    path: Option<String>,
) -> Result<(), AppError> {
    service::set_project_path(app, state, agent_state, path).await
}

#[tauri::command]
pub async fn open_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<(), AppError> {
    service::open_file(app, state, path, name).await
}

#[tauri::command]
pub async fn close_file(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    service::close_file(app, state, path).await
}

#[tauri::command]
pub async fn close_all_files(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    service::close_all_files(app, state).await
}

#[tauri::command]
pub async fn set_active_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), AppError> {
    service::set_active_file(app, state, path).await
}

#[tauri::command]
pub async fn reorder_files(
    app: AppHandle,
    state: State<'_, AppState>,
    files: Vec<FileInfo>,
) -> Result<(), AppError> {
    service::reorder_files(app, state, files).await
}

#[tauri::command]
pub async fn get_rust_deps(project_path: String) -> Result<Vec<(String, String)>, AppError> {
    service::get_rust_deps(project_path).await
}

#[tauri::command]
pub async fn get_project_state(state: State<'_, AppState>) -> Result<ProjectState, AppError> {
    service::get_project_state(state).await
}

#[tauri::command]
pub async fn search_project_files(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, AppError> {
    service::search_project_files(state, query, limit).await
}

#[tauri::command]
pub async fn search_content(
    state: State<'_, AppState>,
    query: String,
    options: SearchOptions,
) -> Result<Vec<ContentSearchResult>, AppError> {
    service::search_content(state, query, options).await
}

#[tauri::command]
pub async fn replace_content(
    app: AppHandle,
    state: State<'_, AppState>,
    query: String,
    replacement: String,
    options: SearchOptions,
    single_match: Option<crate::commands::fs::ContentMatch>,
    single_file_path: Option<String>,
) -> Result<ReplaceResult, AppError> {
    service::replace_content(
        app,
        state,
        query,
        replacement,
        options,
        single_match,
        single_file_path,
    )
    .await
}

#[tauri::command]
pub async fn set_diagnostics(
    state: State<'_, AppState>,
    path: String,
    diagnostics: Vec<crate::app_state::Diagnostic>,
) -> Result<(), AppError> {
    service::set_diagnostics(state, path, diagnostics).await
}

#[tauri::command]
pub async fn save_color_to_history(
    state: State<'_, AppState>,
    color: String,
) -> Result<(), AppError> {
    let mut p_state = state.0.lock()?;
    if p_state.color_history.last() != Some(&color) {
        p_state.color_history.push(color);
        if p_state.color_history.len() > 100 {
            p_state.color_history.remove(0);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn get_color_history(state: State<'_, AppState>) -> Result<Vec<String>, AppError> {
    let p_state = state.0.lock()?;
    Ok(p_state.color_history.clone())
}
