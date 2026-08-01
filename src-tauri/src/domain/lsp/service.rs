use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, Mutex};

/// Quote a single Windows cmd.exe argument.
#[cfg(windows)]
fn shell_quote(arg: &str) -> String {
    if arg.is_empty() {
        return "\"\"".to_string();
    }
    if !arg.contains([' ', '\t', '"', '&', '|', '<', '>', '^', '%']) {
        return arg.to_string();
    }
    let escaped = arg.replace('"', "\\\"");
    format!("\"{escaped}\"")
}

/// Configuration for a single language server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LspServerConfig {
    pub language: String,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    /// When true (or when command is npx), spawn outside the project so npm
    /// package.json overrides cannot break `npx` (EOVERRIDE).
    #[serde(default)]
    pub isolate_npx: bool,
}

#[derive(Clone, Serialize)]
struct LspMessageEvent {
    language: String,
    message: String,
}

/// Tracks a running language server process
struct LspProcess {
    _child: Child,
    stdin_tx: mpsc::Sender<String>,
}

/// Global state for the LSP subsystem
pub struct LspState {
    /// Running language server processes keyed by language
    processes: Arc<Mutex<HashMap<String, LspProcess>>>,
}

impl LspState {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Spawn a language server process and hook up its stdio.
/// Outbound JSON-RPC bodies are emitted as `lsp-message` Tauri events.
pub async fn spawn_lsp(
    app: AppHandle,
    state: &LspState,
    config: LspServerConfig,
) -> Result<(), String> {
    let mut processes = state.processes.lock().await;

    // Don't spawn duplicate servers — verify process is still alive
    if let Some(existing) = processes.get_mut(&config.language) {
        if existing._child.try_wait().map_err(|e| e.to_string())?.is_none() {
            return Ok(());
        }
        processes.remove(&config.language);
    }

    let mut program = if cfg!(target_os = "windows") && config.command == "npx" {
        "npx.cmd".to_string()
    } else {
        config.command.clone()
    };

    // Windows: wrap .cmd/.bat shims in `cmd.exe /d /s /c` so CREATE_NO_WINDOW
    // keeps stdio attached (direct .cmd spawn is fragile on Windows).
    let mut win_cmd_line: Option<String> = None;
    #[cfg(windows)]
    {
        let is_cmd_shim = program.eq_ignore_ascii_case("npx")
            || program.eq_ignore_ascii_case("npx.cmd")
            || program.ends_with(".cmd")
            || program.ends_with(".bat");
        if is_cmd_shim {
            let mut parts: Vec<String> = Vec::with_capacity(1 + config.args.len());
            parts.push(shell_quote(&program));
            for arg in &config.args {
                parts.push(shell_quote(arg));
            }
            win_cmd_line = Some(parts.join(" "));
            program = "cmd.exe".to_string();
        }
    }

    let mut cmd = Command::new(&program);
    if let Some(line) = &win_cmd_line {
        cmd.args(["/d", "/s", "/c", line]);
    } else {
        cmd.args(&config.args);
    }
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    // npx reads the cwd package.json; broken overrides (EOVERRIDE) kill the spawn.
    // Run npx from a neutral directory. Local `node` bins keep the project cwd.
    let isolate = config.isolate_npx || config.command.eq_ignore_ascii_case("npx");
    if isolate {
        let neutral = std::env::temp_dir();
        cmd.current_dir(&neutral);
        // Ensure npm doesn't inherit a project-local npmrc that reintroduces overrides.
        cmd.env_remove("NPM_CONFIG_USERCONFIG");
        cmd.env("npm_config_yes", "true");
    } else if let Some(cwd) = &config.cwd {
        cmd.current_dir(cwd);
    }

    #[cfg(windows)]
    crate::core::process::hide_console_tokio(&mut cmd);
    crate::core::process::apply_trusted_binary_env_tokio(&mut cmd);

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Failed to spawn LSP '{}' ({}): {}",
            config.language, config.command, e
        )
    })?;

    // Give the process a moment to fail fast (missing npx, bad package, etc.)
    tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
        let mut err = String::new();
        if let Some(mut stderr) = child.stderr.take() {
            use tokio::io::AsyncReadExt;
            let mut buf = Vec::new();
            let _ = stderr.read_to_end(&mut buf).await;
            err = String::from_utf8_lossy(&buf).trim().to_string();
        }
        return Err(format!(
            "LSP '{}' exited immediately ({}){}",
            config.language,
            status,
            if err.is_empty() {
                String::new()
            } else {
                format!(": {err}")
            }
        ));
    }

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
    let stderr = child.stderr.take();

    // Channel for sending messages to the LSP stdin
    let (stdin_tx, mut stdin_rx) = mpsc::channel::<String>(64);

    // Stdin writer task: wraps JSON-RPC messages with Content-Length header
    let mut stdin_writer = stdin;
    tokio::spawn(async move {
        while let Some(msg) = stdin_rx.recv().await {
            let header = format!("Content-Length: {}\r\n\r\n", msg.len());
            if stdin_writer.write_all(header.as_bytes()).await.is_err() {
                break;
            }
            if stdin_writer.write_all(msg.as_bytes()).await.is_err() {
                break;
            }
            let _ = stdin_writer.flush().await;
        }
    });

    // Forward stderr to logs (helps diagnose server crashes)
    if let Some(stderr) = stderr {
        let language = config.language.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break,
                    Ok(_) => {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            log::warn!("[LSP:{}] {}", language, trimmed);
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }

    // Stdout reader task: reads Content-Length framed LSP messages and emits them
    let language = config.language.clone();
    let app_for_stdout = app.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);

        loop {
            // Read headers until blank line
            let mut content_length: usize = 0;
            loop {
                let mut line = String::new();
                match reader.read_line(&mut line).await {
                    Ok(0) => return, // EOF
                    Ok(_) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            break; // End of headers
                        }
                        if let Some(len_str) = trimmed.strip_prefix("Content-Length: ") {
                            if let Ok(len) = len_str.parse::<usize>() {
                                content_length = len;
                            }
                        }
                    }
                    Err(_) => return,
                }
            }

            if content_length == 0 {
                continue;
            }

            // Read exactly content_length bytes for the body
            let mut body = vec![0u8; content_length];
            match tokio::io::AsyncReadExt::read_exact(&mut reader, &mut body).await {
                Ok(_) => {
                    if let Ok(body_str) = String::from_utf8(body) {
                        let _ = app_for_stdout.emit(
                            "lsp-message",
                            LspMessageEvent {
                                language: language.clone(),
                                message: body_str,
                            },
                        );
                    }
                }
                Err(_) => return,
            }
        }
    });

    processes.insert(
        config.language,
        LspProcess {
            _child: child,
            stdin_tx,
        },
    );

    Ok(())
}

/// Stop a single language server
pub async fn stop_lsp(state: &LspState, language: &str) -> Result<(), String> {
    let mut processes = state.processes.lock().await;
    processes.remove(language);
    Ok(())
}

/// Stop all running language servers
pub async fn stop_all_lsp(state: &LspState) {
    let mut processes = state.processes.lock().await;
    processes.clear();
}

/// Send a JSON-RPC message directly to a language server's stdin
pub async fn send_to_lsp(
    state: &LspState,
    language: &str,
    message: String,
) -> Result<(), String> {
    let processes = state.processes.lock().await;
    let process = processes
        .get(language)
        .ok_or_else(|| format!("No LSP running for {}", language))?;

    process
        .stdin_tx
        .send(message)
        .await
        .map_err(|e| format!("Failed to send to LSP: {}", e))
}
