//! Stop turn, apply edit, terminal/edit approvals.
use super::history;
use super::journals;
use super::logging;
use crate::agent::models::AgentState;
use crate::app_state::AppState;
use crate::commands::preview_render::PreviewCaptureState;
use crate::core::error::AppError;
use tauri::{Emitter, Manager};

#[tauri::command]
pub async fn stop_chat_message(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentState>,
    pty_state: tauri::State<'_, crate::commands::pty::PtyState>,
) -> Result<(), AppError> {
    let already_cancelled = {
        let token = state
            .cancellation_token
            .lock()
            .map_err(|e| AppError::Poison(e.to_string()))?;
        token.is_cancelled()
    };
    let generating = state.generation_state().is_generating;
    if !generating {
        // Idle / launch remounts used to call stop and still abort captures +
        // kill PTYs below, which tore down WebView2 frames and reloaded the UI.
        return Ok(());
    }
    if already_cancelled {
        logging::debug("chat", "Stop ignored — generation already stopping");
        return Ok(());
    }

    logging::info("chat", "Stop requested by user");
    // Cancel first so waiters observe Stop instead of a fake Reject (which
    // used to look like accepted edits were undone).
    state
        .cancellation_token
        .lock()
        .map_err(|e| AppError::Poison(e.to_string()))?
        .cancel();
    state.dismiss_unresolved_approvals();

    // Unlock the UI immediately — title gen / long HTTP must not leave the
    // sidebar spinning until the upstream request finishes.
    let aborted = {
        let turn_id = state.in_flight_turn_id();
        let conv_id = state
            .in_flight_conversation_id()
            .or_else(|| state.current_conversation_id.lock().ok().and_then(|g| g.clone()));
        let project_path = state.current_project.lock().ok().and_then(|p| p.clone());
        if let Some(ref project) = project_path {
            crate::commands::stats::bump_event(project, "chat_stops");
        }
        if let (Some(turn_id), Some(conv_id)) = (turn_id.clone(), conv_id.clone()) {
            journals::save_turn_journal(&journals::TurnJournal {
                conversation_id: conv_id.clone(),
                turn_id: turn_id.clone(),
                project_path,
                status: "interrupted".to_string(),
                updated_at: history::now_f64(),
                subagent_ids: Vec::new(),
                note: Some("Stopped by user".to_string()),
            });
        }
        turn_id.zip(conv_id)
    };
    // Commit streamed assistant text into history *before* clearing in-flight.
    // Otherwise Stop + frontend history resync wipes the bubble the user saw.
    if let Ok(merged) = state.history_for_persistence() {
        if let Ok(mut hist) = state.history.lock() {
            *hist = merged;
        }
    }
    if let Some(path) = state.current_project.lock().ok().and_then(|p| p.clone()) {
        let _ = history::save_current_conversation(&state, &path);
    }
    state.clear_in_flight();
    if let Some((turn_id, conv_id)) = aborted {
        let _ = app.emit(
            "chat_complete",
            serde_json::json!({
                "turnId": turn_id,
                "conversationId": conv_id,
                "error": "Cancelled",
            }),
        );
    }

    // Abort any in-flight design-preview capture and give the frontend
    // capture host a moment to tear down its offscreen iframe *before* we
    // kill the PTY. Doing this concurrently raced WebView2 teardown against
    // process teardown and surfaced as "invalid window handle" on Windows.
    app.state::<PreviewCaptureState>()
        .abort_and_drain(&app, "Preview capture cancelled")
        .await;

    state.kill_active_terminal(&pty_state).await;
    Ok(())
}

#[tauri::command]
pub async fn apply_file_edit(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
    original: String,
    replacement: String,
) -> Result<(), AppError> {
    logging::info("edit", &format!("Manual apply_file_edit: path={}", path));
    let proj_path = state.0.lock()?.project_path.clone().unwrap_or_default();
    let abs_path = if std::path::Path::new(&path).is_absolute() {
        path.clone()
    } else {
        std::path::Path::new(&proj_path)
            .join(&path)
            .to_string_lossy()
            .into_owned()
    };
    if !proj_path.is_empty() {
        crate::agent::security::paths::resolve_safe_path(&path, &proj_path)?;
    } else {
        crate::agent::security::paths::assert_ipc_path_allowed(&abs_path)?;
    }

    // For manual edits from the UI we use a deterministic full-overwrite path: if the
    // caller provided an `original` block we honour it (search-and-replace), otherwise
    // we treat `replacement` as the full new content. No LLM round-trip needed.
    let current = tokio::fs::read_to_string(&abs_path).await.unwrap_or_default();
    let new_content = if original.trim().is_empty() {
        replacement
    } else {
        current.replacen(&original, &replacement, 1)
    };

    if let Some(parent) = std::path::Path::new(&abs_path).parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    crate::domain::filesystem::service::save_file(
        app.clone(),
        abs_path.clone(),
        new_content,
    )
    .await?;
    let _ = app.emit("shape-file-edited", abs_path);
    Ok(())
}

/// Record the user's approval. Execution happens inside the agent turn's
/// waiting tool call (same session engine, streaming, and cancel token as
/// auto-approved commands). The old design executed the command *here* and the
/// tool-side waiter timed out after 120s — a slow approval plus a slow command
/// told the model "rejected, do NOT retry" while the command actually ran.
#[tauri::command]
pub fn approve_terminal_command(
    id: String,
    state: tauri::State<'_, AgentState>,
) -> Result<String, AppError> {
    logging::info("terminal", &format!("Command approved: {}", id));
    if !state.pending_commands.lock()?.contains_key(&id) {
        return Err(AppError::Message(
            "Command not found or already processed".to_string(),
        ));
    }
    state.command_decisions.lock()?.insert(id, true);
    Ok("approved".to_string())
}

#[tauri::command]
pub fn reject_terminal_command(
    id: String,
    state: tauri::State<'_, AgentState>,
) -> Result<(), AppError> {
    logging::info("terminal", &format!("Command rejected: {}", id));
    state.command_decisions.lock()?.insert(id.clone(), false);
    state.pending_commands.lock()?.remove(&id);
    Ok(())
}

/// Approve or reject a staged file edit (edit-approval mode). The waiting
/// `edit_file` / `create_file` tool call writes the file on approval.
#[tauri::command]
pub fn resolve_edit_approval(
    id: String,
    approved: bool,
    state: tauri::State<'_, AgentState>,
) -> Result<(), AppError> {
    logging::info(
        "editing",
        &format!("Edit {}: {}", if approved { "approved" } else { "rejected" }, id),
    );
    if !state.pending_edits.lock()?.contains_key(&id) {
        return Err(AppError::Message(
            "Edit not found or already processed".to_string(),
        ));
    }
    state.edit_decisions.lock()?.insert(id.clone(), approved);
    if !approved {
        state.pending_edits.lock()?.remove(&id);
    }
    Ok(())
}

/// Record the user's click-through answers for a pending `ask_user` tool call.
#[tauri::command]
pub fn answer_ask_user(
    id: String,
    answers: String,
    skipped: Option<bool>,
    state: tauri::State<'_, AgentState>,
) -> Result<(), AppError> {
    if !state.pending_asks.lock()?.contains_key(&id) {
        return Err(AppError::Message(
            "Question set not found or already answered".to_string(),
        ));
    }
    let payload = if skipped.unwrap_or(false) {
        "__skipped__".to_string()
    } else {
        answers
    };
    state.ask_answers.lock()?.insert(id, payload);
    Ok(())
}

/// Record the chosen concept for a pending `render_design_previews` gallery.
#[tauri::command]
pub fn select_design_preview(
    id: String,
    concept_id: Option<String>,
    skipped: Option<bool>,
    tweaks: Option<String>,
    state: tauri::State<'_, AgentState>,
) -> Result<(), AppError> {
    let pending = state.pending_design_picks.lock()?;
    let Some(pick) = pending.get(&id) else {
        return Err(AppError::Message(
            "Design preview not found or already chosen".to_string(),
        ));
    };
    let payload = if skipped.unwrap_or(false) {
        "__skipped__".to_string()
    } else {
        let cid = concept_id.unwrap_or_default();
        let trimmed = cid.trim().to_string();
        if trimmed.is_empty() {
            return Err(AppError::Message("Pick a concept id.".to_string()));
        }
        let known = pick
            .concepts
            .iter()
            .any(|c| c.id.eq_ignore_ascii_case(&trimmed) || c.name.eq_ignore_ascii_case(&trimmed));
        if !known {
            return Err(AppError::Message(
                "That concept is not in this preview set.".to_string(),
            ));
        }
        let mut obj = serde_json::json!({ "id": trimmed });
        if let Some(raw) = tweaks {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                obj["tweaks"] = v;
            }
        }
        obj.to_string()
    };
    drop(pending);
    state.design_pick_answers.lock()?.insert(id, payload);
    Ok(())
}

