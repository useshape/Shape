use crate::commands::lint::{self, EslintLintResult};
use crate::core::error::AppError;
use crate::core::workspace_trust::WorkspaceTrustState;
use tauri::State;

#[tauri::command]
pub async fn eslint_lint_file(
    trust_state: State<'_, WorkspaceTrustState>,
    project_path: String,
    file_path: String,
    content: String,
    apply_fix: Option<bool>,
) -> Result<EslintLintResult, AppError> {
    if !trust_state.is_trusted(&project_path) {
        return Ok(EslintLintResult {
            diagnostics: vec![],
            content: None,
        });
    }
    let apply = apply_fix.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        lint::eslint_lint_file(project_path, file_path, content, apply).map_err(AppError::from)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
pub async fn prettier_format_file(
    trust_state: State<'_, WorkspaceTrustState>,
    project_path: String,
    file_path: String,
    content: String,
) -> Result<String, AppError> {
    if !trust_state.is_trusted(&project_path) {
        return Ok(content);
    }
    tauri::async_runtime::spawn_blocking(move || {
        lint::prettier_format_file(project_path, file_path, content).map_err(AppError::from)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}
