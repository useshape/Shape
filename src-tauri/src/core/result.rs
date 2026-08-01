use crate::core::error::AppError;

#[allow(dead_code)]
pub type AppResult<T> = Result<T, AppError>;
