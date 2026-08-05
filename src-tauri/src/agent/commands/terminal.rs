/// Agent terminal command execution.
///
/// Every command runs as a *terminal session* (see `commands::pty`):
///   * Piped subprocess by default — clean non-TTY output, deterministic exit.
///   * Direct-child PTY for dev servers / watch tasks that need a TTY.
///
/// `run_agent_command` blocks for a bounded foreground window streaming output
/// to the UI; if the command is still running at the deadline it converts to a
/// background session (it is NOT killed) and the caller gets the session id.
/// Completion is detected from the actual command process, so `read_terminal`
/// and `wait` report accurate `running` / `exit_code` state — the model never
/// has to guess from output text.
///
/// Two event channels are emitted:
///   * `shape-terminal-ai-action` — legacy payloads for the terminal panel.
///   * `agent-terminal-stream`   — command-correlated events for the chat UI's
///     live output card: `{ commandId, sessionId, kind, ... }`.

use std::sync::Arc;
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::agent::models::AgentState;
use crate::commands::pty::{self, AgentSessionCallbacks, PtyState};

use super::logging;

/// Foreground window before a still-running command converts to background.
pub const FOREGROUND_WINDOW_SECS: u64 = 25;
/// Dev servers return quickly — just long enough to catch instant failures.
pub const DEV_SERVER_CONFIRM_SECS: u64 = 3;

/// Output returned to the model is clipped to this many characters.
const MODEL_OUTPUT_CAP: usize = 50_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandExecutionMode {
    /// One-shot command (build, install, test, git…): piped subprocess.
    OneShot,
    /// Long-lived interactive process (dev server, watcher): PTY child.
    DevServer,
}

/// Classify how a command should be executed. Only genuinely long-lived
/// processes belong in `DevServer`; installs and builds are one-shot commands
/// that simply take a while — they run piped with a foreground window and
/// convert to background if slow.
pub fn classify_command(command: &str) -> CommandExecutionMode {
    let lower = command.trim().to_lowercase();
    const DEV_SERVER_PATTERNS: &[&str] = &[
        " run dev",
        "next dev",
        "nuxt dev",
        "npm start",
        "yarn dev",
        "pnpm dev",
        "bun dev",
        "yarn start",
        "pnpm start",
        " --watch",
        "cargo watch",
        "nodemon",
        "webpack serve",
        "vite dev",
        "vite serve",
        "turbo dev",
        "astro dev",
        "remix dev",
        "tauri dev",
        "storybook dev",
        "docker compose up",
        "docker-compose up",
    ];
    // `vite` alone (no subcommand) starts a dev server.
    if lower == "vite" || lower.starts_with("vite ") && !lower.contains("build") {
        return CommandExecutionMode::DevServer;
    }
    if DEV_SERVER_PATTERNS.iter().any(|p| lower.contains(p)) {
        CommandExecutionMode::DevServer
    } else {
        CommandExecutionMode::OneShot
    }
}

/// Remove ANSI escape sequences (CSI / OSC / single-char escapes) so PTY output
/// is readable for the model and in chat history.
pub fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            if c != '\r' {
                out.push(c);
            }
            continue;
        }
        match chars.peek() {
            // CSI: ESC [ ... final byte in @-~
            Some('[') => {
                chars.next();
                for n in chars.by_ref() {
                    if ('\u{40}'..='\u{7e}').contains(&n) {
                        break;
                    }
                }
            }
            // OSC: ESC ] ... terminated by BEL or ESC \
            Some(']') => {
                chars.next();
                let mut prev_esc = false;
                for n in chars.by_ref() {
                    if n == '\u{7}' || (prev_esc && n == '\\') {
                        break;
                    }
                    prev_esc = n == '\u{1b}';
                }
            }
            // Two-character escapes (ESC ( B etc.) and stray escapes.
            Some(_) => {
                chars.next();
            }
            None => {}
        }
    }
    out
}

pub struct AgentCommandResult {
    pub session_id: u32,
    /// True when the command finished inside the foreground window.
    pub completed: bool,
    pub exit_code: Option<i32>,
    /// Cleaned output (full on completion, tail when backgrounded).
    pub output: String,
    pub cancelled: bool,
}

fn emit_panel_event(app: &AppHandle, payload: serde_json::Value) {
    let _ = app.emit("shape-terminal-ai-action", payload);
}

fn emit_chat_stream(app: &AppHandle, payload: serde_json::Value) {
    let _ = app.emit("agent-terminal-stream", payload);
}

fn make_callbacks(
    app: &AppHandle,
    command_id: &str,
    forward_panel_data: bool,
) -> AgentSessionCallbacks {
    let app_out = app.clone();
    let app_exit = app.clone();
    let cmd_id_out = command_id.to_string();
    let cmd_id_exit = command_id.to_string();
    AgentSessionCallbacks {
        on_output: Arc::new(move |session_id, data| {
            emit_chat_stream(
                &app_out,
                json!({
                    "commandId": cmd_id_out,
                    "sessionId": session_id,
                    "kind": "data",
                    "data": data,
                }),
            );
            if forward_panel_data {
                emit_panel_event(
                    &app_out,
                    json!({ "type": "data", "data": data.replace('\n', "\r\n") }),
                );
            }
        }),
        on_exit: Arc::new(move |session_id, exit_code| {
            emit_chat_stream(
                &app_exit,
                json!({
                    "commandId": cmd_id_exit,
                    "sessionId": session_id,
                    "kind": "exit",
                    "exitCode": exit_code,
                }),
            );
            if forward_panel_data {
                emit_panel_event(
                    &app_exit,
                    json!({ "type": "finish", "exitCode": exit_code }),
                );
            }
        }),
    }
}

/// Run a command as a terminal session with a bounded foreground window.
pub async fn run_agent_command(
    command: &str,
    cwd: &str,
    app: &AppHandle,
    pty_state: &PtyState,
    agent_state: &AgentState,
    cancel: tokio_util::sync::CancellationToken,
    command_id: &str,
) -> AgentCommandResult {
    let mode = classify_command(command);
    logging::info(
        "terminal",
        &format!("Running ({:?}): {} (cwd={})", mode, command, cwd),
    );

    let (session_id, is_pty) = match mode {
        CommandExecutionMode::DevServer => {
            let callbacks = make_callbacks(app, command_id, false);
            match pty::spawn_agent_pty_command(app, pty_state, command, cwd, Some(callbacks)).await
            {
                Ok(id) => (id, true),
                Err(e) => return spawn_failure(app, command_id, command, e.to_string()),
            }
        }
        CommandExecutionMode::OneShot => {
            let callbacks = make_callbacks(app, command_id, true);
            match pty::spawn_piped_session(pty_state, command, cwd, Some(callbacks)) {
                Ok(id) => (id, false),
                Err(e) => return spawn_failure(app, command_id, command, e.to_string()),
            }
        }
    };

    agent_state.register_session(session_id);

    emit_chat_stream(
        app,
        json!({
            "commandId": command_id,
            "sessionId": session_id,
            "kind": "start",
            "command": command,
        }),
    );
    emit_panel_event(
        app,
        json!({
            "type": "start",
            "command": command,
            "interactive": is_pty,
            "sessionId": if is_pty { Some(session_id) } else { None },
            "commandId": command_id,
        }),
    );

    let window = match mode {
        CommandExecutionMode::DevServer => Duration::from_secs(DEV_SERVER_CONFIRM_SECS),
        CommandExecutionMode::OneShot => Duration::from_secs(FOREGROUND_WINDOW_SECS),
    };

    let finished = pty_state
        .wait_for_session_exit(session_id, window, &cancel)
        .await;

    if cancel.is_cancelled() {
        let _ = pty::kill_session(pty_state, session_id).await;
        agent_state.clear_active_terminal();
        emit_panel_event(app, json!({ "type": "finish", "exitCode": -1, "cancelled": true }));
        emit_chat_stream(
            app,
            json!({
                "commandId": command_id,
                "sessionId": session_id,
                "kind": "exit",
                "exitCode": -1,
                "cancelled": true,
            }),
        );
        return AgentCommandResult {
            session_id,
            completed: false,
            exit_code: Some(-1),
            output: "[Command cancelled by user]".to_string(),
            cancelled: true,
        };
    }

    let snapshot = pty_state
        .read_session_output(session_id, MODEL_OUTPUT_CAP)
        .ok();
    let raw_output = snapshot.as_ref().map(|s| s.output.clone()).unwrap_or_default();
    let output = if is_pty { strip_ansi(&raw_output) } else { raw_output };
    let exit_code = snapshot.as_ref().and_then(|s| s.exit_code);

    if finished {
        agent_state.clear_active_terminal();
        logging::info(
            "terminal",
            &format!(
                "Command finished in foreground: exit={:?}, {} chars",
                exit_code,
                output.len()
            ),
        );
        AgentCommandResult {
            session_id,
            completed: true,
            exit_code,
            output,
            cancelled: false,
        }
    } else {
        // Still running: hand it to the background. Deliberately NOT killed —
        // the session keeps streaming and `wait`/`read_terminal` track it.
        emit_chat_stream(
            app,
            json!({
                "commandId": command_id,
                "sessionId": session_id,
                "kind": "background",
            }),
        );
        logging::info(
            "terminal",
            &format!("Command moved to background session {}", session_id),
        );
        AgentCommandResult {
            session_id,
            completed: false,
            exit_code: None,
            output,
            cancelled: false,
        }
    }
}

fn spawn_failure(
    app: &AppHandle,
    command_id: &str,
    command: &str,
    err: String,
) -> AgentCommandResult {
    let msg = format!("Failed to spawn command: {}", err);
    logging::error("terminal", &msg);
    emit_chat_stream(
        app,
        json!({
            "commandId": command_id,
            "kind": "exit",
            "exitCode": -1,
            "data": msg,
            "command": command,
        }),
    );
    AgentCommandResult {
        session_id: 0,
        completed: true,
        exit_code: Some(-1),
        output: msg,
        cancelled: false,
    }
}

/// Format a completed command result for the model.
pub fn format_command_result(result: &AgentCommandResult) -> String {
    if result.cancelled {
        return "[Command cancelled by user]".to_string();
    }
    let mut out = clip(&result.output, MODEL_OUTPUT_CAP);
    match result.exit_code {
        Some(0) => {
            if out.trim().is_empty() {
                out = "[Command completed with exit code 0]".to_string();
            }
        }
        Some(code) => {
            out.push_str(&format!("\n[Exit code: {}]", code));
        }
        None => {}
    }
    out
}

/// Format a backgrounded command result for the model.
pub fn format_background_result(result: &AgentCommandResult, command: &str) -> String {
    let tail = clip_tail(&result.output, 2_000);
    format!(
        "Command is still running after {}s and moved to background terminal session {}.\n\
         Command: {}\n\
         Output so far:\n{}\n\n\
         Next step: call `wait` with session_id={} — it returns as soon as the command finishes \
         (or when the wait window ends). Only dev servers/watchers run indefinitely; do not kill \
         or restart them, and do not re-run this command.",
        FOREGROUND_WINDOW_SECS, result.session_id, command, tail, result.session_id
    )
}

fn clip(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        return text.to_string();
    }
    let head: String = text.chars().take(limit).collect();
    format!("{}... [truncated, {} chars total]", head, text.chars().count())
}

fn clip_tail(text: &str, limit: usize) -> String {
    let count = text.chars().count();
    if count <= limit {
        return text.to_string();
    }
    let tail: String = text.chars().skip(count - limit).collect();
    format!("[…{} earlier chars omitted]\n{}", count - limit, tail)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_dev_servers() {
        assert_eq!(classify_command("npm run dev"), CommandExecutionMode::DevServer);
        assert_eq!(classify_command("pnpm dev"), CommandExecutionMode::DevServer);
        assert_eq!(classify_command("cargo watch -x check"), CommandExecutionMode::DevServer);
        assert_eq!(classify_command("vite"), CommandExecutionMode::DevServer);
        assert_eq!(classify_command("docker compose up"), CommandExecutionMode::DevServer);
    }

    #[test]
    fn classify_one_shot_builds_and_installs() {
        // Installs/builds are one-shot: bounded foreground, then background.
        assert_eq!(classify_command("npm install"), CommandExecutionMode::OneShot);
        assert_eq!(classify_command("npm ci"), CommandExecutionMode::OneShot);
        assert_eq!(classify_command("cargo build --release"), CommandExecutionMode::OneShot);
        assert_eq!(classify_command("cargo test"), CommandExecutionMode::OneShot);
        assert_eq!(classify_command("git status"), CommandExecutionMode::OneShot);
        assert_eq!(classify_command("vite build"), CommandExecutionMode::OneShot);
        assert_eq!(classify_command("npx create-next-app --yes ."), CommandExecutionMode::OneShot);
    }

    #[test]
    fn strip_ansi_removes_csi_and_osc() {
        assert_eq!(strip_ansi("\u{1b}[32mgreen\u{1b}[0m text"), "green text");
        assert_eq!(strip_ansi("\u{1b}]0;title\u{7}body"), "body");
        assert_eq!(strip_ansi("plain"), "plain");
        assert_eq!(strip_ansi("a\r\nb"), "a\nb");
        assert_eq!(strip_ansi("\u{1b}[2K\u{1b}[1Gnpm install"), "npm install");
    }
}
