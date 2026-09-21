use crate::core::error::AppError;
use crate::core::workspace_trust::WorkspaceTrustState;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub fn set_workspace_trusted(
    state: State<'_, WorkspaceTrustState>,
    path: String,
    trusted: bool,
) -> Result<(), AppError> {
    state.set_trusted(&path, trusted);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn is_workspace_trusted(
    state: State<'_, WorkspaceTrustState>,
    path: String,
) -> Result<bool, AppError> {
    Ok(state.is_trusted(&path))
}
