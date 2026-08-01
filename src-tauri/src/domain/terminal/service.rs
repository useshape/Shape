use crate::commands::pty;
use crate::core::error::AppError;

pub use crate::commands::pty::PtyState;
pub use crate::commands::pty::ShellProfile;

pub async fn pty_available_shells() -> Result<Vec<ShellProfile>, AppError> {
    tauri::async_runtime::spawn_blocking(pty::pty_available_shells)
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

pub async fn pty_spawn(
    app: tauri::AppHandle,
    state: tauri::State<'_, PtyState>,
    cwd: Option<String>,
    shell: Option<String>,
    client_id: Option<u32>,
    rows: u16,
    cols: u16,
) -> Result<u32, AppError> {
    pty::pty_spawn(app, state, cwd, shell, client_id, rows, cols).await
}

pub async fn pty_write(
    state: tauri::State<'_, PtyState>,
    id: u32,
    data: String,
) -> Result<(), AppError> {
    pty::pty_write(state, id, data).await
}

pub async fn pty_resize(
    state: tauri::State<'_, PtyState>,
    id: u32,
    rows: u16,
    cols: u16,
) -> Result<(), AppError> {
    pty::pty_resize(state, id, rows, cols).await
}

pub async fn pty_kill(state: tauri::State<'_, PtyState>, id: u32) -> Result<(), AppError> {
    pty::pty_kill(state, id).await
}

pub async fn pty_kill_all(state: tauri::State<'_, PtyState>) -> Result<(), AppError> {
    pty::pty_kill_all(state).await
}
