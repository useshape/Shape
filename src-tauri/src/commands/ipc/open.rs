use crate::commands::open;
use crate::core::error::AppError;

#[tauri::command]
pub fn open_url_external(url: String) -> Result<(), AppError> {
    open::open_url_external(url)
}

#[tauri::command]
pub fn pin_to_taskbar() -> Result<(), AppError> {
    open::pin_to_taskbar()
}
