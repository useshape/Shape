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
/// Finished agent sessions kept around for `read_terminal` after completion.
const MAX_FINISHED_SESSIONS: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionKind {
    /// Interactive shell owned by the user's terminal panel.
    UserShell,
    /// Agent command running as the direct child of a PTY (dev servers, watch tasks).
    AgentPty,
    /// Agent command running as a piped subprocess (default: builds, installs, git…).
    AgentPiped,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionSnapshot {
    pub session_id: u32,
    pub command: Option<String>,
    pub running: bool,
    pub output: String,
    pub output_chars: usize,
    /// Present once the process has exited (or was killed: -1).
    pub exit_code: Option<i32>,
    pub kind: SessionKind,
    /// Heuristic: the last output line looks like an interactive prompt while
    /// the process is still alive. Advisory only.
    pub waiting_for_input: bool,
}

pub struct SessionMeta {
    pub output: Mutex<String>,
    pub command: Mutex<Option<String>>,
    pub running: AtomicBool,
    pub exit_code: Mutex<Option<i32>>,
    /// Signalled exactly once, when the session's process exits (or is killed).
    pub exit_notify: tokio::sync::Notify,
    pub kind: SessionKind,
}

impl SessionMeta {
    fn new(kind: SessionKind) -> Self {
        Self {
            output: Mutex::new(String::new()),
            command: Mutex::new(None),
            running: AtomicBool::new(true),
            exit_code: Mutex::new(None),
            exit_notify: tokio::sync::Notify::new(),
            kind,
        }
    }

    fn append_output(&self, data: &str) {
        if let Ok(mut buf) = self.output.lock() {
            buf.push_str(data);
            if buf.len() > SESSION_OUTPUT_CAP {
                let keep_from = buf.len().saturating_sub(SESSION_OUTPUT_CAP);
                // Avoid slicing mid-UTF-8-codepoint.
                let mut start = keep_from;
                while start < buf.len() && !buf.is_char_boundary(start) {
                    start += 1;
                }
                let trimmed = buf[start..].to_string();
                *buf = trimmed;
            }
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn exit_code(&self) -> Option<i32> {
        self.exit_code.lock().ok().and_then(|g| *g)
    }

    /// Mark the session finished and wake every waiter. Idempotent: only the
    /// first caller records the exit code.
    pub fn mark_exited(&self, code: Option<i32>) {
        if let Ok(mut slot) = self.exit_code.lock() {
            if slot.is_none() {
                *slot = Some(code.unwrap_or(-1));
            }
        }
        self.running.store(false, Ordering::SeqCst);
        self.exit_notify.notify_waiters();
    }

}

fn tail_of(text: &str, tail_chars: usize) -> String {
    let count = text.chars().count();
    if count <= tail_chars {
        return text.to_string();
    }
    text.chars().skip(count - tail_chars).collect()
}

/// Heuristic detection of an interactive prompt at the end of output.
/// Used to tell the agent/UI a command is probably waiting for input.
pub fn looks_like_input_prompt(output: &str) -> bool {
    let tail: String = tail_of(output, 400);
    let last_line = tail
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("")
        .trim()
        .to_lowercase();
    if last_line.is_empty() {
        return false;
    }
    const ENDINGS: &[&str] = &[
        "(y/n)", "(y/n):", "[y/n]", "[y/n]:", "(yes/no)", "(yes/no):", "[yes/no]",
        "password:", "passphrase:", "username:", "login:",
        "press any key to continue", "press enter to continue",
        "overwrite?", "are you sure?", "continue?", "proceed?",
    ];
    if ENDINGS.iter().any(|e| last_line.ends_with(e)) {
        return true;
    }
    // Inquirer-style selection prompts ("? Pick a framework › …").
    if last_line.starts_with("? ") && (last_line.contains('›') || last_line.contains("❯")) {
        return true;
    }
    false
}

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send>,
    cancellation_token: CancellationToken,
    meta: Arc<SessionMeta>,
}

/// Agent command running as a plain subprocess with piped stdio. Non-TTY output
/// is cleaner for the model, and process exit gives a deterministic lifecycle.
pub struct PipedSession {
    child: Arc<Mutex<Option<std::process::Child>>>,
    stdin: Mutex<Option<std::process::ChildStdin>>,
    meta: Arc<SessionMeta>,
}

/// Callbacks fired from session reader/monitor threads so the agent layer can
/// forward output to its own (command-correlated) events.
#[derive(Clone)]
pub struct AgentSessionCallbacks {
    pub on_output: Arc<dyn Fn(u32, &str) + Send + Sync>,
    pub on_exit: Arc<dyn Fn(u32, i32) + Send + Sync>,
}

pub struct PtyState {
    sessions: Mutex<HashMap<u32, PtySession>>,
    piped_sessions: Mutex<HashMap<u32, PipedSession>>,
    session_meta: Mutex<HashMap<u32, Arc<SessionMeta>>>,
    next_id: Mutex<u32>,
}

static SPAWN_LOCK: std::sync::LazyLock<Mutex<()>> = std::sync::LazyLock::new(|| Mutex::new(()));

impl PtyState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            piped_sessions: Mutex::new(HashMap::new()),
            session_meta: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }

    #[allow(dead_code)]
    pub fn list_session_ids(&self) -> Vec<u32> {
        self.session_meta
            .lock()
            .map(|m| m.keys().copied().collect())
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

    pub fn session_meta(&self, id: u32) -> Option<Arc<SessionMeta>> {
        self.session_meta.lock().ok()?.get(&id).cloned()
    }

    pub fn session_is_running(&self, id: u32) -> Option<bool> {
        // Fast path: a recorded exit is authoritative for every session kind.
        let meta = self.session_meta(id)?;
        if !meta.is_running() {
            return Some(false);
        }
        // PTY sessions: confirm against the child process (reader EOF can lag).
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(session) = sessions.get_mut(&id) {
                return match session.child.try_wait() {
                    Ok(Some(status)) => {
                        session.meta.mark_exited(Some(status.exit_code() as i32));
                        Some(false)
                    }
                    Ok(None) => Some(true),
                    Err(_) => {
                        session.meta.mark_exited(None);
                        Some(false)
                    }
                };
            }
        }
        // Piped sessions: the monitor thread owns exit detection.
        Some(meta.is_running())
    }

    pub fn read_session_output(&self, id: u32, tail_chars: usize) -> Result<TerminalSessionSnapshot, AppError> {
        let meta = self
            .session_meta(id)
            .ok_or_else(|| AppError::Message(format!("Terminal session {} not found", id)))?;

        let full_output = meta
            .output
            .lock()
            .map(|buf| buf.clone())
            .unwrap_or_default();
        let output_chars = full_output.chars().count();
        let tail = tail_chars.max(500).min(50_000);
        let output = tail_of(&full_output, tail);

        let running = self.session_is_running(id).unwrap_or_else(|| meta.is_running());
        let command = meta.command.lock().ok().and_then(|c| c.clone());
        let waiting_for_input = running && looks_like_input_prompt(&full_output);

        Ok(TerminalSessionSnapshot {
            session_id: id,
            command,
            running,
            output,
            output_chars,
            exit_code: meta.exit_code(),
            kind: meta.kind,
            waiting_for_input,
        })
    }

    pub fn list_session_snapshots(&self) -> Vec<TerminalSessionSnapshot> {
        let mut ids: Vec<u32> = self
            .session_meta
            .lock()
            .map(|m| m.keys().copied().collect())
            .unwrap_or_default();
        ids.sort_unstable();
        ids.into_iter()
            .filter_map(|id| self.read_session_output(id, 500).ok())
            .collect()
    }

    pub fn write_to_session(&self, id: u32, data: &str) -> Result<(), AppError> {
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(session) = sessions.get_mut(&id) {
                session
                    .writer
                    .write_all(data.as_bytes())
                    .map_err(AppError::Io)?;
                session.writer.flush().map_err(AppError::Io)?;
                return Ok(());
            }
        }
        let piped = self.piped_sessions.lock()?;
        let session = piped
            .get(&id)
            .ok_or_else(|| AppError::Message(format!("Terminal session {} not found", id)))?;
        let mut stdin_guard = session
            .stdin
            .lock()
            .map_err(|_| AppError::Message("Terminal stdin lock failed".to_string()))?;
        let stdin = stdin_guard
            .as_mut()
            .ok_or_else(|| AppError::Message(format!("Terminal session {} has no open stdin", id)))?;
        stdin.write_all(data.as_bytes()).map_err(AppError::Io)?;
        stdin.flush().map_err(AppError::Io)?;
        Ok(())
    }

    /// Wait until the session exits, `max_wait` elapses, or `cancel` fires.
    /// Returns true if the session is finished when this returns.
    pub async fn wait_for_session_exit(
        &self,
        id: u32,
        max_wait: std::time::Duration,
        cancel: &CancellationToken,
    ) -> bool {
        let Some(meta) = self.session_meta(id) else {
            return true;
        };
        let deadline = tokio::time::Instant::now() + max_wait;
        loop {
            // Subscribe before re-checking state so an exit between the check
            // and the await cannot be missed.
            let notified = meta.exit_notify.notified();
            if self.session_is_running(id) != Some(true) {
                return true;
            }
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                return false;
            }
            // PTY exits are detected lazily by try_wait, so cap each wait slice.
            let slice = remaining.min(std::time::Duration::from_millis(500));
            tokio::select! {
                _ = notified => {}
                _ = tokio::time::sleep(slice) => {}
                _ = cancel.cancelled() => { return self.session_is_running(id) != Some(true); }
            }
        }
    }

    fn allocate_id(&self, client_id: Option<u32>) -> Result<u32, AppError> {
        let mut next = self.next_id.lock()?;
        let current = client_id.unwrap_or(*next);
        *next = (*next).max(current.saturating_add(1));
        Ok(current)
    }

    /// Drop metadata of old finished agent sessions so the maps do not grow
    /// without bound. Live sessions and user shells are never pruned.
    fn prune_finished_sessions(&self) {
        let Ok(mut meta_map) = self.session_meta.lock() else {
            return;
        };
        let mut finished: Vec<u32> = meta_map
            .iter()
            .filter(|(_, m)| !m.is_running() && m.kind != SessionKind::UserShell)
            .map(|(id, _)| *id)
            .collect();
        if finished.len() <= MAX_FINISHED_SESSIONS {
            return;
        }
        finished.sort_unstable();
        let remove_count = finished.len() - MAX_FINISHED_SESSIONS;
        let to_remove: Vec<u32> = finished.into_iter().take(remove_count).collect();
        for id in &to_remove {
            meta_map.remove(id);
        }
        drop(meta_map);
        if let Ok(mut sessions) = self.sessions.lock() {
            for id in &to_remove {
                sessions.remove(id);
            }
        }
        if let Ok(mut piped) = self.piped_sessions.lock() {
            for id in &to_remove {
                piped.remove(id);
            }
        }
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

/// Spawn a PTY session running an interactive shell (user terminal panel).
pub async fn spawn_session(
    app: &AppHandle,
    state: &PtyState,
    cwd: Option<String>,
    shell: Option<String>,
    client_id: Option<u32>,
    rows: u16,
    cols: u16,
) -> Result<u32, AppError> {
    let shell_name = shell
        .unwrap_or_else(|| "powershell.exe".to_string())
        .to_lowercase();

    let cmd = if shell_name.contains("bash") || shell_name.contains("git") {
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

    spawn_pty_with_command(
        app,
        state,
        cmd,
        cwd,
        client_id,
        rows,
        cols,
        SessionKind::UserShell,
        None,
    )
    .await
}

/// Spawn an agent command as the *direct child* of a fresh PTY. Process exit ==
/// command completion, so `running`/`exit_code` are accurate — unlike the old
/// approach of writing the command into a `-NoExit` shell whose process never
/// exited. Used for dev servers / watch tasks that need a TTY and stay alive.
pub async fn spawn_agent_pty_command(
    app: &AppHandle,
    state: &PtyState,
    command: &str,
    cwd: &str,
    callbacks: Option<AgentSessionCallbacks>,
) -> Result<u32, AppError> {
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = CommandBuilder::new("powershell.exe");
        c.arg("-NoLogo");
        c.arg("-NoProfile");
        c.arg("-Command");
        c.arg(command);
        c
    } else {
        let mut c = CommandBuilder::new("sh");
        c.arg("-c");
        c.arg(command);
        c
    };
    cmd.env("CI", "1");
    let id = spawn_pty_with_command(
        app,
        state,
        cmd,
        Some(cwd.to_string()),
        None,
        32,
        120,
        SessionKind::AgentPty,
        callbacks,
    )
    .await?;
    state.set_session_command(id, command.to_string());
    state.prune_finished_sessions();
    Ok(id)
}

#[allow(clippy::too_many_arguments)]
async fn spawn_pty_with_command(
    app: &AppHandle,
    state: &PtyState,
    mut cmd: CommandBuilder,
    cwd: Option<String>,
    client_id: Option<u32>,
    rows: u16,
    cols: u16,
    kind: SessionKind,
    callbacks: Option<AgentSessionCallbacks>,
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

    let id = state.allocate_id(client_id)?;

    let cancellation_token = CancellationToken::new();
    let meta = Arc::new(SessionMeta::new(kind));

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

    // Reader thread: stream PTY output to the terminal panel (and agent callbacks).
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
                    // EOF: the child exited. Exit code is filled in lazily by
                    // session_is_running / kill; mark finished so waiters wake.
                    meta.mark_exited(meta.exit_code());
                    if let Some(cb) = &callbacks {
                        (cb.on_exit)(session_id, meta.exit_code().unwrap_or(-1));
                    }
                    let _ = app_for_thread.emit("pty-exit", PtyExit { id: session_id });
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    meta.append_output(&data);
                    if let Some(cb) = &callbacks {
                        (cb.on_output)(session_id, &data);
                    }
                    let _ = app_for_thread.emit(
                        "pty-output",
                        PtyOutput {
                            id: session_id,
                            data,
                        },
                    );
                }
                Err(_) => {
                    meta.mark_exited(meta.exit_code());
                    if let Some(cb) = &callbacks {
                        (cb.on_exit)(session_id, meta.exit_code().unwrap_or(-1));
                    }
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

/// Spawn an agent command as a piped subprocess registered as a terminal session.
/// This is the default engine for one-shot commands: clean non-TTY output for the
/// model, deterministic exit codes, and the same session tools (read/wait/kill)
/// as PTY sessions.
pub fn spawn_piped_session(
    state: &PtyState,
    command: &str,
    cwd: &str,
    callbacks: Option<AgentSessionCallbacks>,
) -> Result<u32, AppError> {
    use std::process::{Command as StdCommand, Stdio};

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = StdCommand::new("powershell");
        c.args(["-NoProfile", "-NonInteractive", "-Command", command]);
        c
    } else {
        let mut c = StdCommand::new("sh");
        c.args(["-c", command]);
        c
    };

    #[cfg(windows)]
    crate::core::process::hide_console(&mut cmd);
    crate::core::process::apply_trusted_binary_env(&mut cmd);

    let mut child = cmd
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Message(format!("Failed to spawn command: {}", e)))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdin = child.stdin.take();

    let id = state.allocate_id(None)?;
    let meta = Arc::new(SessionMeta::new(SessionKind::AgentPiped));
    if let Ok(mut cmd_slot) = meta.command.lock() {
        *cmd_slot = Some(command.to_string());
    }
    let child_slot = Arc::new(Mutex::new(Some(child)));

    {
        let mut piped = state.piped_sessions.lock()?;
        let mut meta_map = state.session_meta.lock()?;
        meta_map.insert(id, meta.clone());
        piped.insert(
            id,
            PipedSession {
                child: child_slot.clone(),
                stdin: Mutex::new(stdin),
                meta: meta.clone(),
            },
        );
    }

    // Reader threads: drain pipes into the session buffer + callbacks.
    for pipe in [stdout.map(PipeSource::Out), stderr.map(PipeSource::Err)]
        .into_iter()
        .flatten()
    {
        let meta_r = meta.clone();
        let cb = callbacks.clone();
        thread::spawn(move || {
            let mut reader: Box<dyn Read + Send> = match pipe {
                PipeSource::Out(o) => Box::new(o),
                PipeSource::Err(e) => Box::new(e),
            };
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        meta_r.append_output(&data);
                        if let Some(cb) = &cb {
                            (cb.on_output)(id, &data);
                        }
                    }
                }
            }
        });
    }

    // Monitor thread: observe exit without holding the child lock while waiting,
    // so kill_session can always take the lock and terminate the process.
    let meta_m = meta;
    let cb_exit = callbacks;
    thread::spawn(move || {
        loop {
            let status = {
                let Ok(mut guard) = child_slot.lock() else { break };
                match guard.as_mut() {
                    Some(child) => match child.try_wait() {
                        Ok(Some(status)) => Some(status.code().unwrap_or(-1)),
                        Ok(None) => None,
                        Err(_) => Some(-1),
                    },
                    // Killed and reaped elsewhere.
                    None => Some(meta_m.exit_code().unwrap_or(-1)),
                }
            };
            if let Some(code) = status {
                meta_m.mark_exited(Some(code));
                if let Some(cb) = &cb_exit {
                    (cb.on_exit)(id, code);
                }
                break;
            }
            thread::sleep(std::time::Duration::from_millis(100));
        }
    });

    state.prune_finished_sessions();
    Ok(id)
}

enum PipeSource {
    Out(std::process::ChildStdout),
    Err(std::process::ChildStderr),
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
    {
        let mut sessions = state.sessions.lock()?;
        if let Some(mut session) = sessions.remove(&id) {
            session.cancellation_token.cancel();
            let _ = session.child.kill();
            // Killed sessions report exit code -1 and wake any waiters.
            session.meta.mark_exited(Some(-1));
            return Ok(());
        }
    }
    let piped = {
        let mut piped_map = state.piped_sessions.lock()?;
        piped_map.remove(&id)
    };
    if let Some(session) = piped {
        if let Ok(mut guard) = session.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        session.meta.mark_exited(Some(-1));
    }
    Ok(())
}

pub async fn pty_kill_all(state: tauri::State<'_, PtyState>) -> Result<(), AppError> {
    {
        let mut sessions = state.sessions.lock()?;
        for (_, mut session) in sessions.drain() {
            session.cancellation_token.cancel();
            let _ = session.child.kill();
            session.meta.mark_exited(Some(-1));
        }
    }
    let mut piped = state.piped_sessions.lock()?;
    for (_, session) in piped.drain() {
        if let Ok(mut guard) = session.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        session.meta.mark_exited(Some(-1));
    }
    Ok(())
}
