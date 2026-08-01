use crate::core::error::AppError;
use crate::domain::terminal::service::{self, PtyState, ShellProfile};

#[tauri::command]
pub async fn pty_available_shells() -> Result<Vec<ShellProfile>, AppError> {
    service::pty_available_shells().await
}

#[tauri::command]
pub async fn pty_spawn(
    app: tauri::AppHandle,
    state: tauri::State<'_, PtyState>,
    cwd: Option<String>,
    shell: Option<String>,
    client_id: Option<u32>,
    rows: u16,
    cols: u16,
) -> Result<u32, AppError> {
    service::pty_spawn(app, state, cwd, shell, client_id, rows, cols).await
}

#[tauri::command]
pub async fn pty_write(
    state: tauri::State<'_, PtyState>,
    id: u32,
    data: String,
) -> Result<(), AppError> {
    service::pty_write(state, id, data).await
}

#[tauri::command]
pub async fn pty_resize(
    state: tauri::State<'_, PtyState>,
    id: u32,
    rows: u16,
    cols: u16,
) -> Result<(), AppError> {
    service::pty_resize(state, id, rows, cols).await
}

#[tauri::command]
pub async fn pty_kill(state: tauri::State<'_, PtyState>, id: u32) -> Result<(), AppError> {
    service::pty_kill(state, id).await
}

#[tauri::command]
pub async fn pty_kill_all(state: tauri::State<'_, PtyState>) -> Result<(), AppError> {
    service::pty_kill_all(state).await
}
