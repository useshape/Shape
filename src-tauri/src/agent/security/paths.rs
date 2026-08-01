use crate::core::error::AppError;
use std::path::{Path, PathBuf};

/// Sensitive file patterns that the AI should never read or write.
/// Matched case-insensitively (CVE-2025-59944 class: Windows/macOS FS).
const SENSITIVE_PATTERNS: &[&str] = &[
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    "id_rsa",
    "id_ed25519",
    "id_ecdsa",
    ".pem",
    ".key",
    ".p12",
    ".pfx",
    "credentials.json",
    "service-account.json",
    "secrets.json",
    "token.json",
    ".npmrc",
    ".pypirc",
    "shadow",
    "passwd",
    // Editor / agent config that can lead to RCE if silently rewritten
    // (CVE-2025-61590 / CVE-2025-32018 / CVE-2025-54130 follow-on classes).
    "tasks.json",
    "launch.json",
    "mcp.json",
    "cli.json",
];

/// Filename suffixes matched case-insensitively.
const SENSITIVE_SUFFIXES: &[&str] = &[".pem", ".key", ".p12", ".pfx", ".code-workspace"];

/// Editor config dirs — `settings.json` only sensitive inside these.
const EDITOR_CONFIG_DIRS: &[&str] = &[".vscode", ".cursor", ".shape"];

/// Directories that should never be written to by the AI.
const PROTECTED_DIRS: &[&str] = &[
    ".git",
    ".ssh",
    ".gnupg",
    ".aws",
    ".azure",
    ".kube",
    ".docker",
];

fn ascii_eq_ignore_case(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

fn ascii_ends_with_ignore_case(value: &str, suffix: &str) -> bool {
    let v = value.as_bytes();
    let s = suffix.as_bytes();
    if s.len() > v.len() {
        return false;
    }
    v[v.len() - s.len()..].eq_ignore_ascii_case(s)
}

fn under_editor_config_dir(path: &Path) -> bool {
    for component in path.components() {
        if let std::path::Component::Normal(c) = component {
            let c_str = c.to_string_lossy();
            for dir in EDITOR_CONFIG_DIRS {
                if ascii_eq_ignore_case(&c_str, dir) {
                    return true;
                }
            }
        }
    }
    false
}

/// Resolve a user-provided path to an absolute path within the project root.
/// Returns an error if the path escapes the project boundary.
pub fn resolve_safe_path(user_path: &str, project_root: &str) -> Result<PathBuf, AppError> {
    if project_root.is_empty() {
        return Err(AppError::Message(
            "No project is open. Cannot resolve path.".to_string(),
        ));
    }

    let root = PathBuf::from(project_root);
    let canonical_root = root.canonicalize().map_err(|e| {
        AppError::Message(format!("Cannot resolve project root: {}", e))
    })?;

    // Strip leading separators to prevent absolute path injection
    let cleaned = user_path
        .trim_start_matches('/')
        .trim_start_matches('\\');

    // Block explicit traversal patterns before resolution
    if cleaned.contains("..") {
        return Err(AppError::Message(
            "Path traversal (..) is not allowed.".to_string(),
        ));
    }

    let target = if Path::new(user_path).is_absolute() {
        PathBuf::from(user_path)
    } else {
        root.join(cleaned)
    };

    // For existing paths, canonicalize to resolve symlinks
    let resolved = if target.exists() {
        target.canonicalize().map_err(|e| {
            AppError::Message(format!("Cannot resolve path: {}", e))
        })?
    } else {
        // For new files, canonicalize the parent and append the filename
        if let Some(parent) = target.parent() {
            if parent.exists() {
                let canonical_parent = parent.canonicalize().map_err(|e| {
                    AppError::Message(format!("Cannot resolve parent: {}", e))
                })?;
                if let Some(file_name) = target.file_name() {
                    canonical_parent.join(file_name)
                } else {
                    return Err(AppError::Message("Invalid file path.".to_string()));
                }
            } else {
                // Parent doesn't exist yet — validate each component has no traversal
                let mut check = canonical_root.clone();
                for component in target.strip_prefix(&root).unwrap_or(&target).components() {
                    match component {
                        std::path::Component::Normal(c) => check.push(c),
                        std::path::Component::ParentDir => {
                            return Err(AppError::Message(
                                "Path traversal (..) is not allowed.".to_string(),
                            ));
                        }
                        _ => {}
                    }
                }
                check
            }
        } else {
            target
        }
    };

    // Path::starts_with matches whole components (not string prefixes), so
    // C:\proj does not authorize C:\proj-evil (CVE-2025-54794 class).
    if !resolved.starts_with(&canonical_root) {
        return Err(AppError::Message(format!(
            "Access denied: path '{}' is outside the project directory.",
            user_path
        )));
    }

    Ok(resolved)
}

/// Check if a file path targets a sensitive file that should not be accessible.
pub fn is_sensitive_path(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    for pattern in SENSITIVE_PATTERNS {
        if ascii_eq_ignore_case(name, pattern) {
            return true;
        }
    }
    for suffix in SENSITIVE_SUFFIXES {
        if ascii_ends_with_ignore_case(name, suffix) {
            return true;
        }
    }

    // settings.json under editor config dirs only (CVE-2025-54130 class).
    if ascii_eq_ignore_case(name, "settings.json") && under_editor_config_dir(path) {
        return true;
    }

    // Check if any component is a protected directory (case-insensitive).
    for component in path.components() {
        if let std::path::Component::Normal(c) = component {
            let c_str = c.to_string_lossy();
            for dir in PROTECTED_DIRS {
                if ascii_eq_ignore_case(&c_str, dir) {
                    return true;
                }
            }
        }
    }

    false
}

/// Validate a path for read operations. Ensures it's within project and not sensitive.
pub fn validate_read_path(user_path: &str, project_root: &str) -> Result<PathBuf, AppError> {
    let resolved = resolve_safe_path(user_path, project_root)?;

    if is_sensitive_path(&resolved) {
        return Err(AppError::Message(format!(
            "Access denied: '{}' is a sensitive file and cannot be read by the AI.",
            user_path
        )));
    }

    Ok(resolved)
}

/// Validate a path for write operations. More restrictive than read.
pub fn validate_write_path(user_path: &str, project_root: &str) -> Result<PathBuf, AppError> {
    let resolved = resolve_safe_path(user_path, project_root)?;

    if is_sensitive_path(&resolved) {
        return Err(AppError::Message(format!(
            "Access denied: '{}' is a sensitive/protected file and cannot be modified by the AI.",
            user_path
        )));
    }

    Ok(resolved)
}

/// Validate a path for delete operations. Most restrictive — no directory deletion.
pub fn validate_delete_path(user_path: &str, project_root: &str) -> Result<PathBuf, AppError> {
    let resolved = resolve_safe_path(user_path, project_root)?;

    if is_sensitive_path(&resolved) {
        return Err(AppError::Message(format!(
            "Access denied: '{}' is a protected path and cannot be deleted.",
            user_path
        )));
    }

    // Prevent bulk-deletion of directories by the AI
    if resolved.is_dir() {
        return Err(AppError::Message(
            "The AI cannot delete directories. Only individual files can be deleted. \
             If you need to remove a directory, please do it manually."
                .to_string(),
        ));
    }

    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_traversal_blocked() {
        let result = resolve_safe_path("../../etc/passwd", "C:\\test\\project");
        assert!(result.is_err());
    }

    #[test]
    fn test_sensitive_detection() {
        assert!(is_sensitive_path(Path::new("/project/.env")));
        assert!(is_sensitive_path(Path::new("/project/.git/config")));
        assert!(is_sensitive_path(Path::new("/project/id_rsa")));
        assert!(!is_sensitive_path(Path::new("/project/src/main.rs")));
    }

    #[test]
    fn test_sensitive_case_insensitive() {
        assert!(is_sensitive_path(Path::new("/project/.ENV")));
        assert!(is_sensitive_path(Path::new("/project/.Git/config")));
        assert!(is_sensitive_path(Path::new("/project/Id_Rsa")));
        assert!(is_sensitive_path(Path::new("/project/.vscode/Tasks.json")));
        assert!(is_sensitive_path(Path::new("/project/Foo.CODE-WORKSPACE")));
        assert!(is_sensitive_path(Path::new("/project/.cursor/MCP.json")));
        assert!(is_sensitive_path(Path::new("/project/.vscode/settings.json")));
        assert!(is_sensitive_path(Path::new("/project/.VsCode/Settings.JSON")));
        assert!(!is_sensitive_path(Path::new("/project/app/settings.json")));
        assert!(is_sensitive_path(Path::new("/project/.git/hooks/pre-commit")));
    }

    #[test]
    fn test_allows_project_relative_paths() {
        let temp = std::env::temp_dir().join("shape-path-security-test");
        let _ = std::fs::create_dir_all(&temp);
        let root = temp.to_string_lossy();
        let result = resolve_safe_path("src/main.ts", root.as_ref());
        assert!(result.is_ok());
        let _ = std::fs::remove_dir_all(&temp);
    }
}
