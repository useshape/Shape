/// Codex-style `apply_patch` parser (OpenAI agent training format).
///
/// Patch language (simplified from openai/codex):
/// ```text
/// *** Begin Patch
/// *** Add File: path
/// +line
/// *** Update File: path
/// @@ optional header
///  context
/// -removed
/// +added
/// *** Delete File: path
/// *** End Patch
/// ```

use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PatchHunkAction {
    Add { path: String, content: String },
    Delete { path: String },
    Update { path: String, new_content: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedPatch {
    pub actions: Vec<PatchHunkAction>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PatchApplyError {
    pub message: String,
}

impl std::fmt::Display for PatchApplyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

#[derive(Debug, Clone)]
pub struct AppliedFileChange {
    pub path: String,
    pub original: Option<String>,
    pub merged: String,
    pub is_new_file: bool,
    pub is_delete: bool,
}

pub fn parse_patch(input: &str) -> Result<ParsedPatch, PatchApplyError> {
    let text = input.trim();
    if text.is_empty() {
        return Err(PatchApplyError {
            message: "Empty patch input.".to_string(),
        });
    }

    let begin = "*** Begin Patch";
    let end = "*** End Patch";
    let body = if text.contains(begin) {
        let start = text
            .find(begin)
            .ok_or_else(|| PatchApplyError {
                message: "Missing `*** Begin Patch`.".to_string(),
            })?;
        let after_begin = &text[start + begin.len()..];
        let end_idx = after_begin.find(end).ok_or_else(|| PatchApplyError {
            message: "Missing `*** End Patch`.".to_string(),
        })?;
        after_begin[..end_idx].trim()
    } else {
        // Allow raw body without markers (some models omit them).
        text
    };

    let mut actions = Vec::new();
    let mut lines = body.lines().peekable();

    while let Some(line) = lines.next() {
        let line = line.trim_end_matches('\r');
        if line.trim().is_empty() {
            continue;
        }

        if let Some(path) = line.strip_prefix("*** Add File: ") {
            let path = path.trim().to_string();
            if path.is_empty() {
                return Err(PatchApplyError {
                    message: "Add File missing path.".to_string(),
                });
            }
            let mut content_lines = Vec::new();
            while let Some(peek) = lines.peek() {
                let p = peek.trim_end_matches('\r');
                if p.starts_with("*** ") {
                    break;
                }
                let l = lines.next().unwrap().trim_end_matches('\r');
                if let Some(rest) = l.strip_prefix('+') {
                    content_lines.push(rest.to_string());
                } else if l.is_empty() {
                    content_lines.push(String::new());
                } else {
                    // Tolerate bare lines as content for Add File.
                    content_lines.push(l.to_string());
                }
            }
            let mut content = content_lines.join("\n");
            if !content.is_empty() && !content.ends_with('\n') {
                content.push('\n');
            }
            actions.push(PatchHunkAction::Add { path, content });
            continue;
        }

        if let Some(path) = line.strip_prefix("*** Delete File: ") {
            let path = path.trim().to_string();
            if path.is_empty() {
                return Err(PatchApplyError {
                    message: "Delete File missing path.".to_string(),
                });
            }
            actions.push(PatchHunkAction::Delete { path });
            continue;
        }

        if let Some(path) = line.strip_prefix("*** Update File: ") {
            let path = path.trim().to_string();
            if path.is_empty() {
                return Err(PatchApplyError {
                    message: "Update File missing path.".to_string(),
                });
            }
            // Optional rename: *** Move to: new_path — ignore for now beyond path.
            let mut hunk_lines: Vec<String> = Vec::new();
            while let Some(peek) = lines.peek() {
                let p = peek.trim_end_matches('\r');
                if p.starts_with("*** ") && !p.starts_with("*** Move to:") {
                    break;
                }
                let l = lines.next().unwrap().trim_end_matches('\r').to_string();
                if l.starts_with("*** Move to:") {
                    continue;
                }
                hunk_lines.push(l);
            }
            // We need original file content to apply hunks — caller supplies via
            // a two-phase approach. Store hunk text; applied later in
            // `apply_update_hunks` when we have original.
            actions.push(PatchHunkAction::Update {
                path: path.clone(),
                // Temporary: store hunk text; replaced in apply_patch_in_memory
                // after reading original. Use a sentinel wrapper.
                new_content: encode_hunk_payload(&hunk_lines),
            });
            continue;
        }

        return Err(PatchApplyError {
            message: format!(
                "Unexpected patch line (expected *** Add/Update/Delete File): {}",
                truncate(line, 120)
            ),
        });
    }

    Ok(ParsedPatch { actions })
}

const HUNK_PAYLOAD_PREFIX: &str = "__SHAPE_HUNK__\n";

fn encode_hunk_payload(lines: &[String]) -> String {
    format!("{}{}", HUNK_PAYLOAD_PREFIX, lines.join("\n"))
}

fn decode_hunk_payload(s: &str) -> Option<Vec<String>> {
    s.strip_prefix(HUNK_PAYLOAD_PREFIX)
        .map(|rest| rest.lines().map(|l| l.to_string()).collect())
}

/// Re-resolve Update actions that still carry hunk payloads into final content.
pub fn materialize_updates(
    actions: Vec<PatchHunkAction>,
    project_root: &Path,
    read_file: impl Fn(&Path) -> Result<String, String>,
) -> Result<Vec<PatchHunkAction>, PatchApplyError> {
    let mut out = Vec::new();
    for action in actions {
        match action {
            PatchHunkAction::Update { path, new_content } => {
                if let Some(hunk_lines) = decode_hunk_payload(&new_content) {
                    let abs = project_root.join(&path);
                    let original = read_file(&abs).map_err(|e| PatchApplyError {
                        message: format!("Cannot read '{}' for Update File: {}", path, e),
                    })?;
                    let merged = apply_update_hunks(&original, &hunk_lines).map_err(|e| {
                        PatchApplyError {
                            message: format!("Update File '{}' failed: {}", path, e),
                        }
                    })?;
                    out.push(PatchHunkAction::Update {
                        path,
                        new_content: merged,
                    });
                } else {
                    out.push(PatchHunkAction::Update { path, new_content });
                }
            }
            other => out.push(other),
        }
    }
    Ok(out)
}

/// Apply @@ hunks (context / - / + lines) to file content.
pub fn apply_update_hunks(original: &str, hunk_lines: &[String]) -> Result<String, String> {
    // If no hunk markers and content looks like a full replacement, reject —
    // require at least one change line.
    let has_change = hunk_lines
        .iter()
        .any(|l| l.starts_with('+') || l.starts_with('-'));
    if !has_change && hunk_lines.iter().any(|l| l.starts_with("@@")) {
        return Err("Hunk has no +/− change lines.".to_string());
    }

    let mut file_lines: Vec<String> = if original.is_empty() {
        Vec::new()
    } else {
        original.lines().map(|l| l.to_string()).collect()
    };
    // Preserve trailing newline semantics loosely.
    let ends_with_newline = original.ends_with('\n');

    let mut i = 0usize;
    while i < hunk_lines.len() {
        // Skip @@ headers
        if hunk_lines[i].starts_with("@@") {
            i += 1;
            continue;
        }

        // Collect one hunk until next @@ or end.
        let mut old_lines: Vec<String> = Vec::new();
        let mut new_lines: Vec<String> = Vec::new();
        while i < hunk_lines.len() && !hunk_lines[i].starts_with("@@") {
            let l = &hunk_lines[i];
            if let Some(rest) = l.strip_prefix('-') {
                old_lines.push(rest.to_string());
            } else if let Some(rest) = l.strip_prefix('+') {
                new_lines.push(rest.to_string());
            } else if let Some(rest) = l.strip_prefix(' ') {
                old_lines.push(rest.to_string());
                new_lines.push(rest.to_string());
            } else if l.is_empty() {
                // blank can be context
                old_lines.push(String::new());
                new_lines.push(String::new());
            } else {
                // Treat as context without prefix (common model mistake)
                old_lines.push(l.clone());
                new_lines.push(l.clone());
            }
            i += 1;
        }

        if old_lines.is_empty() && new_lines.is_empty() {
            continue;
        }

        if old_lines.is_empty() {
            // Pure insertion at end when no context — append.
            file_lines.extend(new_lines);
            continue;
        }

        let start = find_subslice(&file_lines, &old_lines).ok_or_else(|| {
            format!(
                "Could not find context block in file:\n{}",
                old_lines
                    .iter()
                    .take(8)
                    .map(|l| format!("  | {}", l))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        })?;
        let end = start + old_lines.len();
        file_lines.splice(start..end, new_lines);
    }

    let mut out = file_lines.join("\n");
    if ends_with_newline && !out.ends_with('\n') {
        out.push('\n');
    }
    Ok(out)
}

fn find_subslice(haystack: &[String], needle: &[String]) -> Option<usize> {
    if needle.is_empty() {
        return Some(0);
    }
    if needle.len() > haystack.len() {
        return None;
    }
    for start in 0..=(haystack.len() - needle.len()) {
        if haystack[start..start + needle.len()] == *needle {
            return Some(start);
        }
    }
    // Fuzzy: trim trailing whitespace compare
    for start in 0..=(haystack.len() - needle.len()) {
        let matched = haystack[start..start + needle.len()]
            .iter()
            .zip(needle.iter())
            .all(|(a, b)| a.trim_end() == b.trim_end());
        if matched {
            return Some(start);
        }
    }
    None
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max])
    }
}

/// High-level: parse patch, materialize updates, return file changes (no disk I/O write).
pub fn resolve_patch(
    input: &str,
    project_root: &Path,
) -> Result<Vec<AppliedFileChange>, PatchApplyError> {
    let read = |p: &Path| {
        std::fs::read_to_string(p).map_err(|e| e.to_string())
    };
    let parsed = parse_patch(input)?;
    let actions = materialize_updates(parsed.actions, project_root, read)?;
    let mut changes = Vec::new();
    for action in actions {
        match action {
            PatchHunkAction::Add { path, content } => {
                let abs = project_root.join(&path);
                if abs.exists() {
                    return Err(PatchApplyError {
                        message: format!(
                            "Add File failed: '{}' already exists — use Update File.",
                            path
                        ),
                    });
                }
                changes.push(AppliedFileChange {
                    path,
                    original: None,
                    merged: content,
                    is_new_file: true,
                    is_delete: false,
                });
            }
            PatchHunkAction::Delete { path } => {
                let abs = project_root.join(&path);
                let original = std::fs::read_to_string(&abs).map_err(|e| PatchApplyError {
                    message: format!("Delete File '{}': {}", path, e),
                })?;
                changes.push(AppliedFileChange {
                    path,
                    original: Some(original),
                    merged: String::new(),
                    is_new_file: false,
                    is_delete: true,
                });
            }
            PatchHunkAction::Update { path, new_content } => {
                let abs = project_root.join(&path);
                let original = std::fs::read_to_string(&abs).map_err(|e| PatchApplyError {
                    message: format!("Update File '{}': {}", path, e),
                })?;
                changes.push(AppliedFileChange {
                    path,
                    original: Some(original),
                    merged: new_content,
                    is_new_file: false,
                    is_delete: false,
                });
            }
        }
    }
    if changes.is_empty() {
        return Err(PatchApplyError {
            message: "Patch contained no file actions.".to_string(),
        });
    }
    Ok(changes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn scratch_dir() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("shape-apply-patch-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn parse_and_apply_update() {
        let dir = scratch_dir();
        let path = dir.join("a.txt");
        fs::write(&path, "hello\nworld\n").unwrap();

        let patch = r#"*** Begin Patch
*** Update File: a.txt
@@
 hello
-world
+world!
*** End Patch"#;

        let changes = resolve_patch(patch, &dir).unwrap();
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].merged, "hello\nworld!\n");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn parse_add_file() {
        let dir = scratch_dir();
        let patch = r#"*** Begin Patch
*** Add File: new.txt
+alpha
+beta
*** End Patch"#;
        let changes = resolve_patch(patch, &dir).unwrap();
        assert!(changes[0].is_new_file);
        assert_eq!(changes[0].merged, "alpha\nbeta\n");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn apply_hunks_unit() {
        let original = "a\nb\nc\n";
        let hunks = vec![
            "@@".to_string(),
            " a".to_string(),
            "-b".to_string(),
            "+B".to_string(),
            " c".to_string(),
        ];
        let out = apply_update_hunks(original, &hunks).unwrap();
        assert_eq!(out, "a\nB\nc\n");
    }
}
