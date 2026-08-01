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
pub mod speculative;
pub mod syntax_check;

use reqwest::Client;

use crate::core::error::AppError;
use super::commands::logging;

/// Outcome of a successful edit, returned to the agent's tool_result.
pub struct EditOutcome {
    pub merged_content: String,
    pub strategy: &'static str,
    pub original_lines: usize,
    pub merged_lines: usize,
}

/// Apply a speculative edit to a file.
///
/// `path` must be the absolute, already-security-validated path. `code_edit` is the
/// model's edit (possibly with `// ... existing code ...` markers). `instructions` is
/// a one-line human-readable hint used by the fast-apply LLM.
///
/// Returns Ok(EditOutcome) on success (file saved). On failure, the error message
/// includes the current file contents so the model can read its mistake and retry.
pub async fn apply_edit(
    path: String,
    instructions: String,
    code_edit: String,
    app: tauri::AppHandle,
    client: &Client,
    api_key: &str,
) -> Result<EditOutcome, AppError> {
    let code_edit = code_edit.replace("\r\n", "\n");
    let is_new_file = !std::path::Path::new(&path).exists();

    logging::info(
        "editing",
        &format!(
            "apply_edit: path={}, is_new={}, edit_len={}",
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
        save(&app, &path, &code_edit).await?;
        let lines = code_edit.lines().count();
        return Ok(EditOutcome {
            merged_content: code_edit,
            strategy: "new_file",
            original_lines: 0,
            merged_lines: lines,
        });
    }

    let original = tokio::fs::read_to_string(&path)
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
                    "merge conflict detected; applying direct full-file replacement ({} -> {} lines)",
                    original.lines().count(),
                    code_edit.lines().count()
                ),
            );
            save(&app, &path, &code_edit).await?;
            let merged_lines = code_edit.lines().count();
            return Ok(EditOutcome {
                merged_content: code_edit,
                strategy: "merge_conflict_full_file",
                original_lines: original.lines().count(),
                merged_lines,
            });
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
            save(&app, &path, &merged).await?;
            let merged_lines = merged.lines().count();
            return Ok(EditOutcome {
                merged_content: merged,
                strategy: "speculative",
                original_lines,
                merged_lines,
            });
        }
        Err(e) => {
            if !e.contains("No `<<<<<<< SEARCH` blocks found") {
                logging::warn("editing", &format!("speculative resolver failed: {}", e));
                let conflict_hint = if has_git_merge_conflict_markers(&original) {
                    "\n\nThis file contains git merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`). \
Remove all conflict markers and use `edit_file` with the entire corrected file as `code_edit` \
(no SEARCH/REPLACE blocks), or include the full conflict region in one unique SEARCH block."
                } else {
                    ""
                };
                return Err(AppError::Message(format!(
                    "Could not apply the edit to {}. Reason: {}.{}\n\nCurrent file content (so you can correct your next attempt):\n```\n{}\n```",
                    path,
                    e,
                    conflict_hint,
                    truncate_for_error(&original)
                )));
            }
        }
    }

    // 2) Robust full-file replacement path.
    //
    // Some tool-capable models ignore the marker instruction and send an entire file as
    // `code_edit`. That should not require an extra LLM call and must not fail just
    // because the speculative resolver declined. Treat it as a full replacement only
    // when the edit is plausibly a whole file (roughly same size/line count as the
    // original) and contains no ellipsis markers.
    if looks_like_full_file_replacement(&original, &code_edit) {
        logging::info(
            "editing",
            &format!(
                "using direct full-file replacement ({} -> {} lines)",
                original_lines,
                code_edit.lines().count()
            ),
        );
        save(&app, &path, &code_edit).await?;
        let merged_lines = code_edit.lines().count();
        return Ok(EditOutcome {
            merged_content: code_edit,
            strategy: "full_file",
            original_lines,
            merged_lines,
        });
    }

    // 3) Fast-apply LLM fallback.
    logging::info("editing", "speculative resolver declined, falling back to fast-apply");
    match apply::fast_apply(client, api_key, &original, &code_edit, &instructions).await {
        Ok(merged) => {
            save(&app, &path, &merged).await?;
            let merged_lines = merged.lines().count();
            Ok(EditOutcome {
                merged_content: merged,
                strategy: "fast_apply",
                original_lines,
                merged_lines,
            })
        }
        Err(e) => {
            logging::error("editing", &format!("fast-apply failed: {}", e));
            Err(AppError::Message(format!(
                "Could not apply the edit to {}. Reason: {}.\n\nCurrent file content (so you can correct your next attempt):\n```\n{}\n```",
                path,
                e,
                truncate_for_error(&original)
            )))
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

fn truncate_for_error(text: &str) -> String {
    const LIMIT: usize = 6000;
    if text.len() <= LIMIT {
        return text.to_string();
    }
    let cut: String = text.chars().take(LIMIT).collect();
    format!("{}\n... [file truncated for error message — {} chars total]", cut, text.len())
}
