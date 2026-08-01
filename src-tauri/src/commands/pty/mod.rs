use crate::core::error::AppError;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

const SESSION_OUTPUT_CAP: usize = 512_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionSnapshot {
    pub session_id: u32,
    pub command: Option<String>,
    pub running: bool,
    pub output: String,
    pub output_chars: usize,
}

pub struct SessionMeta {
    pub output: Mutex<String>,
    pub command: Mutex<Option<String>>,
    pub running: AtomicBool,
}

impl SessionMeta {
    fn new() -> Self {
        Self {
            output: Mutex::new(String::new()),
            command: Mutex::new(None),
            running: AtomicBool::new(true),
        }
    }

    fn append_output(&self, data: &str) {
        if let Ok(mut buf) = self.output.lock() {
            buf.push_str(data);
            if buf.len() > SESSION_OUTPUT_CAP {
                let keep_from = buf.len().saturating_sub(SESSION_OUTPUT_CAP);
                let trimmed = buf[keep_from..].to_string();
                *buf = trimmed;
            }
        }
    }
}

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send>,
    cancellation_token: CancellationToken,
    meta: Arc<SessionMeta>,
}

pub struct PtyState {
    sessions: Mutex<HashMap<u32, PtySession>>,
    session_meta: Mutex<HashMap<u32, Arc<SessionMeta>>>,
    next_id: Mutex<u32>,
}

static SPAWN_LOCK: std::sync::LazyLock<Mutex<()>> = std::sync::LazyLock::new(|| Mutex::new(()));

impl PtyState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            session_meta: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }

    #[allow(dead_code)]
    pub fn list_session_ids(&self) -> Vec<u32> {
        self.sessions
            .lock()
            .map(|sessions| sessions.keys().copied().collect())
            .unwrap_or_default()
    }

    pub fn set_session_command(&self, id: u32, command: String) {
        if let Ok(meta_map) = self.session_meta.lock() {
            if let Some(meta) = meta_map.get(&id) {
                if let Ok(mut cmd) = meta.command.lock() {
                    *cmd = Some(command);
                }
            }
        }
    }

    pub fn session_is_running(&self, id: u32) -> Option<bool> {
        let mut sessions = self.sessions.lock().ok()?;
        let session = sessions.get_mut(&id)?;
        match session.child.try_wait() {
            Ok(Some(_)) => {
                session.meta.running.store(false, Ordering::SeqCst);
                Some(false)
            }
            Ok(None) => Some(true),
            Err(_) => {
                session.meta.running.store(false, Ordering::SeqCst);
                Some(false)
            }
        }
    }

    pub fn read_session_output(&self, id: u32, tail_chars: usize) -> Result<TerminalSessionSnapshot, AppError> {
        let meta_map = self
            .session_meta
            .lock()
            .map_err(|_| AppError::Message("Terminal state lock failed".to_string()))?;
        let meta = meta_map
            .get(&id)
            .ok_or_else(|| AppError::Message(format!("Terminal session {} not found", id)))?;

        let full_output = meta
            .output
            .lock()
            .map(|buf| buf.clone())
            .unwrap_or_default();
        let output_chars = full_output.chars().count();
        let tail = tail_chars.max(500).min(50_000);
        let output = if output_chars <= tail {
            full_output
        } else {
            full_output
                .chars()
                .rev()
                .take(tail)
                .collect::<String>()
                .chars()
                .rev()
                .collect()
        };

        let running = self
            .session_is_running(id)
            .unwrap_or_else(|| meta.running.load(Ordering::SeqCst));
        let command = meta.command.lock().ok().and_then(|c| c.clone());

        Ok(TerminalSessionSnapshot {
            session_id: id,
            command,
            running,
            output,
            output_chars,
        })
    }

    pub fn list_session_snapshots(&self) -> Vec<TerminalSessionSnapshot> {
        let ids: Vec<u32> = self
            .session_meta
            .lock()
            .map(|m| m.keys().copied().collect())
            .unwrap_or_default();
        ids.into_iter()
            .filter_map(|id| self.read_session_output(id, 500).ok())
            .collect()
    }

    pub fn write_to_session(&self, id: u32, data: &str) -> Result<(), AppError> {
        let mut sessions = self.sessions.lock()?;
        let session = sessions
            .get_mut(&id)
            .ok_or_else(|| AppError::Message(format!("Terminal session {} not found", id)))?;
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(AppError::Io)?;
        session.writer.flush().map_err(AppError::Io)?;
        Ok(())
    }
}

#[derive(Clone, Serialize)]
struct PtyOutput {
    id: u32,
    data: String,
}

#[derive(Clone, Serialize)]
struct PtyExit {
    id: u32,
}

#[derive(Clone, Serialize)]
pub struct ShellProfile {
    id: String,
    label: String,
    path: String,
}

fn command_exists(command: &str) -> Option<String> {
    #[cfg(windows)]
    {
        let output = std::process::Command::new("where").arg(command).output().ok()?;
        if !output.status.success() {
            return None;
        }
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty() && std::path::Path::new(line).exists())
            .map(ToString::to_string)
    }
    #[cfg(not(windows))]
    {
        let output = std::process::Command::new("which").arg(command).output().ok()?;
        if !output.status.success() {
            return None;
        }
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(ToString::to_string)
    }
}

/// Dynamically find Git Bash by locating the system git executable.
fn find_git_bash() -> Option<String> {
    // Try environment variables first
    let prog_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
    let common_paths = [
        format!(r"{}\Git\bin\bash.exe", prog_files),
        format!(r"{}\Git\usr\bin\bash.exe", prog_files),
        r"C:\Program Files (x86)\Git\bin\bash.exe".to_string(),
        r"C:\Program Files (x86)\Git\usr\bin\bash.exe".to_string(),
    ];

    for path in &common_paths {
        if std::path::Path::new(path).exists() {
            return Some(path.clone());
        }
    }

    if let Ok(git_path) = crate::core::git_bin::git_executable() {
        let git_path = std::path::Path::new(git_path);
        if git_path.exists() {
            if let Some(parent) = git_path.parent() {
                let git_root = if parent.file_name().map(|f| f == "cmd" || f == "bin").unwrap_or(false) {
                    parent.parent()
                } else {
                    Some(parent)
                };

                if let Some(root) = git_root {
                    let candidates = [
                        root.join("bin").join("bash.exe"),
                        root.join("usr").join("bin").join("bash.exe"),
                    ];
                    for path in &candidates {
                        if path.exists() {
                            return Some(path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    None
}

pub fn pty_available_shells() -> Result<Vec<ShellProfile>, AppError> {
    let mut shells = Vec::new();

    if let Some(path) = command_exists("pwsh.exe").or_else(|| command_exists("pwsh")) {
        shells.push(ShellProfile {
            id: "pwsh".to_string(),
            label: "PowerShell 7".to_string(),
            path,
        });
    }

    if let Some(path) = command_exists("powershell.exe").or_else(|| command_exists("powershell")) {
        shells.push(ShellProfile {
            id: "powershell".to_string(),
            label: "Windows PowerShell".to_string(),
            path,
        });
    }

    if let Some(path) = command_exists("cmd.exe").or_else(|| command_exists("cmd")) {
        shells.push(ShellProfile {
            id: "cmd".to_string(),
            label: "Command Prompt".to_string(),
            path,
        });
    }

    if let Some(path) = find_git_bash() {
        shells.push(ShellProfile {
            id: "gitbash".to_string(),
            label: "Git Bash".to_string(),
            path,
        });
    }

    if let Some(path) = command_exists("wsl.exe").or_else(|| command_exists("wsl")) {
        shells.push(ShellProfile {
            id: "wsl".to_string(),
            label: "WSL".to_string(),
            path,
        });
    }

    Ok(shells)
}

pub async fn pty_spawn(
    app: AppHandle,
    state: tauri::State<'_, PtyState>,
    cwd: Option<String>,
    shell: Option<String>,
    client_id: Option<u32>,
    rows: u16,
    cols: u16,
) -> Result<u32, AppError> {
    spawn_session(&app, &state, cwd, shell, client_id, rows, cols).await
}

/// Spawn a PTY session (used by the desktop UI and agent long-running commands).
pub async fn spawn_session(
    app: &AppHandle,
    state: &PtyState,
    cwd: Option<String>,
    shell: Option<String>,
    client_id: Option<u32>,
    rows: u16,
    cols: u16,
) -> Result<u32, AppError> {
    let _spawn_guard = SPAWN_LOCK.lock()?;
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell_name = shell
        .unwrap_or_else(|| "powershell.exe".to_string())
        .to_lowercase();

    let mut cmd = if shell_name.contains("bash") || shell_name.contains("git") {
        let bash_path = find_git_bash().unwrap_or_else(|| "bash.exe".to_string());
        log::info!("Spawning Git Bash from: {}", bash_path);
        let mut builder = CommandBuilder::new(&bash_path);
        builder.arg("-l"); // --login
        builder.arg("-i"); // interactive
        builder
    } else if shell_name == "wsl" || shell_name.contains("wsl") {
        let mut wsl = CommandBuilder::new("wsl.exe");
        wsl.arg("--cd");
        wsl.arg("~");
        wsl
    } else if shell_name == "pwsh" {
        let mut ps = CommandBuilder::new("pwsh.exe");
        ps.arg("-NoLogo");
        ps.arg("-NoExit");
        ps
    } else if shell_name.contains("powershell") || shell_name.contains("pwsh") {
        let mut ps = CommandBuilder::new("powershell.exe");
        ps.arg("-NoLogo");
        ps.arg("-NoProfile");
        ps.arg("-NoExit");
        ps
    } else if shell_name.contains("cmd") {
        let mut cmd_exe = CommandBuilder::new("cmd.exe");
        cmd_exe.arg("/Q"); // quiet
        cmd_exe
    } else {
        CommandBuilder::new(&shell_name)
    };

    if let Some(ref dir) = cwd {
        if !dir.is_empty() {
            log::info!("Setting PTY CWD to: {}", dir);
            cmd.cwd(dir);
        } else {
            log::warn!("PTY CWD is empty string, falling back to process default");
        }
    }

    cmd.env("TERM", "xterm-256color");
    cmd.env("CLAW_TERMINAL", "1");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| AppError::Message(e.to_string()))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| AppError::Message(e.to_string()))?;

    let id = {
        let mut next = state.next_id.lock()?;
        let current = client_id.unwrap_or(*next);
        *next = (*next).max(current.saturating_add(1));
        current
    };

    let cancellation_token = CancellationToken::new();
    let meta = Arc::new(SessionMeta::new());

    {
        let mut sessions = state.sessions.lock()?;
        let mut meta_map = state.session_meta.lock()?;
        meta_map.insert(id, meta.clone());
        sessions.insert(
            id,
            PtySession {
                master: pair.master,
                writer,
                child,
                cancellation_token: cancellation_token.clone(),
                meta: meta.clone(),
            },
        );
    }

    // Spawn a thread to read output from the PTY and emit events
    let session_id = id;
    let token = cancellation_token;
    let app_for_thread = app.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            if token.is_cancelled() {
                break;
            }
            match reader.read(&mut buf) {
                Ok(0) => {
                    meta.running.store(false, Ordering::SeqCst);
                    let _ = app_for_thread.emit("pty-exit", PtyExit { id: session_id });
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    meta.append_output(&data);
                    let _ = app_for_thread.emit(
                        "pty-output",
                        PtyOutput {
                            id: session_id,
                            data,
                        },
                    );
                }
                Err(_) => {
                    meta.running.store(false, Ordering::SeqCst);
                    if !token.is_cancelled() {
                        let _ = app_for_thread.emit("pty-exit", PtyExit { id: session_id });
                    }
                    break;
                }
            }
        }
    });

    Ok(id)
}

pub async fn pty_write(
    state: tauri::State<'_, PtyState>,
    id: u32,
    data: String,
) -> Result<(), AppError> {
    let mut sessions = state.sessions.lock()?;
    let session = sessions
        .get_mut(&id)
        .ok_or(AppError::Message("Session not found".to_string()))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| AppError::Io(e))?;
    session.writer.flush().map_err(|e| AppError::Io(e))?;
    Ok(())
}

pub async fn pty_resize(
    state: tauri::State<'_, PtyState>,
    id: u32,
    rows: u16,
    cols: u16,
) -> Result<(), AppError> {
    let sessions = state.sessions.lock()?;
    let session = sessions
        .get(&id)
        .ok_or(AppError::Message("Session not found".to_string()))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Message(e.to_string()))?;
    Ok(())
}

pub async fn pty_kill(state: tauri::State<'_, PtyState>, id: u32) -> Result<(), AppError> {
    kill_session(&state, id).await
}

pub async fn kill_session(state: &PtyState, id: u32) -> Result<(), AppError> {
    let mut sessions = state.sessions.lock()?;
    if let Some(mut session) = sessions.remove(&id) {
        session.meta.running.store(false, Ordering::SeqCst);
        session.cancellation_token.cancel();
        let _ = session.child.kill();
    }
    Ok(())
}

pub async fn pty_kill_all(state: tauri::State<'_, PtyState>) -> Result<(), AppError> {
    let mut sessions = state.sessions.lock()?;
    for (_, mut session) in sessions.drain() {
        session.cancellation_token.cancel();
        let _ = session.child.kill();
    }
    Ok(())
}
