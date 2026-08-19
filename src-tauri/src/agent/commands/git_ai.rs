//! Git Manager AI helpers (PR/issue/release summaries, CI + change explainers).
use super::streaming;
use crate::agent::model_router;
use crate::agent::prompts;
use crate::app_state::AppState;
use crate::commands::git;
use crate::core::error::AppError;
use reqwest::Client;

const MODEL_TITLE_GEN: &str = model_router::MODEL_FAST;

fn require_shape_token(access_token: Option<String>) -> Result<String, AppError> {
    access_token
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| AppError::Env("Sign in to Shape to use AI.".to_string()))
}

fn truncate_for_prompt(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max.min(s.len());
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}... [truncated]", &s[..end])
}

/// One-shot AI summary of a pull request for the Git Manager detail pane.
#[tauri::command]
pub async fn summarize_pull_request(
    access_token: Option<String>,
    owner: String,
    repo: String,
    number: u64,
) -> Result<String, AppError> {
    let auth_token = require_shape_token(access_token)?;
    let client = Client::new();
    let model = MODEL_TITLE_GEN;
    let slug = format!("{owner}/{repo}");

    let pr_path = format!("repos/{slug}/pulls/{number}");
    let files_path = format!("repos/{slug}/pulls/{number}/files?per_page=100");
    let pr_raw = crate::commands::github_auth::api_get(&pr_path)?;
    let files_raw = crate::commands::github_auth::api_get(&files_path).unwrap_or_else(|_| "[]".into());

    let pr: serde_json::Value =
        serde_json::from_str(&pr_raw).map_err(|e| AppError::Message(e.to_string()))?;
    let files: serde_json::Value =
        serde_json::from_str(&files_raw).unwrap_or_else(|_| serde_json::json!([]));

    let title = pr.get("title").and_then(|v| v.as_str()).unwrap_or("(no title)");
    let body = pr.get("body").and_then(|v| v.as_str()).unwrap_or("");
    let state = pr.get("state").and_then(|v| v.as_str()).unwrap_or("");
    let base = pr
        .pointer("/base/ref")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let head = pr
        .pointer("/head/ref")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let user = pr
        .pointer("/user/login")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let additions = pr.get("additions").and_then(|v| v.as_u64()).unwrap_or(0);
    let deletions = pr.get("deletions").and_then(|v| v.as_u64()).unwrap_or(0);

    let mut file_lines = Vec::new();
    if let Some(arr) = files.as_array() {
        for f in arr.iter().take(80) {
            let name = f.get("filename").and_then(|v| v.as_str()).unwrap_or("?");
            let status = f.get("status").and_then(|v| v.as_str()).unwrap_or("modified");
            let a = f.get("additions").and_then(|v| v.as_u64()).unwrap_or(0);
            let d = f.get("deletions").and_then(|v| v.as_u64()).unwrap_or(0);
            file_lines.push(format!("- [{status}] {name} (+{a}/âˆ’{d})"));
        }
        if arr.len() > 80 {
            file_lines.push(format!("- â€¦ and {} more files", arr.len() - 80));
        }
    }

    let mut prompt = format!("{}\n\n", prompts::PR_SUMMARY_MD);
    prompt.push_str(&format!(
        "## PR\n- Repo: {slug}\n- Number: #{number}\n- Author: {user}\n- State: {state}\n- Base â† Head: {base} â† {head}\n- Diffstat: +{additions} âˆ’{deletions}\n\n## Title\n{title}\n\n## Body\n{}\n\n## Files\n{}\n",
        truncate_for_prompt(body, 8_000),
        if file_lines.is_empty() {
            "(none)".to_string()
        } else {
            file_lines.join("\n")
        }
    ));

    let turn_id = uuid::Uuid::new_v4().to_string();
    let ctx = streaming::ProxyContext::new("pr_summary").with_turn(Some(turn_id), None);
    let (message, _, _) =
        streaming::complete_chat_with_max_tokens(&client, &auth_token, &prompt, model, 700, &ctx)
            .await?;
    if message.trim().is_empty() {
        return Err(AppError::Message("Failed to summarize pull request".into()));
    }
    Ok(message)
}

/// One-shot AI brief for a GitHub release (summarize / upgrade / announce).
#[tauri::command]
pub async fn summarize_release(
    access_token: Option<String>,
    owner: String,
    repo: String,
    release_id: u64,
    mode: Option<String>,
) -> Result<String, AppError> {
    let auth_token = require_shape_token(access_token)?;
    let client = Client::new();
    let model = MODEL_TITLE_GEN;
    let slug = format!("{owner}/{repo}");
    let mode = mode
        .as_deref()
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| matches!(s.as_str(), "summarize" | "upgrade" | "announce"))
        .unwrap_or_else(|| "summarize".into());

    let path = format!("repos/{slug}/releases/{release_id}");
    let raw = crate::commands::github_auth::api_get(&path)?;
    let rel: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| AppError::Message(e.to_string()))?;

    let title = rel.get("name").and_then(|v| v.as_str()).unwrap_or("(untitled)");
    let tag = rel.get("tag_name").and_then(|v| v.as_str()).unwrap_or("?");
    let body = rel.get("body").and_then(|v| v.as_str()).unwrap_or("");
    let author = rel
        .pointer("/author/login")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let prerelease = rel.get("prerelease").and_then(|v| v.as_bool()).unwrap_or(false);
    let draft = rel.get("draft").and_then(|v| v.as_bool()).unwrap_or(false);
    let published = rel
        .get("published_at")
        .and_then(|v| v.as_str())
        .or_else(|| rel.get("created_at").and_then(|v| v.as_str()))
        .unwrap_or("?");

    let mut asset_lines = Vec::new();
    if let Some(arr) = rel.get("assets").and_then(|v| v.as_array()) {
        for a in arr.iter().take(30) {
            let name = a.get("name").and_then(|v| v.as_str()).unwrap_or("?");
            let size = a.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
            asset_lines.push(format!("- {name} ({size} bytes)"));
        }
    }

    let mut prompt = format!("{}\n\n", prompts::RELEASE_SUMMARY_MD);
    prompt.push_str(&format!(
        "## Mode\n{mode}\n\n## Release\n- Repo: {slug}\n- Tag: {tag}\n- Title: {title}\n- Author: {author}\n- Published: {published}\n- Prerelease: {prerelease}\n- Draft: {draft}\n\n## Body\n{}\n\n## Assets\n{}\n",
        truncate_for_prompt(body, 12_000),
        if asset_lines.is_empty() {
            "(none)".to_string()
        } else {
            asset_lines.join("\n")
        }
    ));

    let turn_id = uuid::Uuid::new_v4().to_string();
    let ctx = streaming::ProxyContext::new("release_summary").with_turn(Some(turn_id), None);
    let (message, _, _) =
        streaming::complete_chat_with_max_tokens(&client, &auth_token, &prompt, model, 700, &ctx)
            .await?;
    if message.trim().is_empty() {
        return Err(AppError::Message("Failed to summarize release".into()));
    }
    Ok(message)
}

/// One-shot AI explanation of a CI / Actions log for the Git Manager logs pane.
#[tauri::command]
pub async fn explain_ci_log(
    access_token: Option<String>,
    log_text: String,
    context: Option<String>,
) -> Result<String, AppError> {
    let auth_token = require_shape_token(access_token)?;
    let client = Client::new();
    let model = MODEL_TITLE_GEN;

    let trimmed = log_text.trim();
    if trimmed.is_empty() {
        return Err(AppError::Message(
            "No log text to explain. Load job logs first.".into(),
        ));
    }

    let mut prompt = format!("{}\n\n", prompts::CI_EXPLAIN_MD);
    if let Some(ctx_line) = context.filter(|s| !s.trim().is_empty()) {
        prompt.push_str("## Job context\n");
        prompt.push_str(&ctx_line);
        prompt.push_str("\n\n");
    }
    prompt.push_str("## Log\n");
    prompt.push_str(&truncate_for_prompt(trimmed, 16_000));

    let turn_id = uuid::Uuid::new_v4().to_string();
    let ctx = streaming::ProxyContext::new("ci_explain").with_turn(Some(turn_id), None);
    let (message, _, _) =
        streaming::complete_chat_with_max_tokens(&client, &auth_token, &prompt, model, 700, &ctx)
            .await?;
    if message.trim().is_empty() {
        return Err(AppError::Message("Failed to explain CI log".into()));
    }
    Ok(message)
}

/// One-shot AI explanation of git changes (commit / working tree / branch / conflict).
#[tauri::command]
pub async fn explain_git_changes(
    access_token: Option<String>,
    app_state: tauri::State<'_, AppState>,
    kind: String,
    hash: Option<String>,
    base: Option<String>,
    compare: Option<String>,
    repo_path: Option<String>,
) -> Result<String, AppError> {
    let auth_token = require_shape_token(access_token)?;
    let client = Client::new();
    let model = MODEL_TITLE_GEN;
    let kind = kind.trim().to_ascii_lowercase();
    if !matches!(
        kind.as_str(),
        "commit" | "working" | "branch" | "conflict"
    ) {
        return Err(AppError::Message(
            "kind must be commit, working, branch, or conflict".into(),
        ));
    }

    let project_path = repo_path
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            app_state
                .0
                .lock()
                .ok()
                .and_then(|s| s.project_path.clone())
        })
        .ok_or(AppError::Message("No project open".into()))?;

    let mut prompt = format!("{}\n\n## Mode\n{kind}\n\n", prompts::EXPLAIN_GIT_MD);

    match kind.as_str() {
        "commit" => {
            let hash = hash
                .filter(|s| !s.trim().is_empty())
                .ok_or(AppError::Message("Commit hash required".into()))?;
            let files = git::git_commit_files(project_path.clone(), hash.clone()).unwrap_or_default();
            let patch = git::git_commit_patch(project_path.clone(), hash.clone())?;
            if patch.trim().is_empty() && files.is_empty() {
                return Err(AppError::Message("No changes in this commit to explain.".into()));
            }
            let file_lines: Vec<String> = files
                .iter()
                .take(80)
                .map(|f| format!("- [{}] {}", f.status, f.path))
                .collect();
            let msg = git::git_commit_message(project_path.clone(), hash.clone()).unwrap_or_default();
            prompt.push_str(&format!(
                "## Commit\n- Hash: {hash}\n- Message:\n{}\n\n## Files\n{}\n\n## Diff\n{}\n",
                if msg.trim().is_empty() {
                    "(unknown)".into()
                } else {
                    truncate_for_prompt(&msg, 2_000)
                },
                if file_lines.is_empty() {
                    "(none)".into()
                } else {
                    file_lines.join("\n")
                },
                truncate_for_prompt(&patch, 8_000),
            ));
        }
        "working" => {
            // Staged-only â€” matches commit-message scope and stays fast.
            let diff = git::git_staged_diff(project_path.clone()).unwrap_or_default();
            if diff.trim().is_empty() {
                return Err(AppError::Message(
                    "No staged changes to explain. Stage files first.".into(),
                ));
            }
            let status = git::git_status(project_path.clone()).unwrap_or_default();
            let file_lines: Vec<String> = status
                .iter()
                .filter(|f| f.staged)
                .take(60)
                .map(|f| format!("- [{}] {}", f.status, f.path))
                .collect();
            prompt.push_str(&format!(
                "## Staged files\n{}\n\n## Diff\n{}\n",
                if file_lines.is_empty() {
                    "(none)".into()
                } else {
                    file_lines.join("\n")
                },
                truncate_for_prompt(&diff, 8_000),
            ));
        }
        "branch" => {
            let base = base
                .filter(|s| !s.trim().is_empty())
                .ok_or(AppError::Message("Base branch required".into()))?;
            let compare = compare
                .filter(|s| !s.trim().is_empty())
                .ok_or(AppError::Message("Compare branch required".into()))?;
            let stat =
                git::git_diff_branches(project_path.clone(), base.clone(), compare.clone())
                    .unwrap_or_default();
            let patch =
                git::git_diff_range_patch(project_path.clone(), base.clone(), compare.clone())
                    .unwrap_or_default();
            if stat.trim().is_empty() && patch.trim().is_empty() {
                return Err(AppError::Message(
                    "No differences between these branches.".into(),
                ));
            }
            prompt.push_str(&format!(
                "## Branches\n- Base: {base}\n- Compare: {compare}\n\n## Diffstat\n{}\n\n## Diff\n{}\n",
                truncate_for_prompt(&stat, 3_000),
                truncate_for_prompt(&patch, 8_000),
            ));
        }
        "conflict" => {
            let status = git::git_status(project_path.clone()).unwrap_or_default();
            let conflicted: Vec<_> = status
                .iter()
                .filter(|f| f.status.eq_ignore_ascii_case("C") || f.status.contains('U'))
                .collect();
            if conflicted.is_empty() {
                return Err(AppError::Message(
                    "No conflicted files detected.".into(),
                ));
            }
            let mut sections = Vec::new();
            for f in conflicted.iter().take(12) {
                let full = std::path::Path::new(&project_path).join(&f.path);
                let body = std::fs::read_to_string(&full).unwrap_or_else(|_| {
                    "(could not read file â€” binary or missing)".into()
                });
                sections.push(format!(
                    "### {}\n{}\n",
                    f.path,
                    truncate_for_prompt(&body, 3_000)
                ));
            }
            prompt.push_str(&format!(
                "## Conflicted files ({})\n{}\n",
                conflicted.len(),
                sections.join("\n"),
            ));
        }
        _ => unreachable!(),
    }

    let turn_id = uuid::Uuid::new_v4().to_string();
    let ctx = streaming::ProxyContext::new("git_explain").with_turn(Some(turn_id), None);
    let (message, _, _) =
        streaming::complete_chat_with_max_tokens(&client, &auth_token, &prompt, model, 450, &ctx)
            .await?;
    if message.trim().is_empty() {
        return Err(AppError::Message("Failed to explain git changes".into()));
    }
    Ok(message)
}

/// One-shot AI summary of a GitHub issue for the Git Manager detail pane.
#[tauri::command]
pub async fn summarize_issue(
    access_token: Option<String>,
    owner: String,
    repo: String,
    number: u64,
) -> Result<String, AppError> {
    let auth_token = require_shape_token(access_token)?;
    let client = Client::new();
    let model = MODEL_TITLE_GEN;
    let slug = format!("{owner}/{repo}");

    let path = format!("repos/{slug}/issues/{number}");
    let raw = crate::commands::github_auth::api_get(&path)?;
    let issue: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| AppError::Message(e.to_string()))?;

    if issue.get("pull_request").is_some() {
        return Err(AppError::Message(
            "This is a pull request â€” open it under Pull requests to summarize.".into(),
        ));
    }

    let title = issue.get("title").and_then(|v| v.as_str()).unwrap_or("(no title)");
    let body = issue.get("body").and_then(|v| v.as_str()).unwrap_or("");
    let state = issue.get("state").and_then(|v| v.as_str()).unwrap_or("");
    let user = issue
        .pointer("/user/login")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let mut labels = Vec::new();
    if let Some(arr) = issue.get("labels").and_then(|v| v.as_array()) {
        for l in arr.iter().take(20) {
            if let Some(name) = l.get("name").and_then(|v| v.as_str()) {
                labels.push(name.to_string());
            }
        }
    }

    let mut prompt = format!("{}\n\n", prompts::ISSUE_SUMMARY_MD);
    prompt.push_str(&format!(
        "## Issue\n- Repo: {slug}\n- Number: #{number}\n- Author: {user}\n- State: {state}\n- Labels: {}\n\n## Title\n{title}\n\n## Body\n{}\n",
        if labels.is_empty() {
            "(none)".into()
        } else {
            labels.join(", ")
        },
        truncate_for_prompt(body, 8_000),
    ));

    let turn_id = uuid::Uuid::new_v4().to_string();
    let ctx = streaming::ProxyContext::new("issue_summary").with_turn(Some(turn_id), None);
    let (message, _, _) =
        streaming::complete_chat_with_max_tokens(&client, &auth_token, &prompt, model, 500, &ctx)
            .await?;
    if message.trim().is_empty() {
        return Err(AppError::Message("Failed to summarize issue".into()));
    }
    Ok(message)
}
