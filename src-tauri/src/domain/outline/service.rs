use crate::commands::outline;
use crate::core::error::AppError;

pub use crate::commands::outline::OutlineResponse;

pub async fn get_outline(
    file_path: String,
    content: String,
    extension: String,
    version: u64,
) -> Result<OutlineResponse, AppError> {
    outline::get_outline(file_path, content, extension, version).await
}
