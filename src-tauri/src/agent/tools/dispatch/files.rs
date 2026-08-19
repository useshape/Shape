//! File read/write/edit tools (edit_file, apply_patch, create, delete, rename).

use serde_json::{json, Value};
use tauri::{Emitter, Manager};

use crate::agent::commands::{checkpoints, logging, streaming};
use crate::agent::models::PendingEdit;
use crate::agent::security;
use crate::agent::tools::files;

use super::common::{
    blocked_outcome, error_outcome, escape_xml_attr, escape_xml_text, get_str,
    is_read_only_mode, ApprovalDecision,
};
use super::{SideEffect, ToolCtx, ToolOutcome};

pub(super) fn tool_read_file(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let path = match get_str(args, "path") {
        Ok(s) => s,
        Err(e) => return error_outcome("read_file", &e),
    };
    let start = args.get("start_line").and_then(|v| v.as_u64()).map(|v| v as usize);
    let end = args.get("end_line").and_then(|v| v.as_u64()).map(|v| v as usize);

    let res = if let (Some(s), Some(e)) = (start, end) {
        files::read_file_range(&path, s, e, ctx.project_path)
    } else {
        files::read_file(&path, ctx.project_path)
    };

    match res {
        Ok(content) => {
            let display = if content.chars().count() > 30_000 {
                let head: String = content.chars().take(30_000).collect();
                format!(
                    "{}\n\n[truncated — file longer than 30,000 chars; call read_file again with start_line/end_line to see more]",
                    head
                )
            } else {
                content.clone()
            };
            ToolOutcome {
                tool_result: display,
                ui_chunk: cat_ui_chunk(&path, start, end),
                side_effect: Some(SideEffect::FileRead { path, content }),
            }
        }
        Err(e) => error_outcome("read_file", &e.to_string()),
    }
}

pub(super) fn cat_ui_chunk(path: &str, start: Option<usize>, end: Option<usize>) -> String {
    match (start, end) {
        (Some(s), Some(e)) => format!(
            "\n<cat path=\"{}\" start=\"{}\" end=\"{}\"></cat>\n",
            escape_xml_attr(path),
            s,
            e
        ),
        _ => format!("\n<cat>{}</cat>\n", path),
    }
}

pub(super) fn tool_list_dir(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let path = match get_str(args, "path") {
        Ok(s) => s,
        Err(e) => return error_outcome("list_dir", &e),
    };
    match files::list_files(&path, ctx.project_path) {
        Ok(out) => ToolOutcome {
            tool_result: out,
            ui_chunk: format!("\n<ls>{}</ls>\n", path),
            side_effect: None,
        },
        Err(e) => error_outcome("list_dir", &e.to_string()),
    }
}


pub(super) fn tool_create_directory(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("create_directory", "Directory creation is not allowed in Ask or Plan mode.");
    }
    let path = match get_str(args, "path") {
        Ok(s) => s,
        Err(e) => return error_outcome("create_directory", &e),
    };
    match files::create_dir(&path, ctx.project_path) {
        Ok(out) => {
            let _ = ctx.app_handle.emit("shape-file-edited", &path);
            ToolOutcome {
                tool_result: out,
                ui_chunk: format!("\n<mkdir>{}</mkdir>\n", path),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("create_directory", &e.to_string()),
    }
}

pub(super) async fn tool_create_file(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("create_file", "File creation is not allowed in Ask or Plan mode.");
    }
    let path = match get_str(args, "path") {
        Ok(s) => s,
        Err(e) => return error_outcome("create_file", &e),
    };
    let content = args
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut approved_edit_id: Option<String> = None;
    if ctx.agent_state.turn_policy().require_edit_approval {
        // Refuse duplicates before asking for approval — same check create_file
        // itself performs on write.
        if security::paths::resolve_safe_path(&path, ctx.project_path)
            .map(|p| p.exists())
            .unwrap_or(false)
        {
            return error_outcome(
                "create_file",
                &format!("File '{}' already exists — use edit_file to modify it.", path),
            );
        }
        let resolved = crate::agent::editing::ResolvedEdit {
            merged_content: content.clone(),
            original_content: String::new(),
            strategy: "new_file",
            original_lines: 0,
            merged_lines: content.lines().count(),
            is_new_file: true,
        };
        match gate_edit_approval(&path, &resolved, ctx).await {
            Ok(id) => approved_edit_id = Some(id),
            Err(outcome) => return outcome,
        }
    }

    match files::create_file(&path, &content, ctx.project_path) {
        Ok(_) => {
            let _ = ctx.app_handle.emit("shape-file-edited", &path);
            record_checkpoint(ctx, &path, None);
            let mut tool_result = format!("Created file {} ({} chars)", path, content.len());
            if approved_edit_id.is_some() {
                tool_result.push_str(" (approved by user)");
            }
            let syntax_errors = crate::agent::editing::syntax_check::check_syntax(&path, &content);
            if let Some(feedback) =
                crate::agent::editing::syntax_check::format_syntax_feedback(&path, &syntax_errors)
            {
                tool_result.push_str(&feedback);
            }
            let ui = match &approved_edit_id {
                Some(edit_id) => edit_pending_chunk(edit_id, &path, "applied", "", &content),
                None => format!("\n<create_file>{}</create_file>\n", path),
            };
            ToolOutcome {
                tool_result,
                ui_chunk: ui,
                side_effect: Some(SideEffect::FileWritten {
                    path,
                    content,
                }),
            }
        }
        Err(e) => error_outcome("create_file", &e.to_string()),
    }
}

/// Wait until the user approves/rejects a staged edit, or the turn is
/// cancelled. Same no-timeout contract as command approvals.
pub(super) async fn wait_for_edit_decision(edit_id: &str, ctx: &ToolCtx<'_>) -> ApprovalDecision {
    loop {
        if ctx.cancel.is_cancelled() {
            return ApprovalDecision::Cancelled;
        }
        if let Ok(mut decisions) = ctx.agent_state.edit_decisions.lock() {
            if let Some(approved) = decisions.remove(edit_id) {
                return if approved {
                    ApprovalDecision::Approved
                } else {
                    ApprovalDecision::Rejected
                };
            }
        }
        let still_pending = ctx
            .agent_state
            .pending_edits
            .lock()
            .map(|p| p.contains_key(edit_id))
            .unwrap_or(false);
        if !still_pending {
            if let Ok(mut decisions) = ctx.agent_state.edit_decisions.lock() {
                if let Some(approved) = decisions.remove(edit_id) {
                    return if approved {
                        ApprovalDecision::Approved
                    } else {
                        ApprovalDecision::Rejected
                    };
                }
            }
            return ApprovalDecision::Rejected;
        }
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }
}

pub(super) fn cleanup_pending_edit(edit_id: &str, ctx: &ToolCtx<'_>) {
    if let Ok(mut pendings) = ctx.agent_state.pending_edits.lock() {
        pendings.remove(edit_id);
    }
    if let Ok(mut decisions) = ctx.agent_state.edit_decisions.lock() {
        decisions.remove(edit_id);
    }
}

pub(super) fn edit_pending_chunk(
    edit_id: &str,
    path: &str,
    status: &str,
    original: &str,
    replacement: &str,
) -> String {
    format!(
        "\n<edit_pending id=\"{}\" file=\"{}\" status=\"{}\"><original>{}</original><replacement>{}</replacement></edit_pending>\n",
        escape_xml_attr(edit_id),
        escape_xml_attr(path),
        status,
        escape_xml_text(original),
        escape_xml_text(replacement),
    )
}

/// Stage a resolved edit for user approval. Returns `Ok(edit_id)` when approved
/// (caller writes the file) or `Err(outcome)` when rejected/cancelled.
pub(super) async fn gate_edit_approval(
    target: &str,
    resolved: &crate::agent::editing::ResolvedEdit,
    ctx: &ToolCtx<'_>,
) -> Result<String, ToolOutcome> {
    let edit_id = format!("edit-{}", uuid::Uuid::new_v4());
    let pending = PendingEdit {
        id: edit_id.clone(),
        path: target.to_string(),
        is_new_file: resolved.is_new_file,
    };
    if let Ok(mut pendings) = ctx.agent_state.pending_edits.lock() {
        pendings.insert(edit_id.clone(), pending.clone());
    }

    ctx.emit_ui_token(edit_pending_chunk(
        &edit_id,
        target,
        "pending",
        &resolved.original_content,
        &resolved.merged_content,
    ));
    let _ = ctx.app_handle.emit("agent-edit-pending", &pending);
    streaming::emit_chat_status(
        ctx.app_handle,
        json!({ "phase": "approval", "label": "Waiting for edit approval" }),
    );

    let decision = wait_for_edit_decision(&edit_id, ctx).await;
    cleanup_pending_edit(&edit_id, ctx);

    // Final state chunks are returned through the ToolOutcome (persisted into
    // the transcript by the turn loop); only the transient "pending" card goes
    // through the live-only token channel above.
    match decision {
        ApprovalDecision::Approved => {
            let _ = ctx.app_handle.emit(
                "agent-edit-resolved",
                json!({ "id": edit_id, "approved": true }),
            );
            Ok(edit_id)
        }
        ApprovalDecision::Rejected => {
            let _ = ctx.app_handle.emit(
                "agent-edit-resolved",
                json!({ "id": edit_id, "approved": false }),
            );
            Err(ToolOutcome {
                tool_result: format!(
                    "The user rejected this edit to '{}'. The file was NOT changed. Do NOT retry the same edit. Continue without it, or ask the user how to proceed.",
                    target
                ),
                ui_chunk: edit_pending_chunk(
                    &edit_id,
                    target,
                    "rejected",
                    &resolved.original_content,
                    &resolved.merged_content,
                ),
                side_effect: None,
            })
        }
        ApprovalDecision::Cancelled => Err(ToolOutcome {
            tool_result: "Turn was cancelled while waiting for edit approval.".to_string(),
            ui_chunk: edit_pending_chunk(
                &edit_id,
                target,
                "cancelled",
                &resolved.original_content,
                &resolved.merged_content,
            ),
            side_effect: None,
        }),
    }
}

/// Snapshot a file's pre-edit state the first time this turn touches it, and
/// persist it immediately so a crash mid-turn does not lose the checkpoint.
pub(super) fn record_checkpoint(ctx: &ToolCtx<'_>, path: &str, original_content: Option<String>) {
    let message_index = ctx.agent_state.current_turn_index();
    ctx.agent_state.record_file_checkpoint(message_index, path, original_content);
    if let Some(conv_id) = ctx.conversation_id.as_deref().filter(|s| !s.is_empty()) {
        checkpoints::save_checkpoints(conv_id, &ctx.agent_state.file_checkpoints_snapshot());
    }
}

pub(super) async fn tool_edit_file(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("edit_file", "File edits are not allowed in Ask or Plan mode.");
    }
    let target = match get_str(args, "target_file") {
        Ok(s) => s,
        Err(e) => return error_outcome("edit_file", &e),
    };
    let instructions = args
        .get("instructions")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let code_edit = args
        .get("code_edit")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if code_edit.trim().is_empty() {
        return error_outcome("edit_file", "`code_edit` is required and must not be empty.");
    }

    if let Err(e) = security::paths::validate_write_path(&target, ctx.project_path) {
        return error_outcome("edit_file", &format!("Security: cannot edit '{}': {}", target, e));
    }

    let abs_path = match security::paths::resolve_safe_path(&target, ctx.project_path) {
        Ok(p) => p.to_string_lossy().into_owned(),
        Err(e) => return error_outcome("edit_file", &format!("Cannot resolve '{}': {}", target, e)),
    };

    // Resolve (merge) first without touching disk — the approval flow shows the
    // result to the user before anything is written.
    let resolved = match crate::agent::editing::resolve_edit(
        &abs_path,
        &instructions,
        &code_edit,
        ctx.client,
        ctx.api_key,
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            logging::error("dispatch", &format!("edit_file failed for {}: {}", target, e));
            return error_outcome("edit_file", &e.to_string());
        }
    };

    let mut approved_edit_id: Option<String> = None;
    if ctx.agent_state.turn_policy().require_edit_approval {
        match gate_edit_approval(&target, &resolved, ctx).await {
            Ok(id) => approved_edit_id = Some(id),
            Err(outcome) => return outcome,
        }
    }

    if let Err(e) =
        crate::agent::editing::write_resolved_edit(ctx.app_handle, &abs_path, &resolved).await
    {
        logging::error("dispatch", &format!("edit_file write failed for {}: {}", target, e));
        return error_outcome("edit_file", &e.to_string());
    }

    let _ = ctx.app_handle.emit("shape-file-edited", &abs_path);
    record_checkpoint(
        ctx,
        &target,
        if resolved.is_new_file {
            None
        } else {
            Some(resolved.original_content.clone())
        },
    );
    // Gated edits keep their edit_pending identity (status flips to applied);
    // ungated edits use the classic <edit> chunk.
    let ui = match &approved_edit_id {
        Some(edit_id) => edit_pending_chunk(
            edit_id,
            &target,
            "applied",
            &resolved.original_content,
            &resolved.merged_content,
        ),
        None => format!(
            "\n<edit file=\"{}\"><original>{}</original><replacement>{}</replacement></edit>\n",
            escape_xml_attr(&target),
            escape_xml_text(&resolved.original_content),
            escape_xml_text(&resolved.merged_content),
        ),
    };
    let mut tool_result = format!(
        "Edit applied to {} via {} strategy ({} -> {} lines).",
        target, resolved.strategy, resolved.original_lines, resolved.merged_lines
    );
    if approved_edit_id.is_some() {
        tool_result.push_str(" (approved by user)");
    }
    let syntax_errors =
        crate::agent::editing::syntax_check::check_syntax(&target, &resolved.merged_content);
    if let Some(feedback) =
        crate::agent::editing::syntax_check::format_syntax_feedback(&target, &syntax_errors)
    {
        tool_result.push_str(&feedback);
    }
    append_lint_feedback(ctx, &target, &mut tool_result);
    ToolOutcome {
        tool_result,
        ui_chunk: ui,
        side_effect: Some(SideEffect::FileWritten {
            path: target,
            content: resolved.merged_content,
        }),
    }
}

pub(super) fn append_lint_feedback(ctx: &ToolCtx<'_>, path: &str, tool_result: &mut String) {
    let Some(app_state) = ctx.app_handle.try_state::<crate::app_state::AppState>() else {
        return;
    };
    let Ok(state) = app_state.0.lock() else {
        return;
    };
    // Match by exact path or suffix (Monaco may use absolute or relative keys).
    let diags = state
        .diagnostics
        .iter()
        .find(|(k, _)| paths_match_diag(k, path))
        .map(|(_, v)| v.clone());
    let Some(diags) = diags else {
        return;
    };
    if diags.is_empty() {
        return;
    }
    tool_result.push_str("\n\nLINTER DIAGNOSTICS (from IDE; call read_lints for a refresh):\n");
    for d in diags.iter().take(12) {
        tool_result.push_str(&format!(
            "- [{}] L{}: {}\n",
            d.severity, d.line, d.message
        ));
    }
}

pub(super) fn paths_match_diag(stored: &str, query: &str) -> bool {
    if stored == query {
        return true;
    }
    let a = stored.replace('\\', "/");
    let b = query.replace('\\', "/");
    a == b || a.ends_with(&b) || b.ends_with(&a)
}

pub(super) fn tool_read_lints(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let paths: Vec<String> = args
        .get("paths")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let Some(app_state) = ctx.app_handle.try_state::<crate::app_state::AppState>() else {
        return error_outcome("read_lints", "App state unavailable.");
    };
    let Ok(state) = app_state.0.lock() else {
        return error_outcome("read_lints", "Could not lock app state.");
    };

    let mut lines: Vec<String> = Vec::new();
    if paths.is_empty() {
        for (path, diags) in state.diagnostics.iter().take(20) {
            for d in diags.iter().take(8) {
                lines.push(format!(
                    "{}: [{}] L{}:C{} {}",
                    path, d.severity, d.line, d.column, d.message
                ));
            }
        }
    } else {
        for path in &paths {
            let diags = state
                .diagnostics
                .iter()
                .find(|(k, _)| paths_match_diag(k, path))
                .map(|(_, v)| v.as_slice())
                .unwrap_or(&[]);
            if diags.is_empty() {
                lines.push(format!("{}: (no diagnostics)", path));
            } else {
                for d in diags.iter().take(20) {
                    lines.push(format!(
                        "{}: [{}] L{}:C{} {}",
                        path, d.severity, d.line, d.column, d.message
                    ));
                }
            }
        }
    }

    let body = if lines.is_empty() {
        "No linter diagnostics available for the requested files (IDE may not have reported any yet)."
            .to_string()
    } else {
        lines.join("\n")
    };

    ToolOutcome {
        tool_result: body.clone(),
        ui_chunk: format!("\n<tool_result>\n[read_lints]\n{}\n</tool_result>\n", body),
        side_effect: None,
    }
}

pub(super) async fn tool_apply_patch(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("apply_patch", "File edits are not allowed in Ask or Plan mode.");
    }
    let input = match get_str(args, "input") {
        Ok(s) => s,
        Err(e) => return error_outcome("apply_patch", &e),
    };
    if input.trim().is_empty() {
        return error_outcome("apply_patch", "`input` is required and must not be empty.");
    }
    if ctx.project_path.is_empty() {
        return error_outcome("apply_patch", "No project open.");
    }
    let root = std::path::Path::new(ctx.project_path);
    let changes = match crate::agent::editing::apply_patch::resolve_patch(&input, root) {
        Ok(c) => c,
        Err(e) => return error_outcome("apply_patch", &e.message),
    };

    let mut summaries = Vec::new();
    let mut ui_chunks = String::new();
    let mut written: Vec<(String, String)> = Vec::new();

    for change in changes {
        if let Err(e) = security::paths::validate_write_path(&change.path, ctx.project_path) {
            return error_outcome(
                "apply_patch",
                &format!("Security: cannot write '{}': {}", change.path, e),
            );
        }
        let abs_path = match security::paths::resolve_safe_path(&change.path, ctx.project_path) {
            Ok(p) => p.to_string_lossy().into_owned(),
            Err(e) => {
                return error_outcome(
                    "apply_patch",
                    &format!("Cannot resolve '{}': {}", change.path, e),
                );
            }
        };

        if change.is_delete {
            let original = change.original.clone().unwrap_or_default();
            match files::delete_file(&change.path, ctx.project_path) {
                Ok(_) => {
                    let _ = ctx.app_handle.emit("shape-file-edited", &change.path);
                    record_checkpoint(ctx, &change.path, Some(original));
                    summaries.push(format!("Deleted {}", change.path));
                    ui_chunks.push_str(&format!("\n<delete_file>{}</delete_file>\n", change.path));
                }
                Err(e) => return error_outcome("apply_patch", &e.to_string()),
            }
            continue;
        }

        let original = change.original.clone().unwrap_or_default();
        if let Err(e) = crate::agent::editing::sanity::validate_merged_edit(
            &change.merged,
            &original,
            &input,
            "apply_patch",
        ) {
            return error_outcome("apply_patch", &e.to_string());
        }

        let resolved = crate::agent::editing::ResolvedEdit {
            merged_content: change.merged.clone(),
            original_content: original.clone(),
            strategy: "apply_patch",
            original_lines: original.lines().count(),
            merged_lines: change.merged.lines().count(),
            is_new_file: change.is_new_file,
        };

        let mut approved_edit_id: Option<String> = None;
        if ctx.agent_state.turn_policy().require_edit_approval {
            match gate_edit_approval(&change.path, &resolved, ctx).await {
                Ok(id) => approved_edit_id = Some(id),
                Err(outcome) => return outcome,
            }
        }

        if change.is_new_file {
            if let Err(e) = files::create_file(&change.path, &change.merged, ctx.project_path) {
                return error_outcome("apply_patch", &e.to_string());
            }
        } else if let Err(e) =
            crate::agent::editing::write_resolved_edit(ctx.app_handle, &abs_path, &resolved).await
        {
            return error_outcome("apply_patch", &e.to_string());
        }

        let _ = ctx.app_handle.emit("shape-file-edited", &change.path);
        record_checkpoint(
            ctx,
            &change.path,
            if change.is_new_file {
                None
            } else {
                Some(original)
            },
        );

        let mut line = format!(
            "Patched {} ({} -> {} lines)",
            change.path, resolved.original_lines, resolved.merged_lines
        );
        if approved_edit_id.is_some() {
            line.push_str(" (approved)");
        }
        let syntax_errors =
            crate::agent::editing::syntax_check::check_syntax(&change.path, &change.merged);
        if let Some(feedback) = crate::agent::editing::syntax_check::format_syntax_feedback(
            &change.path,
            &syntax_errors,
        ) {
            line.push_str(&feedback);
        }
        append_lint_feedback(ctx, &change.path, &mut line);
        summaries.push(line);

        ui_chunks.push_str(&match &approved_edit_id {
            Some(edit_id) => edit_pending_chunk(
                edit_id,
                &change.path,
                "applied",
                &resolved.original_content,
                &resolved.merged_content,
            ),
            None => format!(
                "\n<edit file=\"{}\"><original>{}</original><replacement>{}</replacement></edit>\n",
                escape_xml_attr(&change.path),
                escape_xml_text(&resolved.original_content),
                escape_xml_text(&resolved.merged_content),
            ),
        });
        written.push((change.path, change.merged));
    }

    let tool_result = summaries.join("\n");
    let side_effect = if written.len() == 1 {
        let (path, content) = written.into_iter().next().unwrap();
        Some(SideEffect::FileWritten { path, content })
    } else if !written.is_empty() {
        Some(SideEffect::FilesWritten { files: written })
    } else {
        None
    };

    ToolOutcome {
        tool_result,
        ui_chunk: ui_chunks,
        side_effect,
    }
}

pub(super) fn tool_delete_file(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("delete_file", "File deletion is not allowed in Ask or Plan mode.");
    }
    let path = match get_str(args, "path") {
        Ok(s) => s,
        Err(e) => return error_outcome("delete_file", &e),
    };
    // Capture pre-delete content so a checkpoint restore can recreate the file.
    let original_content = security::paths::resolve_safe_path(&path, ctx.project_path)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok());
    match files::delete_file(&path, ctx.project_path) {
        Ok(out) => {
            let _ = ctx.app_handle.emit("shape-file-edited", &path);
            record_checkpoint(ctx, &path, original_content);
            ToolOutcome {
                tool_result: out,
                ui_chunk: format!("\n<delete_file>{}</delete_file>\n", path),
                side_effect: Some(SideEffect::FileDeleted { path }),
            }
        }
        Err(e) => error_outcome("delete_file", &e.to_string()),
    }
}

pub(super) fn tool_rename_file(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("rename_file", "File renaming is not allowed in Ask or Plan mode.");
    }
    let old_path = match get_str(args, "old_path") {
        Ok(s) => s,
        Err(e) => return error_outcome("rename_file", &e),
    };
    let new_path = match get_str(args, "new_path") {
        Ok(s) => s,
        Err(e) => return error_outcome("rename_file", &e),
    };
    match files::rename_file(&old_path, &new_path, ctx.project_path) {
        Ok(out) => {
            let _ = ctx.app_handle.emit("shape-file-edited", &old_path);
            let _ = ctx.app_handle.emit("shape-file-edited", &new_path);
            ToolOutcome {
                tool_result: out,
                ui_chunk: format!("\n<rename_file>{} -> {}</rename_file>\n", old_path, new_path),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("rename_file", &e.to_string()),
    }
}
