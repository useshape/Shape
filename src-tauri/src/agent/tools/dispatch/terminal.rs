//! Terminal session tools and command approval.

use serde_json::{json, Value};
use tauri::Emitter;

use crate::agent::commands::{logging, streaming, terminal};
use crate::agent::models::PendingCommand;
use crate::agent::security::{self, commands::CommandSafety};
use crate::agent::tools::files;
use crate::commands::pty::SessionKind;

use super::common::{
    blocked_outcome, clip, error_outcome, escape_xml_text, get_str, is_read_only_mode,
    ApprovalDecision,
};
use super::files::{cat_ui_chunk, tool_list_dir, tool_read_file};
use super::{SideEffect, ToolCtx, ToolOutcome};

pub(super) async fn tool_run_terminal(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("run_terminal", "Running terminal commands is not allowed in Ask or Plan mode.");
    }
    let command = match get_str(args, "command") {
        Ok(s) => s,
        Err(e) => return error_outcome("run_terminal", &e),
    };

    // Models sometimes try `cat file` / `dir folder` via the terminal even though
    // dedicated tools exist. Running a shell for simple file inspection wastes loops,
    // bypasses read tracking, and on Windows may prompt/format unexpectedly. Translate
    // those commands into the proper tools instead of executing them.
    if let Some(outcome) = intercept_file_inspection_command(&command, ctx) {
        return outcome;
    }

    if let Some(outcome) = intercept_file_mutation_command(&command) {
        return outcome;
    }

    let policy = ctx.agent_state.turn_policy();
    let safety = security::commands::apply_auto_run_mode(
        security::commands::check_command_safety(&command),
        &command,
        policy.auto_run_mode,
        policy.protect_destructive_git,
    );
    match safety {
        CommandSafety::Blocked { reason } => {
            logging::warn("dispatch", &format!("Command blocked: {}", reason));
            ToolOutcome {
                tool_result: format!("BLOCKED: Command '{}' was blocked by security: {}", command, reason),
                ui_chunk: format!(
                    "\n<terminal_command status=\"blocked\">{}\nBlocked: {}</terminal_command>\n",
                    command, reason
                ),
                side_effect: None,
            }
        }
        CommandSafety::Safe => {
            let cmd_id = format!("cmd-{}", uuid::Uuid::new_v4());
            execute_terminal_session(&command, &cmd_id, ctx).await
        }
        CommandSafety::NeedsApproval { reason } => {
            run_with_approval(&command, &reason, ctx).await
        }
    }
}

/// Run a command through the unified session engine and build the tool outcome.
/// The `cmd_id` correlates the chat card, live output events, and this result.
pub(super) async fn execute_terminal_session(command: &str, cmd_id: &str, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(pty_state) = ctx.pty_state else {
        return error_outcome("run_terminal", "Terminal state is not available.");
    };

    streaming::emit_chat_status(
        ctx.app_handle,
        json!({
            "phase": "tool",
            "tool": "run_terminal",
            "label": format!("Running {}", clip(command, 60)),
        }),
    );

    // Durable running status so late listeners / transcript reloads see a coherent card.
    ctx.emit_ui_token(format!(
        "\n<terminal_command status=\"running\" id=\"{}\">{}</terminal_command>\n",
        cmd_id, command
    ));

    let result = terminal::run_agent_command(
        command,
        ctx.project_path,
        ctx.app_handle,
        pty_state,
        ctx.agent_state,
        ctx.cancel.clone(),
        cmd_id,
    )
    .await;

    if result.cancelled {
        return ToolOutcome {
            tool_result: "[Command cancelled by user]".to_string(),
            ui_chunk: format!(
                "\n<terminal_command status=\"cancelled\" id=\"{}\" session=\"{}\">{}\n</terminal_command>\n",
                cmd_id, result.session_id, command
            ),
            side_effect: None,
        };
    }

    if result.completed {
        let failed = result.exit_code.map(|c| c != 0).unwrap_or(false);
        let status = if failed { "failed" } else { "completed" };
        let tool_result = format!(
            "Command: {}\nOutput:\n{}",
            command,
            clip(&terminal::format_command_result(&result), 10_000)
        );
        ToolOutcome {
            tool_result,
            ui_chunk: format!(
                "\n<terminal_command status=\"{}\" id=\"{}\" session=\"{}\" exit=\"{}\">{}\n{}\n</terminal_command>\n",
                status,
                cmd_id,
                result.session_id,
                result.exit_code.unwrap_or(-1),
                command,
                escape_xml_text(&clip(&result.output, 2_000))
            ),
            side_effect: None,
        }
    } else {
        ToolOutcome {
            tool_result: terminal::format_background_result(&result, command),
            ui_chunk: format!(
                "\n<terminal_command status=\"background\" id=\"{}\" session=\"{}\">{}\n{}\n</terminal_command>\n",
                cmd_id,
                result.session_id,
                command,
                escape_xml_text(&clip(&result.output, 2_000))
            ),
            side_effect: None,
        }
    }
}

pub(super) fn intercept_file_mutation_command(command: &str) -> Option<ToolOutcome> {
    let cmd_lower = command.trim().to_lowercase();
    if cmd_lower.is_empty() {
        return None;
    }

    let blocked_reason = if cmd_lower.starts_with("python -c")
        || cmd_lower.starts_with("python3 -c")
        || cmd_lower.contains("powershell -command")
        || cmd_lower.contains("powershell -enc")
        || cmd_lower.contains("pwsh -command")
    {
        Some("Shell one-liners cannot edit files. Use `edit_file` or `apply_patch` (whichever is in your tool list).")
    } else if cmd_lower.contains("set-content")
        || cmd_lower.contains("out-file")
        || cmd_lower.contains("add-content")
        || cmd_lower.contains("get-content")
            && cmd_lower.contains("-replace")
        || cmd_lower.contains(" open(")
            && (cmd_lower.contains(".write(") || cmd_lower.contains(".writelines("))
    {
        Some("Writing files through the shell is blocked. Use `edit_file` or `apply_patch` (whichever is in your tool list).")
    } else if cmd_lower.contains(" > ")
        || cmd_lower.contains(" >> ")
        || cmd_lower.starts_with("sed -i")
        || cmd_lower.contains("sed -i")
    {
        Some("Redirecting shell output to files is blocked. Use `edit_file` or `apply_patch` (whichever is in your tool list).")
    } else {
        None
    };

    blocked_reason.map(|reason| ToolOutcome {
        tool_result: format!("BLOCKED: {} Command: {}", reason, command),
        ui_chunk: format!(
            "\n<terminal_command status=\"blocked\">{}\nBlocked: {}</terminal_command>\n",
            command, reason
        ),
        side_effect: None,
    })
}

pub(super) fn intercept_file_inspection_command(command: &str, ctx: &ToolCtx<'_>) -> Option<ToolOutcome> {
    let trimmed = command.trim();
    if trimmed.contains('|') || trimmed.contains("&&") || trimmed.contains(';') {
        return None;
    }

    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    match parts.as_slice() {
        ["cat", path] | ["type", path] => {
            let args = serde_json::json!({ "path": *path });
            Some(tool_read_file(&args, ctx))
        }
        ["cat", ..] | ["type", ..] => {
            Some(error_outcome("run_terminal", "Using `cat` or `type` with globs/multiple files is not supported. Use `read_file` or `grep`."))
        }
        ["head", path] => {
            let args = serde_json::json!({ "path": *path, "start_line": 1, "end_line": 80 });
            Some(tool_read_file(&args, ctx))
        }
        ["tail", path] => {
            let res = files::read_file(path, ctx.project_path);
            Some(match res {
                Ok(content) => {
                    let tail = content
                        .lines()
                        .rev()
                        .take(80)
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect::<Vec<_>>()
                        .join("\n");
                    ToolOutcome {
                        tool_result: tail.clone(),
                        ui_chunk: cat_ui_chunk(path, None, None),
                        side_effect: Some(SideEffect::FileRead {
                            path: (*path).to_string(),
                            content,
                        }),
                    }
                }
                Err(e) => error_outcome("run_terminal", &e.to_string()),
            })
        }
        ["ls"] | ["dir"] => {
            let args = serde_json::json!({ "path": "." });
            Some(tool_list_dir(&args, ctx))
        }
        ["ls", path] | ["dir", path] => {
            if path.starts_with('-') || path.contains('/') && path.starts_with('-') {
                return Some(error_outcome("run_terminal", "Using `ls` or `dir` with flags (like -R or /s) is not supported. Use `list_dir` or `grep`."));
            }
            let args = serde_json::json!({ "path": *path });
            Some(tool_list_dir(&args, ctx))
        }
        ["ls", ..] | ["dir", ..] => {
            Some(error_outcome("run_terminal", "Using `ls` or `dir` with multiple arguments is not supported. Use `list_dir` or `grep`."))
        }
        ["find", ..] => {
            Some(error_outcome("run_terminal", "Using `find` is not supported. Use `list_dir` or `grep` instead."))
        }
        _ => {
            // Also catch things like `ls -R path` where `ls` is the first part
            if parts[0] == "ls" || parts[0] == "dir" || parts[0] == "find" || parts[0] == "cat" || parts[0] == "type" {
                return Some(error_outcome("run_terminal", &format!("Using `{}` via the terminal is blocked to prevent looping and formatting issues. Use native tools (`list_dir`, `read_file`, `grep`) instead.", parts[0])));
            }
            None
        }
    }
}

/// Outcome of waiting for a user decision on a pending approval.
/// Wait until the user approves/rejects the pending command, or the turn is
/// cancelled. There is deliberately NO timeout: silently converting "no answer
/// yet" into a rejection desynced the model from reality (the user could
/// approve later and the command would run with the model believing it was
/// rejected). The Stop button (cancel token) is the escape hatch.
pub(super) async fn wait_for_command_decision(cmd_id: &str, ctx: &ToolCtx<'_>) -> ApprovalDecision {
    loop {
        if ctx.cancel.is_cancelled() {
            return ApprovalDecision::Cancelled;
        }
        if let Ok(mut decisions) = ctx.agent_state.command_decisions.lock() {
            if let Some(approved) = decisions.remove(cmd_id) {
                return if approved {
                    ApprovalDecision::Approved
                } else {
                    ApprovalDecision::Rejected
                };
            }
        }
        // Defensive: pending entry vanished without a decision (e.g. state reset).
        let still_pending = ctx
            .agent_state
            .pending_commands
            .lock()
            .map(|p| p.contains_key(cmd_id))
            .unwrap_or(false);
        if !still_pending {
            if let Ok(mut decisions) = ctx.agent_state.command_decisions.lock() {
                if let Some(approved) = decisions.remove(cmd_id) {
                    return if approved {
                        ApprovalDecision::Approved
                    } else {
                        ApprovalDecision::Rejected
                    };
                }
            }
            return ApprovalDecision::Rejected;
        }
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }
}

pub(super) fn cleanup_pending_command(cmd_id: &str, ctx: &ToolCtx<'_>) {
    if let Ok(mut pendings) = ctx.agent_state.pending_commands.lock() {
        pendings.remove(cmd_id);
    }
    if let Ok(mut decisions) = ctx.agent_state.command_decisions.lock() {
        decisions.remove(cmd_id);
    }
}

pub(super) fn emit_command_resolved(ctx: &ToolCtx<'_>, cmd_id: &str, approved: bool) {
    let _ = ctx.app_handle.emit(
        "agent-command-resolved",
        json!({ "id": cmd_id, "approved": approved }),
    );
}

pub(super) async fn run_git_commit_with_approval(
    preview: &str,
    message: &str,
    ctx: &ToolCtx<'_>,
) -> ToolOutcome {
    let cmd_id = format!("cmd-{}", uuid::Uuid::new_v4());
    let pending = PendingCommand {
        id: cmd_id.clone(),
        command: preview.to_string(),
        safety: "needs_approval".to_string(),
        reason: "Creates a git commit with your currently staged changes.".to_string(),
        action: Some("git_commit".to_string()),
        payload: Some(message.to_string()),
    };

    if let Ok(mut pendings) = ctx.agent_state.pending_commands.lock() {
        pendings.insert(cmd_id.clone(), pending.clone());
    }

    let _ = ctx.emit_ui_token(format!(
        "\n<terminal_command status=\"pending\" id=\"{}\">{}\nAwaiting approval: {}</terminal_command>\n",
        cmd_id, preview, pending.reason
    ));
    let _ = ctx.app_handle.emit("agent-command-pending", pending);
    streaming::emit_chat_status(
        ctx.app_handle,
        json!({ "phase": "approval", "label": "Waiting for approval" }),
    );

    let decision = wait_for_command_decision(&cmd_id, ctx).await;
    cleanup_pending_command(&cmd_id, ctx);

    match decision {
        ApprovalDecision::Approved => {
            emit_command_resolved(ctx, &cmd_id, true);
            let result = crate::domain::git::service::git_commit(
                ctx.project_path.to_string(),
                message.to_string(),
            )
            .await;
            match result {
                Ok(()) => ToolOutcome {
                    tool_result: "Commit created.".to_string(),
                    ui_chunk: format!(
                        "\n<terminal_command status=\"completed\" id=\"{}\">{}\n</terminal_command>\n",
                        cmd_id, preview
                    ),
                    side_effect: None,
                },
                Err(e) => ToolOutcome {
                    tool_result: format!("Commit failed: {}", e),
                    ui_chunk: format!(
                        "\n<terminal_command status=\"failed\" id=\"{}\">{}\n{}\n</terminal_command>\n",
                        cmd_id,
                        preview,
                        escape_xml_text(&e.to_string())
                    ),
                    side_effect: None,
                },
            }
        }
        ApprovalDecision::Rejected => {
            emit_command_resolved(ctx, &cmd_id, false);
            ToolOutcome {
                tool_result: "Commit was rejected by the user. Do NOT retry it.".to_string(),
                ui_chunk: format!(
                    "\n<terminal_command status=\"rejected\" id=\"{}\">{}\n</terminal_command>\n",
                    cmd_id, preview
                ),
                side_effect: None,
            }
        }
        ApprovalDecision::Cancelled => ToolOutcome {
            tool_result: "Turn was cancelled while waiting for commit approval.".to_string(),
            ui_chunk: format!(
                "\n<terminal_command status=\"cancelled\" id=\"{}\">{}\n</terminal_command>\n",
                cmd_id, preview
            ),
            side_effect: None,
        },
    }
}

pub(super) async fn run_with_approval(command: &str, reason: &str, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let cmd_id = format!("cmd-{}", uuid::Uuid::new_v4());
    let pending = PendingCommand {
        id: cmd_id.clone(),
        command: command.to_string(),
        safety: "needs_approval".to_string(),
        reason: reason.to_string(),
        action: None,
        payload: None,
    };

    if let Ok(mut pendings) = ctx.agent_state.pending_commands.lock() {
        pendings.insert(cmd_id.clone(), pending.clone());
    }

    let _ = ctx.emit_ui_token(format!(
        "\n<terminal_command status=\"pending\" id=\"{}\">{}\nAwaiting approval: {}</terminal_command>\n",
        cmd_id, command, reason
    ));
    let _ = ctx.app_handle.emit("agent-command-pending", pending);
    streaming::emit_chat_status(
        ctx.app_handle,
        json!({ "phase": "approval", "label": "Waiting for approval" }),
    );

    let decision = wait_for_command_decision(&cmd_id, ctx).await;
    cleanup_pending_command(&cmd_id, ctx);

    match decision {
        ApprovalDecision::Approved => {
            emit_command_resolved(ctx, &cmd_id, true);
            // Execute through the SAME path as auto-approved commands: same
            // session engine, same streaming, same cancel token, same card id.
            let mut outcome = execute_terminal_session(command, &cmd_id, ctx).await;
            outcome.tool_result = format!("(approved by user)\n{}", outcome.tool_result);
            outcome
        }
        ApprovalDecision::Rejected => {
            emit_command_resolved(ctx, &cmd_id, false);
            ToolOutcome {
                tool_result: format!(
                    "Command '{}' was rejected by the user. Do NOT retry it or attempt an equivalent command. Continue the task without it, or ask the user how to proceed.",
                    command
                ),
                ui_chunk: format!(
                    "\n<terminal_command status=\"rejected\" id=\"{}\">{}\n</terminal_command>\n",
                    cmd_id, command
                ),
                side_effect: None,
            }
        }
        ApprovalDecision::Cancelled => ToolOutcome {
            tool_result: "Turn was cancelled while waiting for command approval.".to_string(),
            ui_chunk: format!(
                "\n<terminal_command status=\"cancelled\" id=\"{}\">{}\n</terminal_command>\n",
                cmd_id, command
            ),
            side_effect: None,
        },
    }
}
pub(super) fn tool_list_terminals(ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(pty_state) = ctx.pty_state else {
        return error_outcome("list_terminals", "Terminal state is not available.");
    };
    let snapshots = pty_state.list_session_snapshots();
    if snapshots.is_empty() {
        return ToolOutcome {
            tool_result: "No active terminal sessions.".to_string(),
            ui_chunk: "\n<list_terminals>No active sessions</list_terminals>\n".to_string(),
            side_effect: None,
        };
    }
    let listing: Vec<String> = snapshots
        .iter()
        .map(|s| {
            format!(
                "session_id: {} | running: {} | command: {}",
                s.session_id,
                s.running,
                s.command.as_deref().unwrap_or("(unknown)")
            )
        })
        .collect();
    let result = listing.join("\n");
    ToolOutcome {
        tool_result: format!(
            "{}\n\nUse read_terminal with a session_id to inspect output.",
            result
        ),
        ui_chunk: format!("\n<list_terminals>\n{}\n</list_terminals>\n", result),
        side_effect: None,
    }
}

/// Render a session snapshot as model-facing text (shared by read_terminal and
/// session-aware wait).
pub(super) fn format_session_snapshot(
    snapshot: &crate::commands::pty::TerminalSessionSnapshot,
    tail_chars: usize,
) -> String {
    let status = if snapshot.running {
        if snapshot.waiting_for_input {
            "still running — output ends in what looks like an interactive prompt; \
             it may be waiting for input (use write_to_terminal to answer it)"
                .to_string()
        } else {
            "still running".to_string()
        }
    } else {
        format!("finished, exit code {}", snapshot.exit_code.unwrap_or(-1))
    };
    let header = format!(
        "Terminal session {} ({}) — {} chars captured",
        snapshot.session_id, status, snapshot.output_chars
    );
    let command_line = snapshot
        .command
        .as_ref()
        .map(|c| format!("Command: {}", c))
        .unwrap_or_default();
    let cleaned = if snapshot.kind == SessionKind::AgentPiped {
        snapshot.output.clone()
    } else {
        terminal::strip_ansi(&snapshot.output)
    };
    let body = if cleaned.trim().is_empty() {
        "(no output yet)".to_string()
    } else {
        cleaned
    };
    format!("{}\n{}\n\n{}", header, command_line, clip(&body, tail_chars))
}

pub(super) fn tool_read_terminal(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let session_id = match args.get("session_id").and_then(|v| v.as_u64()) {
        Some(id) => id as u32,
        None => return error_outcome("read_terminal", "session_id is required."),
    };
    let tail_chars = args
        .get("tail_chars")
        .and_then(|v| v.as_u64())
        .unwrap_or(8000) as usize;
    let Some(pty_state) = ctx.pty_state else {
        return error_outcome("read_terminal", "Terminal state is not available.");
    };

    match pty_state.read_session_output(session_id, tail_chars) {
        Ok(snapshot) => {
            let tool_result = format_session_snapshot(&snapshot, 12_000);
            ToolOutcome {
                tool_result: tool_result.clone(),
                ui_chunk: format!(
                    "\n<terminal_read session=\"{}\" running=\"{}\">\n{}\n</terminal_read>\n",
                    snapshot.session_id,
                    snapshot.running,
                    escape_xml_text(&clip(&tool_result, 3000))
                ),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("read_terminal", &e.to_string()),
    }
}

pub(super) async fn tool_wait(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let seconds = args
        .get("seconds")
        .and_then(|v| v.as_u64())
        .unwrap_or(10)
        .clamp(1, 180);
    let reason = args
        .get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("Waiting before checking command progress");
    let session_id = args
        .get("session_id")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32);

    // Session-aware wait: returns as soon as the session exits instead of
    // sleeping blind. One wait call rides until completion (or the cap).
    if let Some(id) = session_id {
        let Some(pty_state) = ctx.pty_state else {
            return error_outcome("wait", "Terminal state is not available.");
        };
        let started = std::time::Instant::now();
        let finished = pty_state
            .wait_for_session_exit(
                id,
                std::time::Duration::from_secs(seconds),
                &ctx.cancel,
            )
            .await;
        if ctx.cancel.is_cancelled() {
            return ToolOutcome {
                tool_result: "Wait cancelled.".to_string(),
                ui_chunk: "\n<status>Wait cancelled</status>\n".to_string(),
                side_effect: None,
            };
        }
        let waited = started.elapsed().as_secs();
        let snapshot_text = pty_state
            .read_session_output(id, 8_000)
            .map(|s| format_session_snapshot(&s, 12_000))
            .unwrap_or_else(|e| format!("(could not read session {}: {})", id, e));
        let headline = if finished {
            format!("Session {} finished after {}s of waiting.", id, waited)
        } else {
            format!(
                "Session {} is still running after {}s. Wait again with session_id={} or continue other work.",
                id, waited, id
            )
        };
        return ToolOutcome {
            tool_result: format!("{}\n\n{}", headline, snapshot_text),
            ui_chunk: format!(
                "\n<status>Waited {}s for session {} — {}</status>\n",
                waited,
                id,
                if finished { "finished" } else { "still running" }
            ),
            side_effect: None,
        };
    }

    let total = std::time::Duration::from_secs(seconds);
    let step = std::time::Duration::from_millis(250);
    let mut remaining = total;
    while remaining > std::time::Duration::ZERO {
        if ctx.cancel.is_cancelled() {
            return ToolOutcome {
                tool_result: "Wait cancelled.".to_string(),
                ui_chunk: "\n<status>Wait cancelled</status>\n".to_string(),
                side_effect: None,
            };
        }
        let sleep_for = remaining.min(step);
        tokio::time::sleep(sleep_for).await;
        remaining = remaining.saturating_sub(sleep_for);
    }

    ToolOutcome {
        tool_result: format!(
            "Waited {} seconds. {} — use read_terminal or list_terminals to check progress.",
            seconds, reason
        ),
        ui_chunk: format!(
            "\n<status>Waited {}s — {}</status>\n",
            seconds,
            escape_xml_text(reason)
        ),
        side_effect: None,
    }
}

pub(super) fn tool_write_to_terminal(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("write_to_terminal", "Writing to terminal is not allowed in Ask or Plan mode.");
    }
    let session_id = match args.get("session_id").and_then(|v| v.as_u64()) {
        Some(id) => id as u32,
        None => return error_outcome("write_to_terminal", "session_id is required."),
    };
    let input = match get_str(args, "input") {
        Ok(s) => s,
        Err(e) => return error_outcome("write_to_terminal", &e),
    };
    let Some(pty_state) = ctx.pty_state else {
        return error_outcome("write_to_terminal", "Terminal state is not available.");
    };

    // Never write into interactive user terminals — only agent-owned sessions
    // (those with a recorded command from agent terminal tools).
    let snapshot = match pty_state.read_session_output(session_id, 500) {
        Ok(s) => s,
        Err(e) => return error_outcome("write_to_terminal", &e.to_string()),
    };
    if snapshot.command.is_none() {
        return blocked_outcome(
            "write_to_terminal",
            "Refusing to write to an interactive user terminal. Use run_terminal_command for agent shells.",
        );
    }

    match pty_state.write_to_session(session_id, &input) {
        Ok(()) => ToolOutcome {
            tool_result: format!("Sent {} bytes to terminal session {}.", input.len(), session_id),
            ui_chunk: format!(
                "\n<terminal_input session=\"{}\">{}</terminal_input>\n",
                session_id,
                escape_xml_text(&clip(&input, 200))
            ),
            side_effect: None,
        },
        Err(e) => error_outcome("write_to_terminal", &e.to_string()),
    }
}
