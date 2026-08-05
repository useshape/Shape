//! Git tools for the agent.

use serde_json::Value;

use crate::commands::git;

use super::common::{
    blocked_outcome, error_outcome, escape_xml_attr, escape_xml_text, get_str, is_read_only_mode,
};
use super::terminal::run_git_commit_with_approval;
use super::{ToolCtx, ToolOutcome};

pub(super) fn git_ui_chunk(op: &str, status: &str, body: &str) -> String {
    format!(
        "\n<git_operation op=\"{}\" status=\"{}\">{}</git_operation>\n",
        escape_xml_attr(op),
        escape_xml_attr(status),
        escape_xml_text(body)
    )
}

pub(super) fn format_git_status(path: &str) -> Result<String, String> {
    let files = git::git_status(path.to_string()).map_err(|e| e.to_string())?;
    if files.is_empty() {
        return Ok("Working tree clean — no staged or unstaged changes.".to_string());
    }
    let mut lines = Vec::new();
    for f in files {
        let area = if f.staged { "staged" } else { "unstaged" };
        lines.push(format!("[{}] {} {}", area, f.status, f.path));
    }
    Ok(lines.join("\n"))
}

pub(super) fn tool_git_status(ctx: &ToolCtx<'_>) -> ToolOutcome {
    match format_git_status(ctx.project_path) {
        Ok(out) => ToolOutcome {
            tool_result: out.clone(),
            ui_chunk: git_ui_chunk("status", "completed", &out),
            side_effect: None,
        },
        Err(e) => error_outcome("git_status", &e),
    }
}

pub(super) fn tool_git_fetch(ctx: &ToolCtx<'_>) -> ToolOutcome {
    let _ = ctx.emit_ui_token(git_ui_chunk("fetch", "running", "Fetching from remotes…"));
    match git::git_fetch(ctx.project_path.to_string()) {
        Ok(()) => {
            let msg = "Fetched from all remotes.";
            ToolOutcome {
                tool_result: msg.to_string(),
                ui_chunk: git_ui_chunk("fetch", "completed", msg),
                side_effect: None,
            }
        }
        Err(e) => {
            let msg = e.to_string();
            ToolOutcome {
                tool_result: format!("git fetch failed: {}", msg),
                ui_chunk: git_ui_chunk("fetch", "error", &msg),
                side_effect: None,
            }
        }
    }
}

pub(super) fn tool_git_log(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|v| v.min(50) as usize)
        .unwrap_or(10);
    match git::git_log(ctx.project_path.to_string(), Some(limit)) {
        Ok(entries) => {
            let out = if entries.is_empty() {
                "No commits found.".to_string()
            } else {
                entries
                    .iter()
                    .map(|e| {
                        let short = e.hash.chars().take(7).collect::<String>();
                        let subject = e.message.lines().next().unwrap_or("").trim();
                        format!("{} {} — {} ({})", short, e.date, subject, e.author)
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            ToolOutcome {
                tool_result: out.clone(),
                ui_chunk: git_ui_chunk("log", "completed", &out),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("git_log", &e.to_string()),
    }
}

pub(super) fn tool_git_stage(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("git_stage", "Staging files is not allowed in Ask or Plan mode.");
    }
    let path = match get_str(args, "path") {
        Ok(s) => s,
        Err(e) => return error_outcome("git_stage", &e),
    };
    match git::git_stage(ctx.project_path.to_string(), path.clone()) {
        Ok(()) => {
            let msg = format!("Staged {}", path);
            ToolOutcome {
                tool_result: msg.clone(),
                ui_chunk: git_ui_chunk("stage", "completed", &msg),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("git_stage", &e.to_string()),
    }
}

pub(super) async fn tool_git_commit(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("git_commit", "Committing is not allowed in Ask or Plan mode.");
    }
    let message = match get_str(args, "message") {
        Ok(s) => s.to_string(),
        Err(e) => return error_outcome("git_commit", &e),
    };
    if message.trim().is_empty() {
        return error_outcome("git_commit", "Commit message cannot be empty.");
    }
    // Approval UI shows a preview; execution uses libgit2 (no shell interpolation).
    let preview = format!(
        "git commit -m {}",
        serde_json::to_string(&message).unwrap_or_else(|_| "\"…\"".to_string())
    );
    run_git_commit_with_approval(&preview, &message, ctx).await
}
