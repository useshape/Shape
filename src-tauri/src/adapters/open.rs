use crate::commands::open;
use crate::core::error::AppError;

#[tauri::command]
pub fn open_url_external(url: String) -> Result<(), AppError> {
    open::open_url_external(url)
}
