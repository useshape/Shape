use crate::commands::fs;
use crate::core::error::AppError;
use crate::core::state::{AppState, FileInfo, ProjectState};
use tauri::{AppHandle, State};

pub use crate::commands::fs::{ContentSearchResult, FileEntry, ReplaceResult, SearchOptions, SearchResult};

pub async fn ls_dir(path: String) -> Result<Vec<FileEntry>, AppError> {
    fs::ls_dir(path).await
}

pub async fn read_file(path: String) -> Result<String, AppError> {
    fs::read_file(path).await
}

pub async fn read_file_bytes(path: String) -> Result<Vec<u8>, AppError> {
    fs::read_file_bytes(path).await
}

pub async fn create_file(path: String) -> Result<(), AppError> {
    fs::create_file(path).await
}

pub async fn create_dir(path: String) -> Result<(), AppError> {
    fs::create_dir(path).await
}

pub async fn delete_path(path: String) -> Result<(), AppError> {
    fs::delete_path(path).await
}

pub async fn trash_path(path: String) -> Result<(), AppError> {
    fs::trash_path(path).await
}

pub async fn rename_path(
    app: AppHandle,
    state: State<'_, AppState>,
    old_path: String,
    new_path: String,
) -> Result<(), AppError> {
    fs::rename_path(app, state, old_path, new_path).await
}

pub async fn pin_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    pinned: bool,
) -> Result<(), AppError> {
    fs::pin_file(app, state, path, pinned).await
}

pub async fn close_to_right(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), AppError> {
    fs::close_to_right(app, state, path).await
}

pub async fn close_saved(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    fs::close_saved(app, state).await
}

pub async fn copy_path(old_path: String, new_path: String) -> Result<(), AppError> {
    fs::copy_path(old_path, new_path).await
}

pub async fn reveal_path(path: String) -> Result<(), AppError> {
    fs::reveal_path(path).await
}

pub async fn save_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), AppError> {
    fs::save_file(app, path, content).await
}

pub async fn save_file_bytes(app: tauri::AppHandle, path: String, bytes: Vec<u8>) -> Result<(), AppError> {
    fs::save_file_bytes(app, path, bytes).await
}

pub async fn mark_file_dirty(app: tauri::AppHandle, path: String, dirty: bool) -> Result<(), AppError> {
    fs::mark_file_dirty(app, path, dirty).await
}

pub async fn set_project_path(
    app: AppHandle,
    state: State<'_, AppState>,
    agent_state: State<'_, crate::agent::models::AgentState>,
    path: Option<String>,
) -> Result<(), AppError> {
    fs::set_project_path(app, state, agent_state, path).await
}

pub async fn open_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<(), AppError> {
    fs::open_file(app, state, path, name).await
}

pub async fn close_file(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    fs::close_file(app, state, path).await
}

pub async fn close_all_files(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    fs::close_all_files(app, state).await
}

pub async fn set_active_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), AppError> {
    fs::set_active_file(app, state, path).await
}

pub async fn reorder_files(
    app: AppHandle,
    state: State<'_, AppState>,
    files: Vec<FileInfo>,
) -> Result<(), AppError> {
    fs::reorder_files(app, state, files).await
}

pub async fn get_rust_deps(project_path: String) -> Result<Vec<(String, String)>, AppError> {
    fs::get_rust_deps(project_path).await
}

pub async fn get_project_state(state: State<'_, AppState>) -> Result<ProjectState, AppError> {
    fs::get_project_state(state).await
}

pub async fn search_project_files(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, AppError> {
    fs::search_project_files(state, query, limit).await
}

pub async fn search_content(
    state: State<'_, AppState>,
    query: String,
    options: SearchOptions,
) -> Result<Vec<ContentSearchResult>, AppError> {
    fs::search_content(state, query, options).await
}

pub async fn replace_content(
    app: AppHandle,
    state: State<'_, AppState>,
    query: String,
    replacement: String,
    options: SearchOptions,
    single_match: Option<crate::commands::fs::ContentMatch>,
    single_file_path: Option<String>,
) -> Result<ReplaceResult, AppError> {
    fs::replace_content(
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

pub async fn set_diagnostics(
    state: State<'_, AppState>,
    path: String,
    diagnostics: Vec<crate::app_state::Diagnostic>,
) -> Result<(), AppError> {
    fs::set_diagnostics(state, path, diagnostics).await
}

pub fn close_active_file_helper(app: &AppHandle) -> Result<(), AppError> {
    fs::close_active_file_helper(app)
}

pub fn close_all_files_helper(app: &AppHandle) -> Result<(), AppError> {
    fs::close_all_files_helper(app)
}
