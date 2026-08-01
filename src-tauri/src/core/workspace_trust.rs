use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct WorkspaceTrustState(pub Mutex<HashSet<String>>);

impl WorkspaceTrustState {
    pub fn new() -> Self {
        Self(Mutex::new(HashSet::new()))
    }

    pub fn normalize(path: &str) -> String {
        let mut normalized = path.trim().replace('\\', "/");
        while normalized.ends_with('/') && normalized.len() > 1 {
            normalized.pop();
        }
        normalized.to_lowercase()
    }

    pub fn is_trusted(&self, path: &str) -> bool {
        let key = Self::normalize(path);
        self.0
            .lock()
            .map(|set| set.contains(&key))
            .unwrap_or(false)
    }

    pub fn set_trusted(&self, path: &str, trusted: bool) {
        let key = Self::normalize(path);
        if let Ok(mut set) = self.0.lock() {
            if trusted {
                set.insert(key);
            } else {
                set.remove(&key);
            }
        }
    }
}

pub fn path_is_under_root(path: &Path, root: &Path) -> bool {
    let Ok(path) = path.canonicalize() else {
        return false;
    };
    let Ok(root) = root.canonicalize() else {
        return false;
    };
    path.starts_with(root)
}

pub fn command_path_under_project(command: &str, project_cwd: Option<&str>) -> bool {
    let Some(cwd) = project_cwd else {
        return false;
    };
    let project = PathBuf::from(cwd);
    let cmd_path = PathBuf::from(command);
    if cmd_path.is_absolute() {
        return path_is_under_root(&cmd_path, &project);
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_trailing_slash() {
        assert_eq!(
            WorkspaceTrustState::normalize("C:/Projects/App/"),
            "c:/projects/app"
        );
    }

    #[test]
    fn trust_roundtrip() {
        let state = WorkspaceTrustState::new();
        assert!(!state.is_trusted("C:/foo"));
        state.set_trusted("C:/foo", true);
        assert!(state.is_trusted("C:/foo"));
        state.set_trusted("C:/foo", false);
        assert!(!state.is_trusted("C:/foo"));
    }
}
