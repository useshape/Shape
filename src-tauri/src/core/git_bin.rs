use crate::core::error::AppError;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

static GIT_EXE: OnceLock<Result<PathBuf, String>> = OnceLock::new();

/// Resolve the system git executable once and cache the absolute path.
pub fn git_executable() -> Result<&'static Path, AppError> {
    GIT_EXE
        .get_or_init(resolve_git_executable)
        .as_ref()
        .map(|p| p.as_path())
        .map_err(|e| AppError::Message(e.clone()))
}

/// Build a `git` process using the cached absolute binary path.
pub fn git_command() -> Result<Command, AppError> {
    let mut cmd = Command::new(git_executable()?);
    crate::core::process::apply_trusted_binary_env(&mut cmd);
    crate::core::process::hide_console(&mut cmd);
    Ok(cmd)
}

fn resolve_git_executable() -> Result<PathBuf, String> {
    for candidate in known_git_paths() {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    if let Some(path) = resolve_from_path_lookup() {
        if path.is_file() && !is_workspace_planted_path(&path) {
            return Ok(path);
        }
    }

    Err("Git executable not found. Install Git for Windows or ensure git is on PATH.".to_string())
}

fn known_git_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    #[cfg(windows)]
    {
        let prog_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
        let prog_files_x86 =
            std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| r"C:\Program Files (x86)".to_string());
        paths.push(PathBuf::from(format!(r"{}\Git\cmd\git.exe", prog_files)));
        paths.push(PathBuf::from(format!(r"{}\Git\bin\git.exe", prog_files)));
        paths.push(PathBuf::from(format!(r"{}\Git\cmd\git.exe", prog_files_x86)));
        paths.push(PathBuf::from(format!(r"{}\Git\bin\git.exe", prog_files_x86)));
    }

    #[cfg(not(windows))]
    {
        for p in ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"] {
            paths.push(PathBuf::from(p));
        }
    }

    paths
}

fn safe_lookup_cwd() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(root) = std::env::var("SystemRoot") {
            return PathBuf::from(root);
        }
    }
    PathBuf::from("/")
}

fn resolve_from_path_lookup() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let output = Command::new("where")
            .arg("git")
            .current_dir(safe_lookup_cwd())
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let path = PathBuf::from(trimmed);
            if path.is_file() && !is_workspace_planted_path(&path) {
                return Some(path);
            }
        }
        None
    }

    #[cfg(not(windows))]
    {
        let output = Command::new("which")
            .arg("git")
            .current_dir(safe_lookup_cwd())
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let path = PathBuf::from(stdout.trim());
        if path.is_file() && !is_workspace_planted_path(&path) {
            Some(path)
        } else {
            None
        }
    }
}

/// Reject git binaries under common project/build folders (e.g. node_modules, target).
pub fn is_workspace_planted_path(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/").to_lowercase();
    let suspicious = [
        "/node_modules/",
        "/.git/",
        "/target/",
        "/dist/",
        "/build/",
        "/vendor/",
    ];
    suspicious.iter().any(|seg| normalized.contains(seg))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_node_modules_git() {
        assert!(is_workspace_planted_path(Path::new(
            "C:/project/node_modules/.bin/git.exe"
        )));
    }

    #[test]
    fn allows_program_files_git() {
        assert!(!is_workspace_planted_path(Path::new(
            "C:/Program Files/Git/cmd/git.exe"
        )));
    }
}
