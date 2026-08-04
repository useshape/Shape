/// Terminal command execution with streaming output.

use std::sync::Arc;
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use tokio::sync::Mutex as TokioMutex;
use tokio_util::sync::CancellationToken;

use crate::agent::models::AgentState;
use crate::commands::pty::{self, PtyState};

use super::logging;

const TERMINAL_TIMEOUT_SECS: u64 = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandExecutionMode {
    Quick,
    LongRunning,
}

/// Classify whether a command should run as a quick subprocess or an interactive PTY.
pub fn classify_command(command: &str) -> CommandExecutionMode {
    let lower = command.trim().to_lowercase();
    const LONG_PATTERNS: &[&str] = &[
        " run dev",
        "next dev",
        "nuxt dev",
        "vite",
        "npm start",
        "yarn dev",
        "pnpm dev",
        "yarn start",
        "pnpm start",
        " --watch",
        "nodemon",
        "webpack serve",
        "turbo dev",
        "astro dev",
        "remix dev",
        "npm install",
        "npm ci",
        "yarn install",
        "pnpm install",
        "pip install",
        "cargo build",
        "cargo test",
        "create-next-app",
        "create-vite",
        "create-react-app",
        "npx create",
        "npm create",
        "dotnet build",
        "gradle",
        "tauri build",
        "webpack",
        "docker build",
        "docker compose up",
        "docker-compose up",
    ];
    if LONG_PATTERNS.iter().any(|p| lower.contains(p)) {
        CommandExecutionMode::LongRunning
    } else {
        CommandExecutionMode::Quick
    }
}

fn emit_terminal_event(app: &AppHandle, payload: serde_json::Value) {
    let _ = app.emit("shape-terminal-ai-action", payload);
}

/// Run a long-lived dev server (or similar) in an interactive PTY without blocking the agent turn.
pub async fn execute_long_running_in_pty(
    command: &str,
    cwd: &str,
    app: &AppHandle,
    pty_state: &PtyState,
    agent_state: &AgentState,
) -> String {
    logging::info(
        "terminal",
        &format!("Starting long-running PTY command: {} (cwd={})", command, cwd),
    );

    let shell = if cfg!(target_os = "windows") {
        Some("powershell".to_string())
    } else {
        Some("sh".to_string())
    };

    let session_id = match pty::spawn_session(app, pty_state, Some(cwd.to_string()), shell, None, 32, 120)
        .await
    {
        Ok(id) => id,
        Err(e) => {
            let err = format!("Failed to spawn interactive terminal: {}", e);
            logging::error("terminal", &err);
            return err;
        }
    };

    agent_state.register_pty(session_id);

    emit_terminal_event(
        app,
        json!({
            "type": "start",
            "command": command,
            "interactive": true,
            "sessionId": session_id,
        }),
    );

    let input = if cfg!(target_os = "windows") {
        format!("{}\r\n", command)
    } else {
        format!("{}\n", command)
    };

    if let Err(e) = pty_state.write_to_session(session_id, &input) {
        agent_state.clear_active_terminal();
        let err = format!("Failed to send command to terminal: {}", e);
        logging::error("terminal", &err);
        return err;
    }

    pty_state.set_session_command(session_id, command.to_string());

    format!(
        "Started background terminal session {} running: {}\n\
         The command is running in the Terminal panel. Use `wait` to pause before checking again, \
         then `read_terminal` with session_id={} to inspect output. Repeat wait → read_terminal until running is false.",
        session_id, command, session_id
    )
}

/// Execute a quick terminal command in a subprocess with streaming output.
pub async fn execute_terminal_command(
    command: &str,
    cwd: &str,
    app: Option<&AppHandle>,
    cancel: Option<CancellationToken>,
    agent_state: Option<&AgentState>,
) -> String {
    use std::process::Stdio;
    use tokio::io::{AsyncReadExt, BufReader};

    logging::info("terminal", &format!("Executing: {} (cwd={})", command, cwd));

    if let Some(app_handle) = app {
        emit_terminal_event(
            app_handle,
            json!({
                "type": "start",
                "command": command,
                "interactive": false,
            }),
        );
    }

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("powershell");
        c.args(["-NoProfile", "-NonInteractive", "-Command", command]);
        c
    } else {
        let mut c = Command::new("sh");
        c.args(["-c", command]);
        c
    };

    #[cfg(windows)]
    crate::core::process::hide_console_tokio(&mut cmd);
    crate::core::process::apply_trusted_binary_env_tokio(&mut cmd);

    let child = match cmd
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let err = format!("Failed to spawn command: {}", e);
            logging::error("terminal", &err);
            if let Some(app_handle) = app {
                emit_terminal_event(
                    app_handle,
                    json!({
                        "type": "data",
                        "data": format!("{}\r\n", err)
                    }),
                );
            }
            if let Some(state) = agent_state {
                state.clear_active_terminal();
            }
            return err;
        }
    };

    let child_slot = Arc::new(TokioMutex::new(Some(child)));
    if let Some(state) = agent_state {
        state.register_subprocess(child_slot.clone());
    }

    if let Some(token) = cancel.clone() {
        let slot = child_slot.clone();
        let app_handle = app.cloned();
        tokio::spawn(async move {
            token.cancelled().await;
            if let Some(mut c) = slot.lock().await.take() {
                let _ = c.kill().await;
            }
            if let Some(ah) = app_handle {
                emit_terminal_event(
                    &ah,
                    json!({
                        "type": "finish",
                        "exitCode": -1,
                        "cancelled": true,
                    }),
                );
            }
        });
    }

    let stdout = child_slot
        .lock()
        .await
        .as_mut()
        .and_then(|c| c.stdout.take());
    let stderr = child_slot
        .lock()
        .await
        .as_mut()
        .and_then(|c| c.stderr.take());

    let app_handle_out = app.cloned();
    let out_task = tokio::spawn(async move {
        let Some(stdout) = stdout else {
            return String::new();
        };
        let mut stdout_reader = BufReader::new(stdout);
        let mut buf = [0; 1024];
        let mut local_str = String::new();
        while let Ok(n) = stdout_reader.read(&mut buf).await {
            if n == 0 {
                break;
            }
            let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
            local_str.push_str(&chunk);
            if let Some(ref ah) = app_handle_out {
                let formatted = chunk.replace('\n', "\r\n");
                emit_terminal_event(
                    ah,
                    json!({
                        "type": "data",
                        "data": formatted
                    }),
                );
            }
        }
        local_str
    });

    let app_handle_err = app.cloned();
    let err_task = tokio::spawn(async move {
        let Some(stderr) = stderr else {
            return String::new();
        };
        let mut stderr_reader = BufReader::new(stderr);
        let mut buf = [0; 1024];
        let mut local_str = String::new();
        while let Ok(n) = stderr_reader.read(&mut buf).await {
            if n == 0 {
                break;
            }
            let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
            local_str.push_str(&chunk);
            if let Some(ref ah) = app_handle_err {
                let formatted = chunk.replace('\n', "\r\n");
                emit_terminal_event(
                    ah,
                    json!({
                        "type": "data",
                        "data": formatted
                    }),
                );
            }
        }
        local_str
    });

    enum WaitOutcome {
        Cancelled,
        Finished(i32),
        Gone,
    }

    let cancel_for_wait = cancel.clone();
    let child_slot_wait = child_slot.clone();
    let wait_outcome = async move {
        loop {
            if let Some(ref token) = cancel_for_wait {
                if token.is_cancelled() {
                    if let Some(mut c) = child_slot_wait.lock().await.take() {
                        let _ = c.kill().await;
                    }
                    return WaitOutcome::Cancelled;
                }
            }

            let status = {
                let mut guard = child_slot_wait.lock().await;
                if let Some(ref mut c) = *guard {
                    match c.try_wait() {
                        Ok(Some(s)) => Some(s),
                        Ok(None) => None,
                        Err(e) => {
                            logging::error("terminal", &format!("try_wait failed: {}", e));
                            return WaitOutcome::Gone;
                        }
                    }
                } else {
                    return WaitOutcome::Gone;
                }
            };

            if let Some(s) = status {
                let code = s.code().unwrap_or(-1);
                child_slot_wait.lock().await.take();
                return WaitOutcome::Finished(code);
            }

            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    };

    let mut cancelled = false;
    let mut timed_out = false;
    let mut exit_code = -1i32;

    match tokio::time::timeout(Duration::from_secs(TERMINAL_TIMEOUT_SECS), wait_outcome).await {
        Ok(WaitOutcome::Cancelled) => {
            cancelled = true;
        }
        Ok(WaitOutcome::Finished(code)) => {
            exit_code = code;
        }
        Ok(WaitOutcome::Gone) => {}
        Err(_) => {
            timed_out = true;
            if let Some(mut c) = child_slot.lock().await.take() {
                let _ = c.kill().await;
            }
            logging::error(
                "terminal",
                &format!("Command timed out after {}s", TERMINAL_TIMEOUT_SECS),
            );
            if let Some(app_handle) = app {
                emit_terminal_event(
                    app_handle,
                    json!({
                        "type": "data",
                        "data": format!("\r\n[Command timed out after {} seconds]\r\n", TERMINAL_TIMEOUT_SECS)
                    }),
                );
            }
        }
    }

    if let Some(state) = agent_state {
        state.clear_active_terminal();
    }

    let final_stdout = out_task.await.unwrap_or_default();
    let final_stderr = err_task.await.unwrap_or_default();

    if cancelled {
        exit_code = -1;
    } else if timed_out {
        exit_code = -1;
    }

    logging::info(
        "terminal",
        &format!(
            "Command finished: exit_code={}, stdout={} chars, stderr={} chars",
            exit_code,
            final_stdout.len(),
            final_stderr.len()
        ),
    );

    if let Some(app_handle) = app {
        emit_terminal_event(
            app_handle,
            json!({
                "type": "finish",
                "exitCode": exit_code,
                "cancelled": cancelled,
            }),
        );
    }

    if cancelled {
        return "[Command cancelled by user]".to_string();
    }

    let mut result = String::new();
    if !final_stdout.is_empty() {
        let truncated = if final_stdout.chars().count() > 50_000 {
            let head: String = final_stdout.chars().take(50_000).collect();
            format!(
                "{}... [truncated, {} chars total]",
                head,
                final_stdout.chars().count()
            )
        } else {
            final_stdout
        };
        result.push_str(&truncated);
    }
    if !final_stderr.is_empty() {
        if !result.is_empty() {
            result.push('\n');
        }
        result.push_str(&format!("STDERR: {}", final_stderr));
    }
    if exit_code != 0 {
        result.push_str(&format!("\n[Exit code: {}]", exit_code));
    }
    if timed_out {
        result = format!(
            "[Command timed out after {} seconds]\n{}",
            TERMINAL_TIMEOUT_SECS, result
        );
    } else if result.is_empty() {
        result = format!("[Command completed with exit code {}]", exit_code);
    }

    result
}
