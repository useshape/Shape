use crate::core::error::AppError;
use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

fn git_cmd() -> Result<Command, AppError> {
    crate::core::git_bin::git_command()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubAuthStatus {
    pub logged_in: bool,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub provider: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubAuthLoginResult {
    pub started: bool,
}

enum AuthProvider {
    Gcm,
    Gh,
}

fn command_exists(command: &str) -> Option<String> {
    #[cfg(windows)]
    {
        let output = Command::new("where").arg(command).output().ok()?;
        if !output.status.success() {
            return None;
        }
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty() && std::path::Path::new(line).exists())
            .map(ToString::to_string)
    }
    #[cfg(not(windows))]
    {
        let output = Command::new("which").arg(command).output().ok()?;
        if !output.status.success() {
            return None;
        }
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(ToString::to_string)
    }
}

fn gcm_available() -> bool {
    crate::core::git_bin::git_command()
        .and_then(|mut cmd| {
            Ok(cmd
                .args(["credential-manager", "--version"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()?)
        })
        .map(|s| s.success())
        .unwrap_or(false)
}

fn resolve_provider() -> Option<AuthProvider> {
    if gcm_available() {
        Some(AuthProvider::Gcm)
    } else if command_exists("gh").is_some() {
        Some(AuthProvider::Gh)
    } else {
        None
    }
}

fn provider_label(provider: &AuthProvider) -> &'static str {
    match provider {
        AuthProvider::Gcm => "gcm",
        AuthProvider::Gh => "gh",
    }
}

pub fn parse_gcm_github_list(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect()
}

#[derive(Debug, Deserialize)]
struct GhAuthStatusResponse {
    hosts: std::collections::HashMap<String, Vec<GhHostEntry>>,
}

#[derive(Debug, Deserialize)]
struct GhHostEntry {
    state: String,
    active: bool,
    login: String,
}

pub fn parse_gh_auth_status(json: &str) -> Option<String> {
    let parsed: GhAuthStatusResponse = serde_json::from_str(json).ok()?;
    let entries = parsed.hosts.get("github.com")?;
    entries
        .iter()
        .find(|entry| entry.state == "success" && entry.active)
        .or_else(|| entries.iter().find(|entry| entry.state == "success"))
        .map(|entry| entry.login.clone())
}

fn fetch_avatar_url() -> Option<String> {
    let gh = command_exists("gh")?;
    let output = Command::new(&gh)
        .args(["api", "user", "--jq", ".avatar_url"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if url.is_empty() {
        None
    } else {
        Some(url)
    }
}

fn status_for_provider(provider: &AuthProvider) -> Result<GitHubAuthStatus, AppError> {
    let label = provider_label(provider).to_string();
    let username = match provider {
        AuthProvider::Gcm => {
            let output = git_cmd()?
                .args(["credential-manager", "github", "list"])
                .output()?;
            if !output.status.success() {
                return Err(AppError::Message(format!(
                    "Failed to list GitHub accounts: {}",
                    String::from_utf8_lossy(&output.stderr)
                )));
            }
            parse_gcm_github_list(&String::from_utf8_lossy(&output.stdout))
                .into_iter()
                .next()
        }
        AuthProvider::Gh => {
            let gh = command_exists("gh").ok_or_else(|| {
                AppError::Message("GitHub CLI (gh) is not installed.".to_string())
            })?;
            let output = Command::new(&gh)
                .args([
                    "auth",
                    "status",
                    "--hostname",
                    "github.com",
                    "--json",
                    "hosts",
                ])
                .output()?;
            if !output.status.success() {
                None
            } else {
                parse_gh_auth_status(&String::from_utf8_lossy(&output.stdout))
            }
        }
    };

    let logged_in = username.is_some();
    let avatar_url = if logged_in {
        fetch_avatar_url()
    } else {
        None
    };

    Ok(GitHubAuthStatus {
        logged_in,
        username,
        avatar_url,
        provider: label,
    })
}

pub fn get_status() -> Result<GitHubAuthStatus, AppError> {
    match resolve_provider() {
        Some(provider) => status_for_provider(&provider),
        None => Ok(GitHubAuthStatus {
            logged_in: false,
            username: None,
            avatar_url: None,
            provider: "none".to_string(),
        }),
    }
}

fn run_gcm_login() -> Result<(), AppError> {
    let output = git_cmd()?
        .args(["credential-manager", "github", "login", "--web"])
        .output()?;
    if !output.status.success() {
        return Err(AppError::Message(format!(
            "GitHub sign-in failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }
    Ok(())
}

fn run_gh_login() -> Result<(), AppError> {
    let gh = command_exists("gh")
        .ok_or_else(|| AppError::Message("GitHub CLI (gh) is not installed.".to_string()))?;

    let login = Command::new(&gh)
        .args([
            "auth",
            "login",
            "-h",
            "github.com",
            "-p",
            "https",
            "-w",
            "--skip-ssh-key",
        ])
        .stdin(Stdio::null())
        .output()?;
    if !login.status.success() {
        return Err(AppError::Message(format!(
            "GitHub sign-in failed: {}",
            String::from_utf8_lossy(&login.stderr).trim()
        )));
    }

    let setup = Command::new(&gh).args(["auth", "setup-git"]).output()?;
    if !setup.status.success() {
        return Err(AppError::Message(format!(
            "Failed to configure git credentials: {}",
            String::from_utf8_lossy(&setup.stderr).trim()
        )));
    }
    Ok(())
}

pub fn start_login(app: AppHandle) -> Result<(), AppError> {
    let provider = resolve_provider().ok_or_else(|| {
        AppError::Message(
            "Git Credential Manager or GitHub CLI is required. Install Git for Windows or run: winget install GitHub.cli".to_string(),
        )
    })?;

    std::thread::spawn(move || {
        let result = match provider {
            AuthProvider::Gcm => run_gcm_login(),
            AuthProvider::Gh => run_gh_login(),
        };

        if result.is_ok() {
            let _ = ensure_git_helper();
        }

        match get_status() {
            Ok(status) => {
                let _ = app.emit("github-auth-changed", status);
            }
            Err(err) => {
                log::warn!("github auth status after login failed: {err}");
            }
        }

        if let Err(err) = result {
            log::warn!("github auth login failed: {err}");
        }
    });

    Ok(())
}

pub fn logout(username: Option<String>) -> Result<(), AppError> {
    let status = get_status()?;
    if !status.logged_in {
        return Ok(());
    }

    let account = username
        .or(status.username)
        .ok_or_else(|| AppError::Message("No GitHub account to sign out.".to_string()))?;

    match resolve_provider() {
        Some(AuthProvider::Gcm) => {
            let output = git_cmd()?
                .args(["credential-manager", "github", "logout", &account])
                .output()?;
            if !output.status.success() {
                return Err(AppError::Message(format!(
                    "GitHub sign-out failed: {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                )));
            }
        }
        Some(AuthProvider::Gh) => {
            let gh = command_exists("gh")
                .ok_or_else(|| AppError::Message("GitHub CLI (gh) is not installed.".to_string()))?;
            let output = Command::new(&gh)
                .args(["auth", "logout", "-h", "github.com", "-u", &account])
                .output()?;
            if !output.status.success() {
                return Err(AppError::Message(format!(
                    "GitHub sign-out failed: {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                )));
            }
        }
        None => {}
    }

    Ok(())
}

pub fn ensure_git_helper() -> Result<(), AppError> {
    let output = git_cmd()?
        .args(["config", "--show-origin", "--get-all", "credential.helper"])
        .output()?;

    if output.status.success() && !output.stdout.is_empty() {
        return Ok(());
    }

    let set = git_cmd()?
        .args(["config", "--global", "credential.helper", "manager"])
        .output()?;
    if !set.status.success() {
        return Err(AppError::Message(format!(
            "Failed to configure git credential helper: {}",
            String::from_utf8_lossy(&set.stderr).trim()
        )));
    }
    Ok(())
}

fn require_gh() -> Result<String, AppError> {
    command_exists("gh").ok_or_else(|| {
        AppError::Message(
            "GitHub CLI (gh) is required for this view. Install it or sign in with gh.".into(),
        )
    })
}

fn gh_output_error(output: &std::process::Output, context: &str) -> AppError {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    AppError::Message(if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        context.to_string()
    })
}

/// GET a GitHub REST path via `gh api` (authenticated as the signed-in user).
pub fn api_get(path: &str) -> Result<String, AppError> {
    api_request("GET", path, None)
}

/// Call GitHub REST via `gh api` with an explicit HTTP method.
pub fn api_request(method: &str, path: &str, body: Option<&str>) -> Result<String, AppError> {
    let gh = require_gh()?;
    let normalized = path.trim().trim_start_matches('/');
    let method = method.trim().to_uppercase();
    let mut args = vec![
        "api".to_string(),
        normalized.to_string(),
        "-H".to_string(),
        "Accept: application/vnd.github+json".to_string(),
        "--method".to_string(),
        method.clone(),
    ];
    if let Some(body) = body.filter(|b| !b.trim().is_empty()) {
        args.push("--input".to_string());
        args.push("-".to_string());
        let mut child = Command::new(&gh)
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        if let Some(mut stdin) = child.stdin.take() {
            use std::io::Write;
            stdin.write_all(body.as_bytes())?;
        }
        let output = child.wait_with_output()?;
        if !output.status.success() {
            return Err(gh_output_error(
                &output,
                &format!("gh api {method} /{normalized} failed"),
            ));
        }
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }

    let output = Command::new(&gh).args(&args).output()?;
    if !output.status.success() {
        return Err(gh_output_error(
            &output,
            &format!("gh api {method} /{normalized} failed"),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Fetch workflow job logs as plain text via `gh run view --log`.
pub fn actions_job_logs(
    repo: &str,
    run_id: u64,
    job_id: Option<u64>,
    failed_only: bool,
) -> Result<String, AppError> {
    let gh = require_gh()?;
    let mut args = vec![
        "run".to_string(),
        "view".to_string(),
        run_id.to_string(),
        "--repo".to_string(),
        repo.to_string(),
    ];
    if failed_only {
        args.push("--log-failed".to_string());
    } else {
        args.push("--log".to_string());
    }
    if let Some(job_id) = job_id {
        args.push("--job".to_string());
        args.push(job_id.to_string());
    }
    let output = Command::new(&gh).args(&args).output()?;
    if !output.status.success() {
        return Err(gh_output_error(
            &output,
            &format!("gh run view --log failed for run {run_id}"),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

  // Manual test checklist:
  // 1. Signed out -> titlebar GitHub submenu shows Sign in with GitHub
  // 2. Sign in -> browser opens -> approve -> dropdown shows @username
  // 3. git push from integrated terminal works without extra auth
  // 4. Sign out -> dropdown resets; next push prompts again
  // 5. Machine with only gh (no GCM) -> fallback works
  // 6. Machine with neither -> clear install message

    #[test]
    fn parse_gcm_list_single_account() {
        let accounts = parse_gcm_github_list("synthettc\n");
        assert_eq!(accounts, vec!["synthettc".to_string()]);
    }

    #[test]
    fn parse_gcm_list_multiple_accounts() {
        let accounts = parse_gcm_github_list("alice\n\nbob\n");
        assert_eq!(
            accounts,
            vec!["alice".to_string(), "bob".to_string()]
        );
    }

    #[test]
    fn parse_gh_auth_status_prefers_active_account() {
        let json = r#"{"hosts":{"github.com":[{"state":"success","active":false,"login":"inactive-user"},{"state":"success","active":true,"login":"active-user"}]}}"#;
        assert_eq!(
            parse_gh_auth_status(json).as_deref(),
            Some("active-user")
        );
    }

    #[test]
    fn parse_gh_auth_status_falls_back_to_successful_account() {
        let json = r#"{"hosts":{"github.com":[{"state":"success","active":false,"login":"only-user"}]}}"#;
        assert_eq!(parse_gh_auth_status(json).as_deref(), Some("only-user"));
    }

    #[test]
    fn parse_gh_auth_status_empty_when_missing_host() {
        let json = r#"{"hosts":{}}"#;
        assert_eq!(parse_gh_auth_status(json), None);
    }

    #[test]
    fn parse_gcm_list_ignores_whitespace_only_lines() {
        let accounts = parse_gcm_github_list("  \n\t\n");
        assert!(accounts.is_empty());
    }

    #[test]
    fn parse_gh_auth_status_malformed_json() {
        assert_eq!(parse_gh_auth_status("not-json"), None);
    }

    #[test]
    fn parse_gh_auth_status_empty_hosts_array() {
        let json = r#"{"hosts":{"github.com":[]}}"#;
        assert_eq!(parse_gh_auth_status(json), None);
    }
}
