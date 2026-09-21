use crate::commands::history::{
    get_file_history, restore_history_version, HistoryEntry,
};
use crate::core::error::AppError;
use crate::core::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_file_history_command(
    state: State<AppState>,
    file_path: String,
) -> Result<Vec<HistoryEntry>, AppError> {
    let project_path = state
        .0
        .lock()
        .map_err(|e| AppError::Poison(e.to_string()))?
        .project_path
        .clone()
        .ok_or_else(|| AppError::Message("No project open".to_string()))?;
    get_file_history(&project_path, &file_path)
}

#[tauri::command]
pub fn restore_history_version_command(
    state: State<AppState>,
    file_path: String,
    version_id: String,
) -> Result<String, AppError> {
    let project_path = state
        .0
        .lock()
        .map_err(|e| AppError::Poison(e.to_string()))?
        .project_path
        .clone()
        .ok_or_else(|| AppError::Message("No project open".to_string()))?;
    restore_history_version(&project_path, &file_path, &version_id)
}
