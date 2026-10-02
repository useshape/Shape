//! Isolated git worktrees for parallel agents. Never merges into the user's branch.

use crate::core::git_bin;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Isolation {
    /// Same working directory as the parent. Concurrent editors can overwrite each other.
    Shared,
    /// Sibling git worktree + new branch. Parent/user review and merge later.
    Worktree,
}

impl Isolation {
    pub fn parse(raw: Option<&str>) -> Self {
        match raw.unwrap_or("shared").trim().to_ascii_lowercase().as_str() {
            "worktree" | "isolated" | "isolate" => Self::Worktree,
            _ => Self::Shared,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Shared => "shared",
            Self::Worktree => "worktree",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Checkout {
    pub project_path: String,
    pub branch: Option<String>,
    pub isolated: bool,
    pub note: String,
}

pub fn prepare(repo: &str, slug: &str, isolation: Isolation) -> Checkout {
    match isolation {
        Isolation::Shared => Checkout {
            project_path: repo.to_string(),
            branch: None,
            isolated: false,
            note: "Shared checkout with the parent. If other agents edit the same files at the same time, they can overwrite each other.".to_string(),
        },
        Isolation::Worktree => match add_worktree(repo, slug) {
            Ok(c) => c,
            Err(e) => Checkout {
                project_path: repo.to_string(),
                branch: None,
                isolated: false,
                note: format!(
                    "Could not create a git worktree ({e}). Falling back to the shared checkout — avoid editing the same files as other agents."
                ),
            },
        },
    }
}

fn sanitize_slug(slug: &str) -> String {
    let mut out = String::new();
    for ch in slug.chars().flat_map(|c| c.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
        } else if ch == '-' || ch == '_' || ch.is_whitespace() {
            if !out.ends_with('-') {
                out.push('-');
            }
        }
        if out.len() >= 24 {
            break;
        }
    }
    let trimmed = out.trim_matches('-');
    if trimmed.is_empty() {
        "agent".to_string()
    } else {
        trimmed.to_string()
    }
}

fn add_worktree(repo: &str, slug: &str) -> Result<Checkout, String> {
    let root = std::path::Path::new(repo);
    if !root.join(".git").exists() && !root.join(".git").is_file() {
        return Err("not a git repository".to_string());
    }
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let slug = sanitize_slug(slug);
    let branch = format!("shape/{slug}-{millis}");
    let folder = root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("repo");
    let parent = root.parent().unwrap_or(root);
    let dest = parent.join(format!("{folder}-{}", branch.replace('/', "-")));
    let dest_str = dest.to_string_lossy().to_string();

    let mut cmd = git_bin::git_command().map_err(|e| e.to_string())?;
    let output = cmd
        .current_dir(repo)
        .args(["worktree", "add", "-b", &branch])
        .arg(&dest)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(err.trim().chars().take(400).collect());
    }
    Ok(Checkout {
        project_path: dest_str,
        branch: Some(branch.clone()),
        isolated: true,
        note: format!(
            "Isolated git worktree on branch `{branch}`. Do not merge into the user's original branch. Leave the work on this branch for review."
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_isolation() {
        assert_eq!(Isolation::parse(None), Isolation::Shared);
        assert_eq!(Isolation::parse(Some("worktree")), Isolation::Worktree);
        assert_eq!(Isolation::parse(Some("SHARED")), Isolation::Shared);
    }

    #[test]
    fn slug_sanitizes() {
        assert_eq!(sanitize_slug("API / auth!!"), "api-auth");
        assert_eq!(sanitize_slug("@@@"), "agent");
    }
}
