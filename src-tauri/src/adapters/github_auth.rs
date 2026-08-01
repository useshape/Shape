use crate::commands::github_auth::{self, GitHubAuthLoginResult, GitHubAuthStatus};
use crate::core::error::AppError;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn github_auth_status() -> Result<GitHubAuthStatus, AppError> {
    github_auth::get_status()
}

#[tauri::command]
pub async fn github_auth_login(app: AppHandle) -> Result<GitHubAuthLoginResult, AppError> {
    github_auth::start_login(app)?;
    Ok(GitHubAuthLoginResult { started: true })
}

#[tauri::command]
pub async fn github_auth_logout(
    app: AppHandle,
    username: Option<String>,
) -> Result<(), AppError> {
    github_auth::logout(username)?;
    let status = github_auth::get_status()?;
    let _ = app.emit("github-auth-changed", status);
    Ok(())
}

#[tauri::command]
pub async fn github_auth_ensure_git_helper() -> Result<(), AppError> {
    github_auth::ensure_git_helper()
}

/// Proxy a GET to the GitHub API via `gh api` (uses the signed-in GitHub CLI session).
#[tauri::command]
pub async fn github_api_get(path: String) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || github_auth::api_get(&path))
        .await
        .map_err(|e| AppError::Message(format!("github api join: {e}")))?
}

/// Proxy any GitHub REST method via `gh api`.
#[tauri::command]
pub async fn github_api_request(
    method: String,
    path: String,
    body: Option<String>,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        github_auth::api_request(&method, &path, body.as_deref())
    })
    .await
    .map_err(|e| AppError::Message(format!("github api join: {e}")))?
}

/// Fetch Actions job/run logs as plain text (`gh run view --log`).
#[tauri::command]
pub async fn github_actions_logs(
    repo: String,
    run_id: u64,
    job_id: Option<u64>,
    failed_only: Option<bool>,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        github_auth::actions_job_logs(&repo, run_id, job_id, failed_only.unwrap_or(false))
    })
    .await
    .map_err(|e| AppError::Message(format!("github actions logs join: {e}")))?
}
