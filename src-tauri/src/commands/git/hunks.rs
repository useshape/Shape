//! Partial (hunk / line) staging via `git apply --cached` / `git apply`.

use super::{git_cmd, resolve_repo_relative_path};
use crate::core::error::AppError;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;
use std::process::Stdio;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHunkLine {
    /// `context` | `add` | `del`
    #[serde(rename = "type")]
    pub line_type: String,
    /// Line text without the leading +/-/space marker.
    pub content: String,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHunk {
    pub index: usize,
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<GitHunkLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHunkList {
    pub path: String,
    pub staged: bool,
    pub hunks: Vec<GitHunk>,
}

fn run_git_diff(repo_path: &str, rel_path: &str, staged: bool) -> Result<String, AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = git_cmd()?;
    cmd.current_dir(repo_path);
    if staged {
        cmd.args(["diff", "--cached", "-U3", "--", rel_path]);
    } else {
        cmd.args(["diff", "-U3", "--", rel_path]);
    }
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let out = cmd.output().map_err(|e| AppError::Message(e.to_string()))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        // Empty / no changes is fine.
        if stderr.trim().is_empty() {
            return Ok(String::new());
        }
        return Err(AppError::Message(format!("git diff failed: {stderr}")));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn parse_hunk_header(header: &str) -> Option<(u32, u32, u32, u32)> {
    // @@ -oldStart,oldCount +newStart,newCount @@
    let rest = header.trim().strip_prefix("@@")?;
    let rest = rest.trim();
    let end = rest.find("@@")?;
    let ranges = rest[..end].trim();
    let mut parts = ranges.split_whitespace();
    let old = parts.next()?.strip_prefix('-')?;
    let new = parts.next()?.strip_prefix('+')?;
    let parse_range = |s: &str| -> Option<(u32, u32)> {
        if let Some((a, b)) = s.split_once(',') {
            Some((a.parse().ok()?, b.parse().ok()?))
        } else {
            Some((s.parse().ok()?, 1))
        }
    };
    let (old_start, old_lines) = parse_range(old)?;
    let (new_start, new_lines) = parse_range(new)?;
    Some((old_start, old_lines, new_start, new_lines))
}

fn parse_patch_hunks(patch: &str) -> Vec<GitHunk> {
    let mut hunks = Vec::new();
    let mut current: Option<(String, u32, u32, u32, u32, Vec<GitHunkLine>, u32, u32)> = None;

    let flush = |current: &mut Option<(String, u32, u32, u32, u32, Vec<GitHunkLine>, u32, u32)>,
                 hunks: &mut Vec<GitHunk>| {
        if let Some((header, old_start, old_lines, new_start, new_lines, lines, _, _)) = current.take()
        {
            hunks.push(GitHunk {
                index: hunks.len(),
                header,
                old_start,
                old_lines,
                new_start,
                new_lines,
                lines,
            });
        }
    };

    for raw in patch.lines() {
        if raw.starts_with("@@") {
            flush(&mut current, &mut hunks);
            if let Some((os, ol, ns, nl)) = parse_hunk_header(raw) {
                current = Some((raw.to_string(), os, ol, ns, nl, Vec::new(), os, ns));
            }
            continue;
        }
        let Some((_, _, _, _, _, lines, old_cur, new_cur)) = current.as_mut() else {
            continue;
        };
        if raw.starts_with('\\') {
            // "\ No newline at end of file"
            continue;
        }
        let (line_type, content) = if let Some(rest) = raw.strip_prefix('+') {
            ("add", rest)
        } else if let Some(rest) = raw.strip_prefix('-') {
            ("del", rest)
        } else if let Some(rest) = raw.strip_prefix(' ') {
            ("context", rest)
        } else {
            continue;
        };

        let (old_line, new_line) = match line_type {
            "context" => {
                let ol = *old_cur;
                let nl = *new_cur;
                *old_cur += 1;
                *new_cur += 1;
                (Some(ol), Some(nl))
            }
            "add" => {
                let nl = *new_cur;
                *new_cur += 1;
                (None, Some(nl))
            }
            "del" => {
                let ol = *old_cur;
                *old_cur += 1;
                (Some(ol), None)
            }
            _ => (None, None),
        };

        lines.push(GitHunkLine {
            line_type: line_type.to_string(),
            content: content.to_string(),
            old_line,
            new_line,
        });
    }
    flush(&mut current, &mut hunks);
    hunks
}

pub fn git_list_hunks(
    repo_path: String,
    file_path: String,
    staged: bool,
) -> Result<GitHunkList, AppError> {
    let rel_path = resolve_repo_relative_path(&repo_path, &file_path);
    let patch = run_git_diff(&repo_path, &rel_path, staged)?;
    let hunks = parse_patch_hunks(&patch);
    Ok(GitHunkList {
        path: rel_path,
        staged,
        hunks,
    })
}

fn patch_header_for(rel_path: &str) -> String {
    let unix = rel_path.replace('\\', "/");
    format!(
        "diff --git a/{p} b/{p}\n--- a/{p}\n+++ b/{p}\n",
        p = unix
    )
}

fn hunk_to_patch_body(hunk: &GitHunk) -> String {
    let mut body = String::new();
    body.push_str(&hunk.header);
    if !hunk.header.ends_with('\n') {
        body.push('\n');
    }
    for line in &hunk.lines {
        let prefix = match line.line_type.as_str() {
            "add" => '+',
            "del" => '-',
            _ => ' ',
        };
        body.push(prefix);
            body.push_str(&line.content);
        body.push('\n');
    }
    body
}

fn rebuild_header(old_start: u32, old_count: u32, new_start: u32, new_count: u32) -> String {
    format!("@@ -{old_start},{old_count} +{new_start},{new_count} @@")
}

/// Build a patch from a hunk, optionally keeping only selected change lines.
/// `selected`: indices into hunk.lines for add/del lines to include. Empty = whole hunk.
fn build_partial_hunk(hunk: &GitHunk, selected: &[usize]) -> Result<GitHunk, AppError> {
    if selected.is_empty() {
        return Ok(hunk.clone());
    }
    let selected_set: std::collections::HashSet<usize> = selected.iter().copied().collect();
    let mut new_lines: Vec<GitHunkLine> = Vec::new();
    let mut old_count = 0u32;
    let mut new_count = 0u32;

    for (i, line) in hunk.lines.iter().enumerate() {
        match line.line_type.as_str() {
            "context" => {
                new_lines.push(line.clone());
                old_count += 1;
                new_count += 1;
            }
            "add" => {
                if selected_set.contains(&i) {
                    new_lines.push(line.clone());
                    new_count += 1;
                }
                // Unselected additions are omitted from the patch (stay unstaged).
            }
            "del" => {
                if selected_set.contains(&i) {
                    new_lines.push(line.clone());
                    old_count += 1;
                } else {
                    // Unselected deletions become context (keep the line in the file/index).
                    new_lines.push(GitHunkLine {
                        line_type: "context".to_string(),
                        content: line.content.clone(),
                        old_line: line.old_line,
                        new_line: line.old_line,
                    });
                    old_count += 1;
                    new_count += 1;
                }
            }
            _ => {}
        }
    }

    if !new_lines.iter().any(|l| l.line_type == "add" || l.line_type == "del") {
        return Err(AppError::Message(
            "Selection contains no change lines to stage".to_string(),
        ));
    }

    Ok(GitHunk {
        index: hunk.index,
        header: rebuild_header(hunk.old_start, old_count, hunk.new_start, new_count),
        old_start: hunk.old_start,
        old_lines: old_count,
        new_start: hunk.new_start,
        new_lines: new_count,
        lines: new_lines,
    })
}

fn apply_patch(repo_path: &str, patch: &str, cached: bool, reverse: bool) -> Result<(), AppError> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = git_cmd()?;
    cmd.current_dir(repo_path);
    cmd.arg("apply");
    if cached {
        cmd.arg("--cached");
    }
    if reverse {
        cmd.arg("-R");
    }
    cmd.arg("--unidiff-zero");
    cmd.arg("-");
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Message(format!("failed to spawn git apply: {e}")))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(patch.as_bytes())
            .map_err(|e| AppError::Message(e.to_string()))?;
    }
    let out = child
        .wait_with_output()
        .map_err(|e| AppError::Message(e.to_string()))?;
    if !out.status.success() {
        // Retry without --unidiff-zero for normal hunks.
        let mut cmd2 = git_cmd()?;
        cmd2.current_dir(repo_path);
        cmd2.arg("apply");
        if cached {
            cmd2.arg("--cached");
        }
        if reverse {
            cmd2.arg("-R");
        }
        cmd2.arg("-");
        cmd2.stdin(Stdio::piped());
        cmd2.stdout(Stdio::piped());
        cmd2.stderr(Stdio::piped());
        #[cfg(windows)]
        cmd2.creation_flags(0x08000000);

        let mut child2 = cmd2
            .spawn()
            .map_err(|e| AppError::Message(format!("failed to spawn git apply: {e}")))?;
        if let Some(mut stdin) = child2.stdin.take() {
            stdin
                .write_all(patch.as_bytes())
                .map_err(|e| AppError::Message(e.to_string()))?;
        }
        let out2 = child2
            .wait_with_output()
            .map_err(|e| AppError::Message(e.to_string()))?;
        if !out2.status.success() {
            let stderr = String::from_utf8_lossy(&out2.stderr);
            return Err(AppError::Message(format!(
                "git apply failed: {}",
                stderr.trim()
            )));
        }
    }
    Ok(())
}

fn get_hunk(
    repo_path: &str,
    file_path: &str,
    staged: bool,
    hunk_index: usize,
) -> Result<(String, GitHunk), AppError> {
    let list = git_list_hunks(repo_path.to_string(), file_path.to_string(), staged)?;
    let hunk = list
        .hunks
        .into_iter()
        .find(|h| h.index == hunk_index)
        .ok_or_else(|| AppError::Message(format!("Hunk {hunk_index} not found")))?;
    Ok((list.path, hunk))
}

fn full_patch(rel_path: &str, hunk: &GitHunk) -> String {
    let mut patch = patch_header_for(rel_path);
    patch.push_str(&hunk_to_patch_body(hunk));
    patch
}

pub fn git_stage_hunk(
    repo_path: String,
    file_path: String,
    hunk_index: usize,
    line_indices: Option<Vec<usize>>,
) -> Result<(), AppError> {
    let (rel, hunk) = get_hunk(&repo_path, &file_path, false, hunk_index)?;
    let hunk = match line_indices {
        Some(sel) if !sel.is_empty() => build_partial_hunk(&hunk, &sel)?,
        _ => hunk,
    };
    let patch = full_patch(&rel, &hunk);
    apply_patch(&repo_path, &patch, true, false)
}

pub fn git_unstage_hunk(
    repo_path: String,
    file_path: String,
    hunk_index: usize,
    line_indices: Option<Vec<usize>>,
) -> Result<(), AppError> {
    let (rel, hunk) = get_hunk(&repo_path, &file_path, true, hunk_index)?;
    let hunk = match line_indices {
        Some(sel) if !sel.is_empty() => build_partial_hunk(&hunk, &sel)?,
        _ => hunk,
    };
    let patch = full_patch(&rel, &hunk);
    // Reverse-apply the staged hunk onto the index.
    apply_patch(&repo_path, &patch, true, true)
}

pub fn git_restore_hunk(
    repo_path: String,
    file_path: String,
    hunk_index: usize,
    line_indices: Option<Vec<usize>>,
) -> Result<(), AppError> {
    let (rel, hunk) = get_hunk(&repo_path, &file_path, false, hunk_index)?;
    let hunk = match line_indices {
        Some(sel) if !sel.is_empty() => build_partial_hunk(&hunk, &sel)?,
        _ => hunk,
    };
    let patch = full_patch(&rel, &hunk);
    // Reverse-apply onto the working tree (discard local changes in this hunk).
    apply_patch(&repo_path, &patch, false, true)?;

    // If file became empty / missing after restore of a new file hunk, leave as-is.
    let _ = Path::new(&repo_path).join(&rel);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;

    fn git(repo: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(repo)
            .status()
            .expect("git");
        assert!(status.success(), "git {:?} failed", args);
    }

    #[test]
    fn stage_unstage_restore_hunk_roundtrip() {
        let dir = std::env::temp_dir().join(format!(
            "shape-hunk-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        git(&dir, &["init"]);
        git(&dir, &["config", "user.email", "t@example.com"]);
        git(&dir, &["config", "user.name", "t"]);

        // Two separated hunks.
        let base: String = (1..=40).map(|i| format!("line{i}\n")).collect();
        fs::write(dir.join("f.txt"), &base).unwrap();
        git(&dir, &["add", "f.txt"]);
        git(&dir, &["commit", "-m", "init"]);

        let mut modified = base.replace("line5\n", "CHANGED5\n");
        modified = modified.replace("line30\n", "CHANGED30\n");
        fs::write(dir.join("f.txt"), &modified).unwrap();

        let repo = dir.to_string_lossy().to_string();
        let list = git_list_hunks(repo.clone(), "f.txt".into(), false).unwrap();
        assert!(
            list.hunks.len() >= 2,
            "expected >=2 hunks, got {}",
            list.hunks.len()
        );

        git_stage_hunk(repo.clone(), "f.txt".into(), 0, None).unwrap();
        let unstaged = git_list_hunks(repo.clone(), "f.txt".into(), false).unwrap();
        let staged = git_list_hunks(repo.clone(), "f.txt".into(), true).unwrap();
        assert_eq!(staged.hunks.len(), 1);
        assert_eq!(unstaged.hunks.len(), list.hunks.len() - 1);

        git_unstage_hunk(repo.clone(), "f.txt".into(), 0, None).unwrap();
        let staged2 = git_list_hunks(repo.clone(), "f.txt".into(), true).unwrap();
        assert!(staged2.hunks.is_empty());

        let before_restore = fs::read_to_string(dir.join("f.txt")).unwrap();
        assert!(before_restore.contains("CHANGED5"));
        let after_unstage = git_list_hunks(repo.clone(), "f.txt".into(), false).unwrap();
        assert!(
            after_unstage.hunks.len() >= 2,
            "both hunks should be unstaged again"
        );
        git_restore_hunk(repo.clone(), "f.txt".into(), 0, None).unwrap();
        let after = fs::read_to_string(dir.join("f.txt")).unwrap();
        assert!(
            !after.contains("CHANGED5"),
            "restore should remove CHANGED5; got:\n{after}"
        );
        assert!(after.contains("line5"), "restore should bring back line5");
        assert!(after.contains("CHANGED30"), "other hunk should remain");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn stage_selected_lines_partial() {
        let dir = std::env::temp_dir().join(format!(
            "shape-hunk-lines-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        git(&dir, &["init"]);
        git(&dir, &["config", "user.email", "t@example.com"]);
        git(&dir, &["config", "user.name", "t"]);

        fs::write(dir.join("f.txt"), "a\nb\nc\nd\ne\n").unwrap();
        git(&dir, &["add", "f.txt"]);
        git(&dir, &["commit", "-m", "init"]);
        fs::write(dir.join("f.txt"), "a\nB\nC\nd\ne\n").unwrap();

        let repo = dir.to_string_lossy().to_string();
        let list = git_list_hunks(repo.clone(), "f.txt".into(), false).unwrap();
        assert_eq!(list.hunks.len(), 1);
        let hunk = &list.hunks[0];
        let add_indices: Vec<usize> = hunk
            .lines
            .iter()
            .enumerate()
            .filter(|(_, l)| l.line_type == "add")
            .map(|(i, _)| i)
            .collect();
        assert!(add_indices.len() >= 2);

        // Stage only the first added line.
        git_stage_hunk(
            repo.clone(),
            "f.txt".into(),
            0,
            Some(vec![add_indices[0]]),
        )
        .unwrap();

        let staged = git_list_hunks(repo.clone(), "f.txt".into(), true).unwrap();
        let unstaged = git_list_hunks(repo, "f.txt".into(), false).unwrap();
        assert!(!staged.hunks.is_empty());
        assert!(!unstaged.hunks.is_empty());

        let _ = fs::remove_dir_all(&dir);
    }
}
