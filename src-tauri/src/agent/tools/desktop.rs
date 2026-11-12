//! Computer-use helpers used by inspect_computer and terminal gating.

use std::path::Path;

pub fn summary(_project_path: &str, _computer_use: bool, _shell_automation: bool) -> String {
    "Computer use is not available in this build.".into()
}

pub fn lookup_program(_query: &str) -> Result<String, String> {
    Err("Computer use is not available in this build.".into())
}

pub fn list_processes(_query: &str) -> Result<String, String> {
    Err("Computer use is not available in this build.".into())
}

pub fn list_windows(_query: &str) -> Result<String, String> {
    Err("Computer use is not available in this build.".into())
}

pub fn capture_window(_query: &str) -> Result<WindowShot, String> {
    Err("Window capture is not available in this build.".into())
}

pub fn is_sensitive_surface(_query: &str) -> bool {
    false
}

pub fn command_targets_secret(cmd_lower: &str) -> bool {
    cmd_lower.contains(".ssh")
        || cmd_lower.contains(".aws")
        || cmd_lower.contains("id_rsa")
        || cmd_lower.contains(".env")
}

pub fn touches_sealed_project(command: &str, sealed: &str, project_path: &str) -> bool {
    let sealed = Path::new(sealed);
    let project = Path::new(project_path);
    if sealed == project {
        return command_mentions_path(command, sealed);
    }
    command_mentions_path(command, sealed)
}

fn command_mentions_path(command: &str, path: &Path) -> bool {
    let raw = path.to_string_lossy();
    if raw.is_empty() {
        return false;
    }
    let lower = command.to_ascii_lowercase();
    let path_lower = raw.to_ascii_lowercase();
    let slash = path_lower.replace('\\', "/");
    lower.contains(&path_lower) || lower.contains(&slash)
}

pub struct WindowShot {
    pub png: Vec<u8>,
    pub title: String,
}
