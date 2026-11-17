//! Generate commit message command + helpers.
use super::streaming;
use crate::agent::models::{AgentState, ChatMessage};
use crate::agent::prompts;
use crate::app_state::AppState;
use crate::commands::git;
use crate::core::error::AppError;
use reqwest::Client;
use serde_json::json;

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

fn is_agent_markup(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("<subagent")
        || lower.contains("</subagent")
        || lower.contains("<tool")
        || lower.contains("spawn_subagent")
        || lower.contains("<review_debate")
        || lower.contains("<persona_review")
        || lower.contains("you are a senior")
}

/// Only include *user* chat when recent turns mention a distinctive staged path.
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
        .map(|p| p.replace('\\', "/").to_lowercase())
        .filter(|p| p.contains('/'))
        .collect();
    if path_needles.is_empty() {
        return None;
    }

    let mut matched = Vec::new();
    for msg in history.iter().rev().take(16) {
        if msg.role != "user" || is_agent_markup(&msg.content) {
            continue;
        }
        let lower = msg.content.to_lowercase();
        if !path_needles.iter().any(|n| lower.contains(n)) {
            continue;
        }
        let excerpt: String = msg
            .content
            .chars()
            .filter(|c| *c != '<' && *c != '>')
            .take(240)
            .collect();
        let excerpt = excerpt.trim();
        if excerpt.is_empty() {
            continue;
        }
        matched.push(excerpt.to_string());
        if matched.len() >= 3 {
            break;
        }
    }

    if matched.is_empty() {
        if let Some(s) = summary.filter(|s| !is_agent_markup(s)) {
            let lower = s.to_lowercase();
            if path_needles.iter().any(|n| lower.contains(n)) {
                let excerpt: String = s.chars().take(240).collect();
                return Some(excerpt);
            }
        }
        return None;
    }

    matched.reverse();
    Some(matched.join("\n"))
}

fn fallback_commit_message(staged_paths: &[String]) -> String {
    let labels: Vec<String> = staged_paths
        .iter()
        .map(|p| {
            p.replace('\\', "/")
                .rsplit('/')
                .next()
                .unwrap_or(p.as_str())
                .to_string()
        })
        .take(3)
        .collect();
    if labels.is_empty() {
        "update files".to_string()
    } else {
        format!("update {}", labels.join(", "))
    }
}

fn finalize_commit_message(raw: &str, staged_paths: &[String]) -> String {
    let stripped = strip_model_fences(raw);
    if is_agent_markup(&stripped) || stripped.trim_start().starts_with('<') {
        return fallback_commit_message(staged_paths);
    }
    let mut subject = String::new();
    let mut body: Vec<&str> = Vec::new();
    for line in stripped.lines() {
        let line = line.trim_end();
        if line.trim().is_empty() {
            if !subject.is_empty() {
                body.push("");
            }
            continue;
        }
        if line.starts_with('<')
            || line.starts_with('#')
            || line.starts_with("```")
            || line.starts_with("- **")
            || is_agent_markup(line)
        {
            break;
        }
        if subject.is_empty() {
            let one: String = line.trim().chars().take(72).collect();
            if one.is_empty() {
                continue;
            }
            subject = one;
        } else {
            body.push(line.trim());
            if body.iter().filter(|l| !l.is_empty()).count() >= 8 {
                break;
            }
        }
    }
    if subject.is_empty() {
        return fallback_commit_message(staged_paths);
    }
    let body_text = body
        .join("\n")
        .trim()
        .to_string();
    if body_text.is_empty() {
        subject
    } else {
        format!("{subject}\n\n{body_text}")
    }
}

#[tauri::command]
pub async fn generate_commit_message(
    access_token: Option<String>,
    repo_path: Option<String>,
    app_state: tauri::State<'_, AppState>,
    agent_state: tauri::State<'_, AgentState>,
) -> Result<String, AppError> {
    let provider = streaming::LlmProvider::Shape;
    let auth_token = access_token
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| AppError::Env("Sign in to Shape to use AI chat.".to_string()))?;
    let client = Client::new();
    let model = "auto";

    let project_path = repo_path
        .filter(|p| !p.trim().is_empty())
        .or_else(|| app_state.0.lock().ok().and_then(|s| s.project_path.clone()))
        .ok_or(AppError::Message("No project open".to_string()))?;

    let mut diff = git::git_staged_diff(project_path.clone()).unwrap_or_default();
    if diff.trim().is_empty() {
        diff = git::git_diff(project_path.clone()).unwrap_or_default();
    }
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

    let mut user = String::new();
    if let Some(guide) = project_guide {
        user.push_str("## Project commit guide\n");
        user.push_str(&guide);
        user.push_str("\n\n");
    }
    user.push_str("## Recent commits\n");
    user.push_str(if recent_commits.is_empty() {
        "None"
    } else {
        &recent_commits
    });
    user.push_str("\n\n## Staged files\n");
    user.push_str(&staged_list);
    if let Some(chat) = chat_excerpt {
        user.push_str("\n\n## Related user chat (same files only)\n");
        user.push_str(&chat);
    }
    user.push_str("\n\n## Git diff\n");
    user.push_str(&diff_trimmed);
    user.push_str("\n\nReply with the commit message only.");

    let commit_turn_id = uuid::Uuid::new_v4().to_string();
    let commit_ctx = streaming::ProxyContext::new("commit")
        .with_provider(provider)
        .with_turn(Some(commit_turn_id), None);

    let messages = vec![
        json!({ "role": "system", "content": prompts::COMMIT_MD }),
        json!({ "role": "user", "content": user }),
    ];
    let message = streaming::complete_chat_messages(
        &client,
        &auth_token,
        messages,
        model,
        180,
        &commit_ctx,
        None,
    )
    .await?;
    let message = finalize_commit_message(&message, &staged_paths);
    if message.trim().is_empty() {
        return Err(AppError::Message(
            "Failed to generate commit message".to_string(),
        ));
    }
    Ok(message)
}

fn strip_model_fences(text: &str) -> String {
    let trimmed = text.trim();
    let Some(rest) = trimmed.strip_prefix("```") else {
        return trimmed.to_string();
    };
    let rest = rest.trim_start_matches(|c: char| c.is_ascii_alphanumeric() || c == '+' || c == '#' || c == '-');
    let rest = rest.trim_start_matches(['\r', '\n']);
    rest.strip_suffix("```").unwrap_or(rest).trim().to_string()
}

/// Rewrite one open file from an instruction. Does not create or append a chat.
#[tauri::command]
pub async fn rewrite_open_file(
    access_token: Option<String>,
    path: String,
    instruction: String,
    app: tauri::AppHandle,
) -> Result<String, AppError> {
    use tauri::Emitter;

    let instruction = instruction.trim().to_string();
    if instruction.is_empty() {
        return Err(AppError::Message("Enter an edit instruction.".to_string()));
    }
    let auth_token = access_token
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| AppError::Env("Sign in to Shape to use AI chat.".to_string()))?;
    let original = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Message(format!("Could not read file: {}", e)))?;
    if original.chars().count() > 80_000 {
        return Err(AppError::Message("This file is too large to edit from the editor bar.".to_string()));
    }
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");
    let prompt = format!(
        "Rewrite the file `{name}` to satisfy the instruction. Return only the full new file contents. Do not add a markdown fence, commentary, or any other file.\n\nInstruction:\n{instruction}\n\nCurrent file:\n{original}"
    );
    let client = Client::new();
    let turn_id = uuid::Uuid::new_v4().to_string();
    let ctx = streaming::ProxyContext::new("file-edit")
        .with_provider(streaming::LlmProvider::Shape)
        .with_turn(Some(turn_id), None);
    let (message, _, _) = streaming::complete_chat_with_max_tokens(
        &client,
        &auth_token,
        &prompt,
        crate::agent::model_router::editor_rewrite_model(),
        16000,
        &ctx,
    )
    .await?;
    let next = strip_model_fences(&message);
    if next.trim().is_empty() {
        return Err(AppError::Message("The edit came back empty.".to_string()));
    }
    std::fs::write(&path, &next).map_err(|e| AppError::Message(format!("Could not write file: {}", e)))?;
    let _ = app.emit("shape-file-edited", &path);
    Ok(next)
}

/// One-shot rewrite for an editor selection. Does not touch the agent transcript.
#[tauri::command]
pub async fn rewrite_text(
    access_token: Option<String>,
    prompt: String,
) -> Result<String, AppError> {
    let prompt = prompt.trim().to_string();
    if prompt.is_empty() {
        return Err(AppError::Message("Nothing to rewrite.".to_string()));
    }
    let auth_token = access_token
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| AppError::Env("Sign in to Shape to use AI chat.".to_string()))?;
    let client = Client::new();
    let turn_id = uuid::Uuid::new_v4().to_string();
    let ctx = streaming::ProxyContext::new("rewrite")
        .with_provider(streaming::LlmProvider::Shape)
        .with_turn(Some(turn_id), None);
    let (message, _, _) = streaming::complete_chat_with_max_tokens(
        &client,
        &auth_token,
        &prompt,
        crate::agent::model_router::editor_rewrite_model(),
        4000,
        &ctx,
    )
    .await?;
    let next = strip_model_fences(&message);
    if next.trim().is_empty() {
        return Err(AppError::Message("The rewrite came back empty.".to_string()));
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_fences_removes_wrapping_markdown() {
        let out = strip_model_fences("```ts\nconst x = 1;\n```");
        assert_eq!(out, "const x = 1;");
    }

    #[test]
    fn strip_fences_leaves_plain_text() {
        let src = "fn main() {}\n";
        assert_eq!(strip_model_fences(src), "fn main() {}");
    }

    #[test]
    fn rejects_subagent_dump_as_a_commit_message() {
        let raw = r#"<subagent_ref id="thread-1" agent="Flight tracker UX research" task="You are a senior product/UX researcher"#;
        let out = finalize_commit_message(raw, &["src/App.tsx".into()]);
        assert_eq!(out, "update App.tsx");
        assert!(!out.contains("subagent"));
        assert!(!out.contains("You are a senior"));
    }

    #[test]
    fn keeps_a_normal_commit_subject() {
        let out = finalize_commit_message("map: show aircraft heading\n\nKeep the trail.", &["src/App.tsx".into()]);
        assert_eq!(out, "map: show aircraft heading\n\nKeep the trail.");
    }

    #[test]
    fn related_chat_ignores_assistant_tool_tags() {
        let history = vec![
            ChatMessage {
                role: "assistant".into(),
                content: "<subagent_ref id=\"t\" agent=\"x\" task=\"src/App.tsx research\" />".into(),
                timestamp: 0.0,
                stats: None,
                model: None,
                feedback: None,
                hidden: false,
            },
            ChatMessage {
                role: "user".into(),
                content: "tweak src/App.tsx heading".into(),
                timestamp: 0.0,
                stats: None,
                model: None,
                feedback: None,
                hidden: false,
            },
        ];
        let chat = related_chat_for_commit(&history, None, &["src/App.tsx".into()]).unwrap();
        assert!(chat.contains("tweak src/App.tsx"));
        assert!(!chat.contains("subagent"));
    }
}
