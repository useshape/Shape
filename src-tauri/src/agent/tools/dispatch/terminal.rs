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
use super::discover::tool_grep;
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
    if let Some(outcome) = intercept_file_inspection_command(&command, ctx).await {
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

    let looks_like_read = cmd_lower.contains(".read(")
        || cmd_lower.contains(".readlines(")
        || cmd_lower.contains("readfile")
        || cmd_lower.contains("get-content")
        || cmd_lower.contains("select-string")
        || cmd_lower.contains("splitlines");

    let blocked_reason = if cmd_lower.starts_with("python -c")
        || cmd_lower.starts_with("python3 -c")
        || cmd_lower.contains("powershell -command")
        || cmd_lower.contains("powershell -enc")
        || cmd_lower.contains("pwsh -command")
    {
        // Steering a read attempt toward edit tools sends the model looking for another
        // shell trick instead of the tool it actually wanted.
        if looks_like_read {
            Some("Shell one-liners cannot inspect files. Use `read_file` (it takes start_line/end_line) or `grep`.")
        } else {
            Some("Shell one-liners cannot edit files. Use `edit_file` or `apply_patch` (whichever is in your tool list).")
        }
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

/// Split a command into pipeline/statement segments, ignoring separators inside quotes.
fn split_command_segments(command: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut chars = command.chars().peekable();
    while let Some(c) = chars.next() {
        match quote {
            Some(q) => {
                cur.push(c);
                if c == q {
                    quote = None;
                }
            }
            None => match c {
                '\'' | '"' => {
                    quote = Some(c);
                    cur.push(c);
                }
                '|' | ';' | '\n' => out.push(std::mem::take(&mut cur)),
                '&' if chars.peek() == Some(&'&') => {
                    chars.next();
                    out.push(std::mem::take(&mut cur));
                }
                _ => cur.push(c),
            },
        }
    }
    out.push(cur);
    out.into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Split a segment into argv, stripping quotes.
fn tokenize_segment(segment: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    let mut quote: Option<char> = None;
    for c in segment.chars() {
        match quote {
            Some(q) if c == q => quote = None,
            Some(_) => cur.push(c),
            None => match c {
                '\'' | '"' => {
                    quote = Some(c);
                    quoted = true;
                }
                _ if c.is_whitespace() => {
                    if quoted || !cur.is_empty() {
                        out.push(std::mem::take(&mut cur));
                        quoted = false;
                    }
                }
                _ => cur.push(c),
            },
        }
    }
    if quoted || !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// Pipeline stages that only reshape output, so the command feeding them is still a plain read.
const BENIGN_PIPELINE_STAGES: &[&str] = &[
    "select-object", "select", "format-list", "fl", "format-table", "ft", "out-string",
    "out-host", "measure-object", "measure", "sort-object", "sort", "write-output",
    "write-host", "echo", "more",
];

fn command_name(token: &str) -> String {
    let lowered = token.to_ascii_lowercase();
    lowered
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(&lowered)
        .trim_end_matches(".exe")
        .to_string()
}

fn is_benign_stage(segment: &str) -> bool {
    tokenize_segment(segment)
        .first()
        .map(|t| BENIGN_PIPELINE_STAGES.contains(&command_name(t).as_str()))
        .unwrap_or(false)
}

#[derive(Default)]
struct ShellReadArgs {
    path: Option<String>,
    pattern: Option<String>,
    head: Option<usize>,
    tail: Option<usize>,
    context: usize,
    /// Arguments with no flag, in the order they appeared.
    positional: Vec<String>,
}

/// Best-effort argv parse covering POSIX flags and PowerShell named parameters.
/// Callers assign positionals themselves, since `grep <pattern> <path>` and
/// `Select-String -Path <path>` order them differently.
fn parse_shell_read_args(args: &[String]) -> ShellReadArgs {
    let mut out = ShellReadArgs::default();
    let mut i = 0;
    while i < args.len() {
        let raw = args[i].as_str();
        if raw.starts_with('-') && raw.len() > 1 {
            let flag = raw.trim_start_matches('-').to_ascii_lowercase();
            let value = args.get(i + 1);
            // Numeric flags only consume the next token when it really is a number;
            // `-n` means "line numbers" to grep but "count" to head.
            let num = value
                .and_then(|v| v.split(',').next())
                .and_then(|v| v.parse::<usize>().ok());
            let consumed = match flag.as_str() {
                "path" | "literalpath" | "filepath" => {
                    out.path = value.cloned();
                    value.is_some()
                }
                "pattern" | "regexp" | "e" => {
                    out.pattern = value.cloned();
                    value.is_some()
                }
                "totalcount" | "first" | "head" | "n" => {
                    out.head = num;
                    num.is_some()
                }
                "tail" | "last" => {
                    out.tail = num;
                    num.is_some()
                }
                "context" | "c" => {
                    out.context = num.unwrap_or(0);
                    num.is_some()
                }
                "encoding" | "delimiter" => value.is_some(),
                _ => false,
            };
            i += if consumed { 2 } else { 1 };
            continue;
        }
        out.positional.push(raw.to_string());
        i += 1;
    }
    out
}

fn redirected(outcome: ToolOutcome, tool: &str) -> ToolOutcome {
    let ToolOutcome { tool_result, ui_chunk, side_effect } = outcome;
    ToolOutcome {
        tool_result: format!(
            "{}{tool}` tool instead of a shell command. Any other flags were ignored — \
             call `{tool}` directly next time.]\n{tool_result}",
            super::REDIRECTED_TOOL_PREFIX
        ),
        ui_chunk,
        side_effect,
    }
}

fn read_tail(path: &str, count: usize, ctx: &ToolCtx<'_>) -> ToolOutcome {
    match files::read_file(path, ctx.project_path) {
        Ok(content) => {
            let lines: Vec<&str> = content.lines().collect();
            let tail = lines[lines.len().saturating_sub(count)..].join("\n");
            ToolOutcome {
                tool_result: tail,
                ui_chunk: cat_ui_chunk(path, None, None),
                side_effect: Some(SideEffect::FileRead { path: path.to_string(), content }),
            }
        }
        Err(e) => error_outcome("run_terminal", &e.to_string()),
    }
}

/// Translate shell file inspection into the equivalent native tool.
///
/// Running a shell for this wastes loops, bypasses read tracking, and on Windows may
/// format output unexpectedly. Covers POSIX commands and the PowerShell cmdlets/aliases
/// that models reach for, including read-only pipelines like `Get-Content x | Select -First 5`.
pub(super) async fn intercept_file_inspection_command(
    command: &str,
    ctx: &ToolCtx<'_>,
) -> Option<ToolOutcome> {
    let segments = split_command_segments(command);
    let (first, rest) = segments.split_first()?;
    if !rest.iter().all(|s| is_benign_stage(s)) {
        return None;
    }

    let tokens = tokenize_segment(first);
    let (head, args) = tokens.split_first()?;
    let name = command_name(head);
    let mut parsed = parse_shell_read_args(args);
    let steer = |msg: &str| Some(error_outcome("run_terminal", msg));

    match name.as_str() {
        "cat" | "type" | "gc" | "get-content" | "head" | "tail" => {
            let path = parsed.path.take().or_else(|| parsed.positional.first().cloned())?;
            if path.contains('*') || path.contains('?') {
                return steer("Reading several files with a glob is not supported. Use `read_file` per file, or `grep`.");
            }
            if name == "tail" || parsed.tail.is_some() {
                let n = parsed.tail.unwrap_or(80);
                return Some(redirected(read_tail(&path, n, ctx), "read_file"));
            }
            let limit = parsed.head.or(if name == "head" { Some(80) } else { None });
            let args = match limit {
                Some(n) => json!({ "path": path, "start_line": 1, "end_line": n }),
                None => json!({ "path": path }),
            };
            Some(redirected(tool_read_file(&args, ctx), "read_file"))
        }
        "ls" | "dir" | "gci" | "get-childitem" | "gi" | "get-item" => {
            let path = parsed.path.take().or_else(|| parsed.positional.first().cloned());
            if path.as_deref().is_some_and(|p| p.contains('*') || p.contains('?')) {
                return steer("Listing with a glob is not supported. Use `list_dir` or `search_files`.");
            }
            let args = json!({ "path": path.as_deref().unwrap_or(".") });
            Some(redirected(tool_list_dir(&args, ctx), "list_dir"))
        }
        "select-string" | "sls" => {
            // PowerShell positional order is <pattern> then <path>.
            let mut positional = parsed.positional.into_iter();
            let pattern = parsed.pattern.or_else(|| positional.next());
            let path = parsed.path.or_else(|| positional.next());
            let Some(pattern) = pattern else {
                return steer("Use the `grep` tool to search file contents.");
            };
            let mut args = json!({ "query": pattern, "context": parsed.context });
            if let Some(path) = path {
                args["path"] = json!(path);
            }
            Some(redirected(tool_grep(&args, ctx).await, "grep"))
        }
        "find" => steer("Using `find` is not supported. Use `list_dir`, `search_files`, or `grep` instead."),
        "test-path" => steer("Use `list_dir` to check whether a path exists."),
        _ => None,
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

#[cfg(test)]
mod tests {
    use super::*;

    fn args(command: &str) -> (String, ShellReadArgs) {
        let tokens = tokenize_segment(command);
        let (head, rest) = tokens.split_first().expect("command");
        (command_name(head), parse_shell_read_args(rest))
    }

    #[test]
    fn splits_on_separators_outside_quotes() {
        assert_eq!(
            split_command_segments("Get-Item 'app/page.tsx' | Select-Object Length, Name"),
            vec!["Get-Item 'app/page.tsx'", "Select-Object Length, Name"]
        );
        assert_eq!(split_command_segments("echo 'a | b'"), vec!["echo 'a | b'"]);
        assert_eq!(split_command_segments("a && b"), vec!["a", "b"]);
    }

    #[test]
    fn tokenizes_quoted_paths() {
        assert_eq!(
            tokenize_segment("Select-String -Path 'app/my page.tsx' -Pattern \"function X\""),
            vec!["Select-String", "-Path", "app/my page.tsx", "-Pattern", "function X"]
        );
    }

    #[test]
    fn formatting_stages_do_not_block_interception() {
        assert!(is_benign_stage("Select-Object Length, Name"));
        assert!(is_benign_stage("Format-Table"));
        assert!(!is_benign_stage("Remove-Item x"));
        assert!(!is_benign_stage("node script.js"));
    }

    #[test]
    fn reads_powershell_named_parameters() {
        let (name, parsed) = args("Get-Content -Path 'app/page.tsx' -TotalCount 40");
        assert_eq!(name, "get-content");
        assert_eq!(parsed.path.as_deref(), Some("app/page.tsx"));
        assert_eq!(parsed.head, Some(40));
    }

    #[test]
    fn reads_select_string_with_context() {
        let (name, parsed) = args("Select-String -Path 'app/page.tsx' -Pattern 'function X' -Context 0,50");
        assert_eq!(name, "select-string");
        assert_eq!(parsed.path.as_deref(), Some("app/page.tsx"));
        assert_eq!(parsed.pattern.as_deref(), Some("function X"));
        assert_eq!(parsed.context, 0);
    }

    #[test]
    fn valueless_flags_do_not_swallow_the_next_argument() {
        // `-n` means "line numbers" here, not a count, so `pattern` must survive.
        let (_, parsed) = args("grep -n pattern src/main.rs");
        assert_eq!(parsed.head, None);
        assert_eq!(parsed.positional, vec!["pattern", "src/main.rs"]);

        let (_, counted) = args("head -n 25 src/main.rs");
        assert_eq!(counted.head, Some(25));
        assert_eq!(counted.positional, vec!["src/main.rs"]);
    }

    #[test]
    fn strips_executable_paths_and_extensions() {
        assert_eq!(command_name("C:\\Windows\\System32\\findstr.exe"), "findstr");
        assert_eq!(command_name("/usr/bin/CAT"), "cat");
    }

    #[test]
    fn read_shaped_one_liners_are_pointed_at_read_file() {
        let blocked = intercept_file_mutation_command("python -c \"print(open('a.txt').read())\"")
            .expect("blocked");
        assert!(blocked.tool_result.contains("read_file"), "{}", blocked.tool_result);

        let write = intercept_file_mutation_command("python -c \"open('a.txt','w').write('x')\"")
            .expect("blocked");
        assert!(write.tool_result.contains("edit_file"), "{}", write.tool_result);
    }
}
