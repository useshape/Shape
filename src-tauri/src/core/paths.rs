/// Strip Windows extended-length prefixes so `cmd.exe` and path comparisons
/// see a normal drive path. `Path::canonicalize()` returns `\\?\C:\...`, which
/// ConPTY/cmd treat as an unsupported UNC directory.
pub fn strip_extended_path_prefix(path: &str) -> String {
    let p = path.trim();
    if let Some(rest) = p.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    if let Some(rest) = p.strip_prefix("//?/UNC/") {
        return format!("//{rest}");
    }
    p.strip_prefix(r"\\?\")
        .or_else(|| p.strip_prefix("//?/"))
        .unwrap_or(p)
        .to_string()
}

/// Slash-normalized, prefix-stripped path for equality checks.
pub fn normalize_fs_path(path: &str) -> String {
    let stripped = strip_extended_path_prefix(path);
    let mut normalized = stripped.replace('\\', "/");
    while normalized.ends_with('/') && normalized.len() > 1 {
        normalized.pop();
    }
    if cfg!(windows) {
        normalized.make_ascii_lowercase();
    }
    normalized
}

/// Directory to pass to a PTY/`cmd.exe` child: native separators, no `\\?\`.
pub fn spawn_cwd(path: &str) -> String {
    let stripped = strip_extended_path_prefix(path);
    if cfg!(windows) {
        stripped.replace('/', "\\")
    } else {
        stripped.replace('\\', "/")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_windows_extended_prefix() {
        assert_eq!(
            strip_extended_path_prefix(r"\\?\C:\Users\User\Desktop\port\portfolio"),
            r"C:\Users\User\Desktop\port\portfolio"
        );
        assert_eq!(
            strip_extended_path_prefix(r"C:\Users\User\Desktop\port\portfolio"),
            r"C:\Users\User\Desktop\port\portfolio"
        );
        assert_eq!(
            strip_extended_path_prefix(r"\\?\UNC\server\share\app"),
            r"\\server\share\app"
        );
    }

    #[test]
    fn same_project_with_and_without_prefix() {
        assert_eq!(
            normalize_fs_path(r"\\?\C:\Users\User\Desktop\port\portfolio"),
            normalize_fs_path(r"C:\Users\User\Desktop\port\portfolio\")
        );
    }
}
