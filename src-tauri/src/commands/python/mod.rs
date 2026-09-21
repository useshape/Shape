use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonInterpreter {
    pub path: String,
    pub label: String,
    pub version: Option<String>,
}

/// Discover Python interpreters on PATH, via the Windows py launcher, and common venvs.
#[tauri::command]
pub fn discover_python_interpreters(project_path: Option<String>) -> Vec<PythonInterpreter> {
    let mut out: Vec<PythonInterpreter> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let mut push = |path: PathBuf, kind: String| {
        let s = path.to_string_lossy().to_string();
        if s.is_empty() || !seen.insert(s.clone()) {
            return;
        }
        if !path.exists() {
            return;
        }
        let version = probe_version(&path);
        let label = match version.as_deref() {
            Some(v) if kind.to_lowercase().contains("venv") || kind.to_lowercase().contains("conda") => {
                format!("Python {v} ({kind})")
            }
            Some(v) => format!("Python {v}"),
            None => {
                if kind.to_lowercase().starts_with("python") {
                    kind
                } else {
                    format!("Python ({kind})")
                }
            }
        };
        out.push(PythonInterpreter {
            path: s,
            label,
            version,
        });
    };

    if let Some(ref root) = project_path {
        let root = Path::new(root);
        for rel in [
            ".venv/Scripts/python.exe",
            ".venv/bin/python",
            "venv/Scripts/python.exe",
            "venv/bin/python",
            ".conda/python.exe",
            ".conda/bin/python",
        ] {
            let p = root.join(rel);
            if p.exists() {
                push(p, "Workspace venv".into());
            }
        }
    }

    #[cfg(windows)]
    {
        if let Some(paths) = where_cmd("python") {
            for p in paths {
                push(p, "Python".into());
            }
        }
        if let Some(paths) = where_cmd("python3") {
            for p in paths {
                push(p, "Python 3".into());
            }
        }
        // `py -0p` lists installed interpreters (one path per line, may have leading `-3.x-64:`).
        if let Ok(output) = Command::new("py").args(["-0p"]).output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    let path_str = trimmed
                        .rsplit_once(':')
                        .map(|(_, p)| p.trim())
                        .unwrap_or(trimmed);
                    if path_str.is_empty() {
                        continue;
                    }
                    push(PathBuf::from(path_str), "py launcher".into());
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        for name in ["python3", "python"] {
            if let Some(paths) = which_cmd(name) {
                for p in paths {
                    push(p, name.into());
                }
            }
        }
    }

    out
}

fn probe_version(path: &Path) -> Option<String> {
    let output = Command::new(path)
        .args(["-c", "import sys; print('.'.join(map(str, sys.version_info[:3])))"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let v = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

#[cfg(windows)]
fn where_cmd(command: &str) -> Option<Vec<PathBuf>> {
    let output = Command::new("where").arg(command).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let paths: Vec<PathBuf> = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .map(PathBuf::from)
        .collect();
    if paths.is_empty() {
        None
    } else {
        Some(paths)
    }
}

#[cfg(not(windows))]
fn which_cmd(command: &str) -> Option<Vec<PathBuf>> {
    let output = Command::new("which").arg("-a").arg(command).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let paths: Vec<PathBuf> = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .map(PathBuf::from)
        .collect();
    if paths.is_empty() {
        None
    } else {
        Some(paths)
    }
}
