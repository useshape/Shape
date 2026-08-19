//! Conversation list / load / clear / checkpoint restore / journals.
use super::checkpoints;
use super::history;
use super::journals;
use super::logging;
use crate::agent::models::{AgentState, ChatMessage};
use crate::app_state::AppState;
use crate::core::error::AppError;
use serde_json::json;
use tauri::Emitter;

#[tauri::command]
pub fn get_chat_title(state: tauri::State<'_, AgentState>) -> Result<String, AppError> {
    Ok(state
        .title
        .lock()?
        .clone()
        .unwrap_or_else(|| "New Chat".to_string()))
}

#[tauri::command]
pub fn get_current_conversation_id(state: tauri::State<'_, AgentState>) -> Result<Option<String>, AppError> {
    Ok(state.current_conversation_id.lock()?.clone())
}

#[tauri::command]
pub fn get_chat_history(
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<ChatMessage>, AppError> {
    let proj_path = app_state.0.lock()?.project_path.clone();
    let mut current_project_lock = state.current_project.lock()?;

    if !history::project_paths_equal(&proj_path, &*current_project_lock) {
        logging::info(
            "chat",
            &format!(
                "Switching chat project from {:?} to {:?}",
                current_project_lock, proj_path
            ),
        );

        if let Some(old_path) = current_project_lock.as_ref() {
            let _ = history::save_current_conversation(&state, old_path);
        }

        state.history.lock()?.clear();
        state.title.lock()?.take();
        *state.history_summary.lock()? = None;
        *state.current_conversation_id.lock()? = None;
        *current_project_lock = proj_path;
    }

    Ok(state.merge_in_flight_into_history(state.history.lock()?.clone()))
}

#[tauri::command]
pub fn get_chat_generation_state(
    state: tauri::State<'_, AgentState>,
) -> Result<crate::agent::models::ChatGenerationState, AppError> {
    Ok(state.generation_state())
}

#[tauri::command]
pub fn get_conversations(
    _state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
    project_path: Option<String>,
) -> Result<Vec<crate::agent::models::Conversation>, AppError> {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("Shape");
    path.push("chat_history");

    let filter_path =
        project_path.or_else(|| app_state.0.lock().ok().and_then(|s| s.project_path.clone()));

    let mut all_convs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = std::fs::read_to_string(entry.path()) {
                    if let Ok(mut convs) =
                        serde_json::from_str::<Vec<crate::agent::models::Conversation>>(&content)
                    {
                        all_convs.append(&mut convs);
                    }
                }
            }
        }
    }

    if let Some(ref fp) = filter_path {
        let normalized = fp.replace('\\', "/").to_lowercase();
        all_convs.retain(|c| {
            let conv_normalized = c.project_path.replace('\\', "/").to_lowercase();
            conv_normalized == normalized
        });
    }

    all_convs.sort_by(|a, b| {
        b.timestamp
            .partial_cmp(&a.timestamp)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(all_convs)
}

#[tauri::command]
pub fn clear_chat_history(state: tauri::State<'_, AgentState>) -> Result<(), AppError> {
    state.history.lock()?.clear();
    state.title.lock()?.take();
    *state.history_summary.lock()? = None;
    *state.current_conversation_id.lock()? = None;
    state.clear_design_preview_state();
    state.clear_file_checkpoints();
    Ok(())
}

/// Restore both chat history and any file edits made from `index` onward. This is
/// what powers the "restore to here" / redo flow: rewinding a turn should undo the
/// file changes it made, not just hide the messages describing them.
///
/// Always cancels any in-flight generation first — otherwise Redo truncates the
/// transcript while the old turn keeps running (ghost approvals / missing messages).
#[tauri::command]
pub async fn restore_checkpoint(
    index: usize,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
    pty_state: tauri::State<'_, crate::commands::pty::PtyState>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    let aborted_turn = {
        let turn_id = state.in_flight_turn_id();
        let conv_id = state
            .in_flight_conversation_id()
            .or_else(|| state.current_conversation_id.lock().ok().and_then(|g| g.clone()));
        if turn_id.is_some() {
            logging::info("chat", "Restore/redo cancelling in-flight generation");
            if let Ok(token) = state.cancellation_token.lock() {
                token.cancel();
            }
            state.clear_in_flight();
            turn_id.zip(conv_id)
        } else {
            None
        }
    };
    state.kill_active_terminal(&pty_state).await;
    if let Some((turn_id, conv_id)) = aborted_turn {
        let _ = app_handle.emit(
            "chat_complete",
            json!({
                "turnId": turn_id,
                "conversationId": conv_id,
                "error": "Cancelled",
            }),
        );
    }

    {
        let mut history = state.history.lock()?;
        if index < history.len() {
            history.truncate(index);
        }
    }
    // Drop design gate / sandbox so restore past Continue does not leave writes blocked.
    state.clear_design_preview_state();

    let project_path = app_state.0.lock()?.project_path.clone().unwrap_or_default();
    let snapshots = state.take_checkpoints_from(index);
    for snap in snapshots {
        let abs_path = if std::path::Path::new(&snap.path).is_absolute() {
            snap.path.clone()
        } else {
            std::path::Path::new(&project_path)
                .join(&snap.path)
                .to_string_lossy()
                .into_owned()
        };
        let result = match &snap.original_content {
            Some(content) => {
                if let Some(parent) = std::path::Path::new(&abs_path).parent() {
                    let _ = tokio::fs::create_dir_all(parent).await;
                }
                tokio::fs::write(&abs_path, content).await
            }
            None => match tokio::fs::remove_file(&abs_path).await {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(e),
            },
        };
        if let Err(e) = result {
            logging::warn(
                "checkpoints",
                &format!("Failed to restore checkpoint for {}: {}", snap.path, e),
            );
            continue;
        }
        let _ = app_handle.emit("shape-file-edited", &abs_path);
    }

    if let Some(conv_id) = state.current_conversation_id.lock()?.clone() {
        checkpoints::save_checkpoints(&conv_id, &state.file_checkpoints_snapshot());
    }

    Ok(())
}

#[tauri::command]
pub fn new_chat(
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
    index_state: tauri::State<'_, crate::agent::index::IndexState>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    // Keep any in-flight turn running in the background — only Stop cancels.
    let active_proj = state.current_project.lock()?.clone();

    if let Some(path) = active_proj {
        let _ = history::save_current_conversation(&state, &path);
    } else {
        let proj_path = app_state.0.lock()?.project_path.clone();
        if let Some(path) = proj_path {
            let _ = history::save_current_conversation(&state, &path);
            *state.current_project.lock()? = Some(path);
        }
    }

    state.history.lock()?.clear();
    state.title.lock()?.take();
    *state.history_summary.lock()? = None;
    *state.current_conversation_id.lock()? = None;
    state.clear_design_preview_state();
    state.clear_file_checkpoints();

    // Refresh the index only when it is actually stale — an unconditional
    // rescan on every new chat wasted a full project walk.
    if let Some(path) = app_state.0.lock()?.project_path.clone() {
        if index_state.should_background_index(&path) {
            let _ = index_state.spawn_background_index(app_handle, path);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn load_conversation(
    id: String,
    project_path: Option<String>,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    if let Some(active_path) = state.current_project.lock()?.as_ref() {
        let _ = history::save_current_conversation(&state, active_path);
    }

    let preferred_proj = project_path
        .or_else(|| app_state.0.lock().ok().and_then(|s| s.project_path.clone()))
        .filter(|p| !p.is_empty());

    let (load_proj, conv) = history::find_conversation_by_id(
        &id,
        preferred_proj.as_deref(),
    )
    .ok_or(AppError::Message("Conversation not found".to_string()))?;

    {
        let mut convs = state.conversations.lock()?;
        if !convs.contains_key(&load_proj) {
            convs.insert(load_proj.clone(), history::load_conversations(&load_proj));
        }
    }

    *state.current_project.lock()? = Some(load_proj);
    *state.history.lock()? = conv.history;
    *state.title.lock()? = Some(conv.title);
    *state.current_conversation_id.lock()? = Some(id.clone());
    state.clear_design_preview_state();
    state.replace_file_checkpoints(checkpoints::load_checkpoints(&id));

    Ok(())
}

#[tauri::command]
pub fn delete_conversation(
    id: String,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let proj_path = app_state.0.lock()?.project_path.clone().unwrap_or_default();
    let mut convs = state.conversations.lock()?;
    if !convs.contains_key(&proj_path) {
        convs.insert(proj_path.clone(), history::load_conversations(&proj_path));
    }
    if let Some(list) = convs.get_mut(&proj_path) {
        list.retain(|c| c.id != id);
        history::save_conversations(&proj_path, list);
    }
    checkpoints::delete_checkpoints(&id);
    for j in journals::list_open_turn_journals()
        .into_iter()
        .filter(|j| j.conversation_id == id)
    {
        journals::clear_turn_journal(&j.conversation_id, &j.turn_id);
    }
    Ok(())
}

#[tauri::command]
pub fn get_turn_journal(conversation_id: String, turn_id: String) -> Option<journals::TurnJournal> {
    journals::load_turn_journal(&conversation_id, &turn_id)
}

#[tauri::command]
pub fn get_open_turn_journals() -> Vec<journals::TurnJournal> {
    journals::list_open_turn_journals()
}

