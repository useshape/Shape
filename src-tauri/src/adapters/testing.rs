use crate::commands::testing::{self, TestDiscovery, TestRunSummary};
use crate::core::error::AppError;
use tauri::AppHandle;

#[tauri::command]
pub async fn discover_tests(project_path: String) -> Result<TestDiscovery, AppError> {
    testing::discover_tests(project_path).map_err(AppError::from)
}

#[tauri::command]
pub async fn run_tests(
    app: AppHandle,
    project_path: String,
    framework: String,
    pattern: Option<String>,
) -> Result<TestRunSummary, AppError> {
    testing::run_tests(app, project_path, framework, pattern)
        .await
        .map_err(AppError::from)
}
