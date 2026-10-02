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

fn safe_branch(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 80 || name.contains("..") || name.starts_with('-') {
        return Err("Invalid branch name.".into());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '-' | '_' | '.'))
    {
        return Err("Invalid branch name.".into());
    }
    Ok(name.to_string())
}

pub(super) fn tool_git_diff(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let staged = args.get("staged").and_then(|v| v.as_bool()).unwrap_or(false);
    let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("").trim();
    let result = if !path.is_empty() {
        git::git_file_diff(ctx.project_path.to_string(), path.to_string())
    } else if staged {
        git::git_staged_diff(ctx.project_path.to_string())
    } else {
        git::git_diff(ctx.project_path.to_string())
    };
    match result {
        Ok(out) => {
            let body = if out.trim().is_empty() {
                "No diff.".to_string()
            } else {
                out.chars().take(12000).collect()
            };
            ToolOutcome {
                tool_result: body.clone(),
                ui_chunk: git_ui_chunk("diff", "completed", &body),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("git_diff", &e.to_string()),
    }
}

pub(super) fn tool_git_branches(ctx: &ToolCtx<'_>) -> ToolOutcome {
    match git::git_branches(ctx.project_path.to_string()) {
        Ok(names) => {
            let current = git::git_current_branch(ctx.project_path.to_string()).unwrap_or_default();
            let out = if names.is_empty() {
                "No branches.".to_string()
            } else {
                names
                    .into_iter()
                    .map(|name| {
                        if name == current {
                            format!("* {name}")
                        } else {
                            format!("  {name}")
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            ToolOutcome {
                tool_result: out.clone(),
                ui_chunk: git_ui_chunk("branches", "completed", &out),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("git_branches", &e.to_string()),
    }
}

pub(super) fn tool_git_create_branch(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("git_create_branch", "Creating a branch is not allowed in Ask or Plan mode.");
    }
    let name = match get_str(args, "name").and_then(|s| safe_branch(&s)) {
        Ok(s) => s,
        Err(e) => return error_outcome("git_create_branch", &e),
    };
    match git::git_create_branch(ctx.project_path.to_string(), name.clone()) {
        Ok(()) => {
            let msg = format!("Created {name}");
            ToolOutcome {
                tool_result: msg.clone(),
                ui_chunk: git_ui_chunk("branch", "completed", &msg),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("git_create_branch", &e.to_string()),
    }
}

pub(super) fn tool_git_switch(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("git_switch", "Switching branches is not allowed in Ask or Plan mode.");
    }
    let name = match get_str(args, "name").and_then(|s| safe_branch(&s)) {
        Ok(s) => s,
        Err(e) => return error_outcome("git_switch", &e),
    };
    match git::git_switch_branch(ctx.project_path.to_string(), name.clone()) {
        Ok(()) => {
            let msg = format!("Switched to {name}");
            ToolOutcome {
                tool_result: msg.clone(),
                ui_chunk: git_ui_chunk("switch", "completed", &msg),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("git_switch", &e.to_string()),
    }
}

pub(super) fn tool_git_sync(ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("git_sync", "Sync is not allowed in Ask or Plan mode.");
    }
    match git::git_sync(ctx.project_path.to_string()) {
        Ok(()) => {
            let msg = "Synced the current branch with its upstream.";
            ToolOutcome {
                tool_result: msg.to_string(),
                ui_chunk: git_ui_chunk("sync", "completed", msg),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("git_sync", &e.to_string()),
    }
}

pub(super) fn tool_git_worktree(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let action = args.get("action").and_then(|v| v.as_str()).unwrap_or("list");
    if action != "list" && is_read_only_mode(ctx.mode) {
        return blocked_outcome("git_worktree", "Changing worktrees is not allowed in Ask or Plan mode.");
    }
    let mut git_bin = match crate::core::git_bin::git_command() {
        Ok(cmd) => cmd,
        Err(e) => return error_outcome("git_worktree", &e.to_string()),
    };
    let repo = ctx.project_path;
    let output = match action {
        "list" => git_bin
            .current_dir(repo)
            .args(["worktree", "list", "--porcelain"])
            .output(),
        "add" => {
            let branch = match get_str(args, "branch").and_then(|s| safe_branch(&s)) {
                Ok(s) => s,
                Err(e) => return error_outcome("git_worktree", &e),
            };
            let root = std::path::Path::new(repo);
            let parent = root.parent().unwrap_or(root);
            let folder = root
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("repo");
            let dest = parent.join(format!("{folder}-{branch}").replace('/', "-"));
            git_bin
                .current_dir(repo)
                .args(["worktree", "add", "-b", &branch])
                .arg(&dest)
                .output()
        }
        "remove" => {
            let path = match get_str(args, "path") {
                Ok(s) => s.to_string(),
                Err(e) => return error_outcome("git_worktree", &e),
            };
            if path.contains("..") {
                return error_outcome("git_worktree", "Invalid worktree path.");
            }
            git_bin
                .current_dir(repo)
                .args(["worktree", "remove", &path])
                .output()
        }
        _ => return error_outcome("git_worktree", "action must be list, add, or remove."),
    };
    match output {
        Ok(out) => {
            let bytes = if out.status.success() { out.stdout } else { out.stderr };
            let text = String::from_utf8_lossy(&bytes);
            let body = text.trim().chars().take(8000).collect::<String>();
            let status = if out.status.success() { "completed" } else { "error" };
            ToolOutcome {
                tool_result: body.clone(),
                ui_chunk: git_ui_chunk("worktree", status, &body),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("git_worktree", &e.to_string()),
    }
}
