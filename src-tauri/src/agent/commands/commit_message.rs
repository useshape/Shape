//! Generate commit message command + helpers.
use super::streaming;
use crate::agent::model_router;
use crate::agent::models::{AgentState, ChatMessage};
use crate::agent::prompts;
use super::messages;
use crate::app_state::AppState;
use crate::commands::git;
use crate::core::error::AppError;
use reqwest::Client;

const MODEL_TITLE_GEN: &str = model_router::MODEL_FAST;

fn staged_paths_from_diff(diff: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for line in diff.lines() {
        // diff --git a/path b/path
        if let Some(rest) = line.strip_prefix("diff --git ") {
            let mut parts = rest.split_whitespace();
            let _a = parts.next();
            if let Some(b) = parts.next() {
                let path = b.strip_prefix("b/").unwrap_or(b).to_string();
                if !path.is_empty() && !paths.iter().any(|p| p == &path) {
                    paths.push(path);
                }
            }
        }
    }
    paths
}

fn load_project_commit_guide(project_path: &str) -> Option<String> {
    const CANDIDATES: &[&str] = &["COMMIT.md", "commit.md", "COMMIT.MD", ".github/COMMIT.md"];
    for name in CANDIDATES {
        let path = std::path::Path::new(project_path).join(name);
        if let Ok(text) = std::fs::read_to_string(&path) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                // Cap so the prompt stays focused on the diff.
                let excerpt: String = trimmed.chars().take(6_000).collect();
                return Some(excerpt);
            }
        }
    }
    None
}

/// Only include chat when recent turns mention the same paths as the staged diff.
fn related_chat_for_commit(
    history: &[ChatMessage],
    summary: Option<&str>,
    staged_paths: &[String],
) -> Option<String> {
    if staged_paths.is_empty() {
        return None;
    }
    let path_needles: Vec<String> = staged_paths
        .iter()
        .flat_map(|p| {
            let slash = p.replace('\\', "/");
            let file = slash.rsplit('/').next().unwrap_or(slash.as_str()).to_string();
            vec![slash.to_lowercase(), file.to_lowercase()]
        })
        .collect();

    let mut matched = Vec::new();
    for msg in history.iter().rev().take(16) {
        let lower = msg.content.to_lowercase();
        let hits = path_needles.iter().any(|n| !n.is_empty() && lower.contains(n));
        if !hits {
            continue;
        }
        let body = messages::strip_heavy_content_for_summary(&msg.content);
        let excerpt: String = body.chars().take(800).collect();
        matched.push(format!("[{}] {}", msg.role, excerpt));
        if matched.len() >= 6 {
            break;
        }
    }

    if matched.is_empty() {
        // Summary only if it also mentions staged paths.
        if let Some(s) = summary {
            let lower = s.to_lowercase();
            if path_needles.iter().any(|n| !n.is_empty() && lower.contains(n)) {
                let excerpt: String = s.chars().take(1_200).collect();
                return Some(excerpt);
            }
        }
        return None;
    }

    matched.reverse();
    Some(matched.join("\n\n"))
}

#[tauri::command]
pub async fn generate_commit_message(
    access_token: Option<String>,
    app_state: tauri::State<'_, AppState>,
    agent_state: tauri::State<'_, AgentState>,
) -> Result<String, AppError> {
    let auth_token = access_token.filter(|t| !t.trim().is_empty()).ok_or_else(|| {
        AppError::Env("Sign in to Shape to use AI chat.".to_string())
    })?;
    let client = Client::new();
    let model = MODEL_TITLE_GEN;

    let project_path = app_state
        .0
        .lock()?
        .project_path
        .clone()
        .ok_or(AppError::Message("No project open".to_string()))?;

    let diff = git::git_staged_diff(project_path.clone()).unwrap_or_default();
    if diff.trim().is_empty() {
        return Err(AppError::Message(
            "No checked/staged changes detected. Please check the files you want to commit."
                .to_string(),
        ));
    }

    let logs = git::git_log(project_path.clone(), Some(10)).unwrap_or_default();
    let recent_commits = logs
        .iter()
        .take(10)
        .map(|log| format!("- {}: {}", log.hash, log.message))
        .collect::<Vec<_>>()
        .join("\n");

    let staged_paths = staged_paths_from_diff(&diff);
    let staged_list = if staged_paths.is_empty() {
        "Unavailable".to_string()
    } else {
        staged_paths
            .iter()
            .map(|p| format!("- {}", p))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let project_guide = load_project_commit_guide(&project_path);
    let (history, summary) = {
        let hist = agent_state.history.lock()?.clone();
        let sum = agent_state.history_summary.lock()?.clone();
        (hist, sum)
    };
    let chat_excerpt = related_chat_for_commit(&history, summary.as_deref(), &staged_paths);

    let diff_trimmed = if diff.chars().count() > 14000 {
        let head: String = diff.chars().take(14000).collect();
        format!("{}... [truncated]", head)
    } else {
        diff
    };

    let mut prompt = format!("{}\n\n", prompts::COMMIT_MD);
    if let Some(guide) = project_guide {
        prompt.push_str("## Project commit guide\n");
        prompt.push_str(&guide);
        prompt.push_str("\n\n");
    }
    prompt.push_str("## Recent commits\n");
    prompt.push_str(if recent_commits.is_empty() {
        "None"
    } else {
        &recent_commits
    });
    prompt.push_str("\n\n## Staged files\n");
    prompt.push_str(&staged_list);
    if let Some(chat) = chat_excerpt {
        prompt.push_str("\n\n## Related chat context (only if it matches this diff)\n");
        prompt.push_str(&chat);
    }
    prompt.push_str("\n\n## Git diff\n");
    prompt.push_str(&diff_trimmed);

    let commit_turn_id = uuid::Uuid::new_v4().to_string();
    let commit_ctx = streaming::ProxyContext::new("commit").with_turn(Some(commit_turn_id), None);

    let (message, _, _) =
        streaming::complete_chat_with_max_tokens(&client, &auth_token, &prompt, model, 220, &commit_ctx).await?;
    if message.is_empty() {
        return Err(AppError::Message(
            "Failed to generate commit message".to_string(),
        ));
    }
    Ok(message)
}
