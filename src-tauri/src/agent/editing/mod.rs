/// File editing for the agent.
///
/// `apply_edit` is the single entry point. It takes a Cursor-style speculative edit
/// (`code_edit` with `// ... existing code ...` markers + a one-line `instructions`
/// hint) and produces the merged file content. Strategy:
///
///   1. Try the deterministic marker resolver in [`speculative`].
///   2. If that returns None (ambiguous, no markers, no anchors), fall back to a
///      fast-apply LLM call in [`apply`].
///   3. If both fail, return a loud error carrying the *current* file contents so the
///      agent model can correct itself on the next turn.
///
/// New files take a separate path: they're written directly from `code_edit` (which is
/// treated as the full content), bypassing the resolver entirely.
///
/// The old `apply_fuzzy_edit` is gone, along with its 80%-overwrite heuristic and
/// whitespace/alphanumeric sliding-window matcher — both silently masked stale-state
/// edits and were the root cause of corrupted files in the agent's trace log.

pub mod apply;
pub mod apply_patch;
pub mod sanity;
pub mod speculative;
pub mod syntax_check;

use reqwest::Client;

use crate::core::error::AppError;
use super::commands::logging;

/// A merged edit that has NOT been written to disk yet. Produced by
/// [`resolve_edit`]; written by [`write_resolved_edit`] (or discarded when the
/// user rejects it in the edit-approval flow).
pub struct ResolvedEdit {
    pub merged_content: String,
    pub original_content: String,
    pub strategy: &'static str,
    pub original_lines: usize,
    pub merged_lines: usize,
    pub is_new_file: bool,
}

/// Write a previously resolved edit to disk.
pub async fn write_resolved_edit(
    app: &tauri::AppHandle,
    path: &str,
    resolved: &ResolvedEdit,
) -> Result<(), AppError> {
    save(app, path, &resolved.merged_content).await
}

fn finish_resolved(
    merged: String,
    original: String,
    code_edit: &str,
    strategy: &'static str,
) -> Result<ResolvedEdit, AppError> {
    sanity::validate_merged_edit(&merged, &original, code_edit, strategy)?;
    let original_lines = original.lines().count();
    let merged_lines = merged.lines().count();
    Ok(ResolvedEdit {
        merged_content: merged,
        original_content: original,
        strategy,
        original_lines,
        merged_lines,
        is_new_file: false,
    })
}

fn edit_error_with_excerpt(path: &str, reason: &str, original: &str, code_edit: &str) -> AppError {
    let search_hint = extract_first_search_body(code_edit);
    let excerpt = sanity::format_edit_error_excerpt(original, search_hint.as_deref());
    let conflict_hint = if has_git_merge_conflict_markers(original) {
        "\n\nThis file contains git merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`). \
Remove all conflict markers and use `edit_file` with the entire corrected file as `code_edit` \
(no SEARCH/REPLACE blocks), or include the full conflict region in one unique SEARCH block."
    } else {
        ""
    };
    AppError::Message(format!(
        "Could not apply the edit to {}. Reason: {}.{}{}\n\n{}",
        path, reason, conflict_hint, "", excerpt
    ))
}

fn extract_first_search_body(code_edit: &str) -> Option<String> {
    let lines: Vec<&str> = code_edit.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        if lines[i].starts_with("<<<<<<< SEARCH") {
            i += 1;
            let mut body = Vec::new();
            while i < lines.len() && !lines[i].starts_with("=======") {
                body.push(lines[i]);
                i += 1;
            }
            return Some(body.join("\n"));
        }
        i += 1;
    }
    None
}

/// Compute the merged content for an edit WITHOUT touching the disk.
///
/// This is the shared front half of the edit pipeline: the normal path writes
/// the result immediately, while the edit-approval path shows it to the user
/// first and only writes on approval.
pub async fn resolve_edit(
    path: &str,
    instructions: &str,
    code_edit: &str,
    client: &Client,
    api_key: &str,
) -> Result<ResolvedEdit, AppError> {
    let code_edit = code_edit.replace("\r\n", "\n");
    let is_new_file = !std::path::Path::new(path).exists();

    logging::info(
        "editing",
        &format!(
            "resolve_edit: path={}, is_new={}, edit_len={}",
            path,
            is_new_file,
            code_edit.len()
        ),
    );

    if is_new_file {
        if code_edit.trim().is_empty() {
            return Err(AppError::Message(
                "Refusing to create an empty new file. Provide content in `code_edit`."
                    .to_string(),
            ));
        }
        let lines = code_edit.lines().count();
        return Ok(ResolvedEdit {
            merged_content: code_edit,
            original_content: String::new(),
            strategy: "new_file",
            original_lines: 0,
            merged_lines: lines,
            is_new_file: true,
        });
    }

    let original = tokio::fs::read_to_string(path)
        .await
        .map_err(|e| {
            logging::error("editing", &format!("Failed to read {}: {}", path, e));
            AppError::Io(e)
        })?
        .replace("\r\n", "\n");

    if has_git_merge_conflict_markers(&original) && !code_edit.contains("<<<<<<< SEARCH") {
        if !code_edit.trim().is_empty() && !code_edit.lines().any(speculative::is_marker_line_pub) {
            logging::info(
                "editing",
                &format!(
                    "merge conflict detected; using direct full-file replacement ({} -> {} lines)",
                    original.lines().count(),
                    code_edit.lines().count()
                ),
            );
            return finish_resolved(
                code_edit.clone(),
                original,
                &code_edit,
                "merge_conflict_full_file",
            );
        }
    }

    if code_edit.trim().is_empty() {
        return Err(AppError::Message(
            "Refusing to apply an empty edit. If you meant to delete the file, use `delete_file`."
                .to_string(),
        ));
    }

    let original_lines = original.lines().count();

    // 1) Deterministic resolver first — no LLM cost, no nondeterminism.
    match speculative::resolve(&original, &code_edit) {
        Ok(merged) => {
            logging::info(
                "editing",
                &format!(
                    "speculative resolver succeeded ({} -> {} lines)",
                    original_lines,
                    merged.lines().count()
                ),
            );
            return finish_resolved(merged, original, &code_edit, "speculative");
        }
        Err(e) => {
            if !e.contains("No `<<<<<<< SEARCH` blocks found") {
                logging::warn("editing", &format!("speculative resolver failed: {}", e));
                return Err(edit_error_with_excerpt(path, &e, &original, &code_edit));
            }
        }
    }

    // 2) Robust full-file replacement path.
    if looks_like_full_file_replacement(&original, &code_edit) {
        logging::info(
            "editing",
            &format!(
                "using direct full-file replacement ({} -> {} lines)",
                original_lines,
                code_edit.lines().count()
            ),
        );
        return finish_resolved(code_edit.clone(), original, &code_edit, "full_file");
    }

    // 3) Fast-apply LLM fallback.
    logging::info("editing", "speculative resolver declined, falling back to fast-apply");
    match apply::fast_apply(client, api_key, &original, &code_edit, instructions).await {
        Ok(merged) => finish_resolved(merged, original, &code_edit, "fast_apply"),
        Err(e) => {
            logging::error("editing", &format!("fast-apply failed: {}", e));
            Err(edit_error_with_excerpt(
                path,
                &e.to_string(),
                &original,
                &code_edit,
            ))
        }
    }
}

fn has_git_merge_conflict_markers(content: &str) -> bool {
    content.lines().any(|line| {
        (line.starts_with("<<<<<<<") && !line.starts_with("<<<<<<< SEARCH"))
            || (line.starts_with(">>>>>>>") && !line.starts_with(">>>>>>> REPLACE"))
    })
}

fn looks_like_full_file_replacement(original: &str, candidate: &str) -> bool {
    if candidate.lines().any(speculative::is_marker_line_pub) {
        return false;
    }

    let original_lines = original.lines().count();
    let candidate_lines = candidate.lines().count();
    if candidate.trim().is_empty() {
        return false;
    }

    // Very small files are often easier to rewrite fully, and a 1-line replacement can
    // still be valid for a 1-line file.
    if original_lines <= 5 {
        return candidate_lines >= 1;
    }

    let line_ratio = candidate_lines as f64 / original_lines.max(1) as f64;
    let char_ratio = candidate.len() as f64 / original.len().max(1) as f64;

    line_ratio >= 0.5 && char_ratio >= 0.35
}

async fn save(app: &tauri::AppHandle, path: &str, content: &str) -> Result<(), AppError> {
    if let Some(parent) = std::path::Path::new(path).parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    logging::info(
        "editing",
        &format!("Saving file: {} ({} chars)", path, content.len()),
    );
    crate::domain::filesystem::service::save_file(
        app.clone(),
        path.to_string(),
        content.to_string(),
    )
    .await
}
