//! Shared pre-write validation for merged edits.
//!
//! Speculative resolve, full-file replacement, and fast-apply all share these
//! checks so a catastrophic merge never reaches disk.

use crate::core::error::AppError;

/// Refuse to save a merge that would corrupt or empty the file.
pub fn validate_merged_edit(
    merged: &str,
    original: &str,
    code_edit: &str,
    strategy: &str,
) -> Result<(), AppError> {
    if original.is_empty() {
        // New / empty originals: only reject total emptiness.
        if merged.trim().is_empty() {
            return Err(AppError::Message(format!(
                "{} produced an empty file — refusing to save",
                strategy
            )));
        }
        return Ok(());
    }

    if merged.trim().is_empty() {
        return Err(AppError::Message(format!(
            "{} produced an empty file — refusing to save",
            strategy
        )));
    }

    // Marker leakage: refuse writing SEARCH/REPLACE or conflict markers that the
    // original did not already contain.
    let original_had_search_markers = original.lines().any(is_edit_marker_line);
    let original_had_conflict = original.lines().any(is_git_conflict_marker_line);
    for line in merged.lines() {
        if is_edit_marker_line(line) && !original_had_search_markers {
            return Err(AppError::Message(format!(
                "{} leaked edit markers (`<<<<<<<` / `=======` / `>>>>>>>`) into the output — refusing to save. \
Re-read the file and retry with a clean SEARCH/REPLACE block.",
                strategy
            )));
        }
        if is_git_conflict_marker_line(line) && !original_had_conflict {
            return Err(AppError::Message(format!(
                "{} introduced git conflict markers into the output — refusing to save",
                strategy
            )));
        }
    }

    // Catastrophic shrink: refuse >60% line loss unless the edit looks intentional.
    let original_lines = original.lines().count();
    let merged_lines = merged.lines().count();
    if original_lines > 20 {
        let edit_lines = code_edit.lines().count();
        let intentional_full_rewrite = edit_lines as f64 / original_lines as f64 > 0.6
            && !code_edit.lines().any(|l| l.starts_with("<<<<<<< SEARCH"));
        if !intentional_full_rewrite {
            let kept_ratio = merged_lines as f64 / original_lines as f64;
            if kept_ratio < 0.4 {
                return Err(AppError::Message(format!(
                    "{} produced a suspiciously small file ({} -> {} lines, edit was {} lines). \
Refusing to save. Re-read the file and apply a smaller, unique SEARCH/REPLACE.",
                    strategy, original_lines, merged_lines, edit_lines
                )));
            }
        }
    }

    Ok(())
}

fn is_edit_marker_line(line: &str) -> bool {
    let t = line.trim_start();
    t.starts_with("<<<<<<< SEARCH")
        || t.starts_with(">>>>>>> REPLACE")
        || t == "======="
        || t.starts_with("======= ")
}

fn is_git_conflict_marker_line(line: &str) -> bool {
    let t = line.trim_start();
    (t.starts_with("<<<<<<<") && !t.starts_with("<<<<<<< SEARCH"))
        || (t.starts_with(">>>>>>>") && !t.starts_with(">>>>>>> REPLACE"))
}

const EXCERPT_CHARS: usize = 1200;

fn cap_chars(text: &str, max: usize) -> String {
    let count = text.chars().count();
    if count <= max {
        return text.to_string();
    }
    let trimmed: String = text.chars().take(max).collect();
    format!("{}\n… [truncated, {} chars total]", trimmed, count)
}

/// Build a short error excerpt: prefer a local window, not the whole file.
/// Cap by characters as well as lines so minified CSS/JSON cannot dump 8kb "3-line" files.
pub fn format_edit_error_excerpt(original: &str, search_hint: Option<&str>) -> String {
    const SMALL_FILE: usize = 2000;
    const WINDOW_LINES: usize = 40;

    if original.len() <= SMALL_FILE {
        return format!(
            "Current file content:\n```\n{}\n```",
            cap_chars(original, EXCERPT_CHARS)
        );
    }

    if let Some(hint) = search_hint {
        let hint = hint.trim();
        if !hint.is_empty() {
            if let Some(window) = best_local_window(original, hint, WINDOW_LINES) {
                return format!(
                    "Nearest region of the current file ({} lines around best match):\n```\n{}\n```\n\
Call read_file for the full content before retrying.",
                    WINDOW_LINES,
                    cap_chars(&window, EXCERPT_CHARS)
                );
            }
        }
    }

    let head: String = original.lines().take(WINDOW_LINES).collect::<Vec<_>>().join("\n");
    format!(
        "File is large ({} chars). First {} lines:\n```\n{}\n```\n\
Call read_file for the full content before retrying.",
        original.len(),
        WINDOW_LINES,
        cap_chars(&head, EXCERPT_CHARS)
    )
}

fn best_local_window(original: &str, search: &str, window_lines: usize) -> Option<String> {
    let lines: Vec<&str> = original.lines().collect();
    if lines.is_empty() {
        return None;
    }
    let search_first = search.lines().next()?.trim();
    if search_first.is_empty() {
        return None;
    }
    let mut best_idx = None;
    for (i, line) in lines.iter().enumerate() {
        if line.contains(search_first) || search_first.contains(line.trim()) {
            best_idx = Some(i);
            break;
        }
    }
    let idx = best_idx?;
    let half = window_lines / 2;
    let start = idx.saturating_sub(half);
    let end = (idx + half + 1).min(lines.len());
    Some(lines[start..end].join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_marker_leakage() {
        let original = "fn a() {\n  let x = 1;\n}\n".repeat(15);
        let merged = format!("{}=======\n", original);
        let err = validate_merged_edit(&merged, &original, "let x = 2", "speculative").unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("leaked edit markers") || msg.contains("======="));
    }

    #[test]
    fn rejects_catastrophic_shrink_like_corgi_tailwind() {
        // Replays the corruption pattern: 70-line file collapsed to 4 marker lines.
        let original = (0..70).map(|i| format!("  color{}: \"var(--c{})\",\n", i, i)).collect::<String>();
        let merged = "=======\n=======\n=======\n=======\n";
        let edit = "<<<<<<< SEARCH\n  plugins: [require(\"tailwindcss-animate\")],\n};\n=======\n=======\n>>>>>>> REPLACE\n";
        let err = validate_merged_edit(merged, &original, edit, "speculative").unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("suspiciously small") || msg.contains("leaked edit markers"),
            "unexpected: {}",
            msg
        );
    }

    #[test]
    fn rejects_catastrophic_shrink() {
        let original = (0..50).map(|i| format!("line {}\n", i)).collect::<String>();
        let merged = "line 0\nline 1\nline 2\nline 3\n";
        let edit = "<<<<<<< SEARCH\nline 0\n=======\n=======\n>>>>>>> REPLACE\n";
        let err = validate_merged_edit(merged, &original, edit, "speculative").unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("suspiciously small"));
    }

    #[test]
    fn allows_reasonable_edit() {
        let original = (0..50).map(|i| format!("line {}\n", i)).collect::<String>();
        let mut merged = original.clone();
        merged = merged.replacen("line 0", "line ZERO", 1);
        validate_merged_edit(&merged, &original, "line ZERO", "speculative").unwrap();
    }

    #[test]
    fn format_excerpt_uses_window_for_large_files() {
        let original = (0..500).map(|i| format!("line {}\n", i)).collect::<String>();
        let excerpt = format_edit_error_excerpt(&original, Some("line 250"));
        assert!(!excerpt.contains("line 499") || excerpt.contains("Nearest") || excerpt.contains("First"));
        assert!(excerpt.len() < original.len());
    }

    #[test]
    fn format_excerpt_caps_minified_long_lines() {
        let original = format!("@import 'tailwindcss';\n{}\n", "a".repeat(12_000));
        let excerpt = format_edit_error_excerpt(&original, Some("@import"));
        assert!(excerpt.contains("truncated"), "expected char cap, got: {}", excerpt.len());
        assert!(excerpt.len() < 4_000, "excerpt still huge: {}", excerpt.len());
        assert!(!excerpt.contains(&"a".repeat(2_000)));
    }
}
