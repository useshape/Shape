use crate::core::error::AppError;
pub use crate::domain::outline::service::{self, OutlineResponse};

#[tauri::command]
pub async fn get_outline(
    file_path: String,
    content: String,
    extension: String,
    version: u64,
) -> Result<OutlineResponse, AppError> {
    service::get_outline(file_path, content, extension, version).await
}
