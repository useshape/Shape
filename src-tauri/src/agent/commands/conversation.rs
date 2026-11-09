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

/// Tauri keeps async commands on the WebView thread until the first `.await`.
async fn leave_webview() {
    tokio::task::yield_now().await;
}

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
pub async fn get_chat_history(
    limit: Option<usize>,
    state: tauri::State<'_, AgentState>,
    _app_state: tauri::State<'_, AppState>,
) -> Result<Vec<ChatMessage>, AppError> {
    leave_webview().await;
    // Opening or closing a coding folder must not wipe the live conversation.
    // Persistence store is owned by load/new/send, not by the workspace path.
    let history = state.merge_in_flight_into_history(state.history.lock()?.clone());
    let Some(limit) = limit.filter(|n| *n > 0) else {
        return Ok(history);
    };
    if history.len() <= limit {
        return Ok(history);
    }
    Ok(history[history.len() - limit..].to_vec())
}

#[tauri::command]
pub fn get_chat_generation_state(
    state: tauri::State<'_, AgentState>,
) -> Result<crate::agent::models::ChatGenerationState, AppError> {
    Ok(state.generation_state())
}

#[tauri::command]
pub async fn get_conversations(
    _state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
    project_path: Option<String>,
    all: Option<bool>,
) -> Result<Vec<crate::agent::models::Conversation>, AppError> {
    leave_webview().await;
    let mut path = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("Shape");
    path.push("chat_history");

    let filter_path = if all.unwrap_or(false) {
        None
    } else {
        project_path.or_else(|| app_state.0.lock().ok().and_then(|s| s.project_path.clone()))
    };

    let mut all_convs = Vec::new();
    if let Some(ref fp) = filter_path {
        all_convs = history::load_conversations(fp);
    } else if let Ok(entries) = std::fs::read_dir(path) {
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

    all_convs.sort_by(|a, b| {
        b.timestamp
            .partial_cmp(&a.timestamp)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(all_convs)
}

#[tauri::command]
pub async fn get_conversation(
    id: String,
    project_path: Option<String>,
) -> Result<crate::agent::models::Conversation, AppError> {
    leave_webview().await;
    history::find_conversation_by_id(&id, project_path.as_deref())
        .map(|(_, conv)| conv)
        .ok_or_else(|| AppError::Message("Conversation not found".to_string()))
}

#[tauri::command]
pub fn clear_chat_history(state: tauri::State<'_, AgentState>) -> Result<(), AppError> {
    state.history.lock()?.clear();
    state.title.lock()?.take();
    state.reset_title_meta();
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
            if let Some(id) = conv_id.as_deref() {
                if let Some(token) = state.conversation_cancel_token(id) {
                    token.cancel();
                }
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

pub(crate) fn apply_new_chat(
    state: &AgentState,
    store_path: Option<String>,
    fallback_project: Option<String>,
) -> Result<String, AppError> {
    let persist_path = state
        .current_project
        .lock()?
        .clone()
        .or(fallback_project)
        .unwrap_or_else(|| history::TALK_STORE.to_string());
    let _ = history::stash_live_conversation(state, &persist_path);
    let snapshot = state
        .conversations
        .lock()
        .ok()
        .and_then(|convs| convs.get(&persist_path).cloned());
    if let Some(list) = snapshot {
        let path = persist_path.clone();
        std::thread::spawn(move || history::save_conversations(&path, &list));
    }
    *state.current_project.lock()? = Some(persist_path.clone());

    state.history.lock()?.clear();
    state.title.lock()?.take();
    state.reset_title_meta();
    *state.history_summary.lock()? = None;
    let next_id = format!("{}", history::now_f64() as u64);
    *state.current_conversation_id.lock()? = Some(next_id.clone());
    *state.conversation_kind.lock()? = Some("chat".to_string());
    if let Some(store) = store_path.filter(|s| !s.trim().is_empty()) {
        *state.current_project.lock()? = Some(store);
    }
    state.clear_design_preview_state();
    state.clear_file_checkpoints();
    state.set_incognito(false);
    Ok(next_id)
}

#[tauri::command]
pub async fn new_chat(
    store_path: Option<String>,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
    index_state: tauri::State<'_, crate::agent::index::IndexState>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    leave_webview().await;
    let fallback = app_state.0.lock()?.project_path.clone();
    apply_new_chat(&state, store_path, fallback)?;
    if let Some(path) = app_state.0.lock()?.project_path.clone() {
        if index_state.should_background_index(&path) {
            let _ = index_state.spawn_background_index(app_handle, path);
        }
    }
    Ok(())
}

fn install_conversation(state: &AgentState, id: &str, load_proj: String, conv: crate::agent::models::Conversation) {
    let mut history = conv.history;
    history::collapse_duplicate_assistants(&mut history);
    history = state.merge_in_flight_into_history_for(history, Some(id));
    let user_turns = history.iter().filter(|m| m.role == "user").count() as u32;
    let anchor = if conv.title_anchor_turns == 0 {
        user_turns
    } else {
        conv.title_anchor_turns
    };
    if let Ok(mut hist) = state.history.lock() {
        *hist = history;
    }
    if let Ok(mut title) = state.title.lock() {
        *title = Some(conv.title);
    }
    state.set_title_meta(conv.title_locked, anchor);
    if let Ok(mut project) = state.current_project.lock() {
        *project = Some(load_proj);
    }
    if let Ok(mut current) = state.current_conversation_id.lock() {
        *current = Some(id.to_string());
    }
    if let Ok(mut kind) = state.conversation_kind.lock() {
        *kind = Some(if conv.kind.trim().is_empty() {
            "chat".to_string()
        } else {
            conv.kind
        });
    }
    state.clear_design_preview_state();
    state.set_incognito(false);
}

pub(crate) fn apply_focus_conversation(
    state: &AgentState,
    id: &str,
    preferred_proj: Option<String>,
) -> Result<(), AppError> {
    if state.current_conversation_id.lock()?.as_deref() == Some(id) {
        return Ok(());
    }
    let persist_path = state
        .current_project
        .lock()?
        .clone()
        .or_else(|| preferred_proj.clone())
        .unwrap_or_else(|| history::TALK_STORE.to_string());
    let _ = history::stash_live_conversation(state, &persist_path);

    let preferred = preferred_proj.filter(|p| !p.is_empty());
    let found = {
        let convs = state.conversations.lock()?;
        let preferred_hit = preferred.as_ref().and_then(|proj| {
            convs.get(proj).and_then(|list| {
                list.iter()
                    .find(|c| c.id == id)
                    .map(|c| (proj.clone(), c.clone()))
            })
        });
        preferred_hit.or_else(|| {
            convs.iter().find_map(|(proj, list)| {
                list.iter()
                    .find(|c| c.id == id)
                    .map(|c| (proj.clone(), c.clone()))
            })
        })
    };
    let (load_proj, conv) = if let Some(hit) = found {
        hit
    } else {
        history::find_conversation_by_id(id, preferred.as_deref())
            .ok_or_else(|| AppError::Message("Conversation not found".to_string()))?
    };
    install_conversation(state, id, load_proj, conv);
    Ok(())
}

#[tauri::command]
pub async fn load_conversation(
    id: String,
    project_path: Option<String>,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    leave_webview().await;
    let preferred = project_path
        .or_else(|| app_state.0.lock().ok().and_then(|s| s.project_path.clone()))
        .filter(|p| !p.is_empty());
    apply_focus_conversation(&state, &id, preferred)?;
    state.replace_file_checkpoints(checkpoints::load_checkpoints(&id));
    Ok(())
}

/// Point the agent at a conversation that is already on screen.
/// Uses the in-memory transcript and does not read or write the history file
/// when that transcript is cached. A live generation is left untouched.
#[tauri::command]
pub async fn focus_conversation(
    id: String,
    project_path: Option<String>,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    leave_webview().await;
    let preferred = project_path
        .or_else(|| app_state.0.lock().ok().and_then(|s| s.project_path.clone()))
        .filter(|p| !p.is_empty());
    apply_focus_conversation(&state, &id, preferred)
}

#[tauri::command]
pub fn set_chat_incognito(
    enabled: bool,
    state: tauri::State<'_, AgentState>,
) -> Result<(), AppError> {
    state.set_incognito(enabled);
    Ok(())
}

#[tauri::command]
pub fn get_chat_incognito(state: tauri::State<'_, AgentState>) -> Result<bool, AppError> {
    Ok(state.incognito())
}

#[tauri::command]
pub async fn rename_conversation(
    id: String,
    title: String,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    leave_webview().await;
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::Message("Title cannot be empty".to_string()));
    }
    let proj_path = history::find_conversation_by_id(&id, state.current_project.lock().ok().and_then(|p| p.clone()).as_deref())
        .map(|(path, _)| path)
        .or_else(|| state.current_project.lock().ok().and_then(|p| p.clone()))
        .or_else(|| app_state.0.lock().ok().and_then(|s| s.project_path.clone()))
        .unwrap_or_else(|| history::TALK_STORE.to_string());
    let current = state.current_conversation_id.lock()?.clone();
    if current.as_deref() == Some(id.as_str()) {
        *state.title.lock()? = Some(title.clone());
        let anchor = state.title_anchor_turns.lock().map(|g| *g).unwrap_or(0);
        state.set_title_meta(true, anchor);
        if !proj_path.is_empty() {
            let _ = history::save_current_conversation(&state, &proj_path);
        }
        return Ok(());
    }
    history::hydrate_project_conversations(&state, &proj_path);
    let snapshot = {
        let mut convs = state.conversations.lock()?;
        if let Some(list) = convs.get_mut(&proj_path) {
            if let Some(conv) = list.iter_mut().find(|c| c.id == id) {
                conv.title = title;
                conv.title_locked = true;
                conv.timestamp = history::now_f64();
            }
            Some(list.clone())
        } else {
            None
        }
    };
    if let Some(snapshot) = snapshot {
        history::save_conversations(&proj_path, &snapshot);
    }
    Ok(())
}

#[tauri::command]
pub async fn set_conversation_archived(
    id: String,
    archived: bool,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    leave_webview().await;
    let proj_path = history::find_conversation_by_id(
        &id,
        state.current_project.lock().ok().and_then(|p| p.clone()).as_deref(),
    )
    .map(|(path, _)| path)
    .or_else(|| state.current_project.lock().ok().and_then(|p| p.clone()))
    .or_else(|| app_state.0.lock().ok().and_then(|s| s.project_path.clone()))
    .unwrap_or_else(|| history::TALK_STORE.to_string());
    history::hydrate_project_conversations(&state, &proj_path);
    let snapshot = {
        let mut convs = state.conversations.lock()?;
        if let Some(list) = convs.get_mut(&proj_path) {
            if let Some(conv) = list.iter_mut().find(|c| c.id == id) {
                conv.archived = archived;
            }
            Some(list.clone())
        } else {
            None
        }
    };
    if let Some(snapshot) = snapshot {
        history::save_conversations(&proj_path, &snapshot);
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_conversation(
    id: String,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    leave_webview().await;
    let proj_path = history::find_conversation_by_id(
        &id,
        state.current_project.lock().ok().and_then(|p| p.clone()).as_deref(),
    )
    .map(|(path, _)| path)
    .or_else(|| state.current_project.lock().ok().and_then(|p| p.clone()))
    .or_else(|| app_state.0.lock().ok().and_then(|s| s.project_path.clone()))
    .unwrap_or_else(|| history::TALK_STORE.to_string());
    history::hydrate_project_conversations(&state, &proj_path);
    let snapshot = {
        let mut convs = state.conversations.lock()?;
        if let Some(list) = convs.get_mut(&proj_path) {
            list.retain(|c| c.id != id);
            Some(list.clone())
        } else {
            None
        }
    };
    if let Some(snapshot) = snapshot {
        history::save_conversations_removing(&proj_path, &snapshot, &id);
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

#[tauri::command]
pub async fn fork_conversation(
    message_index: usize,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, AppError> {
    leave_webview().await;
    let proj_path = state
        .current_project
        .lock()?
        .clone()
        .or_else(|| app_state.0.lock().ok().and_then(|s| s.project_path.clone()))
        .unwrap_or_else(|| history::TALK_STORE.to_string());
    let _ = history::save_current_conversation(&state, &proj_path);

    let source_id = state
        .current_conversation_id
        .lock()?
        .clone()
        .unwrap_or_default();
    let source_title = state
        .title
        .lock()?
        .clone()
        .unwrap_or_else(|| "Chat".to_string());
    let history = state.history.lock()?.clone();
    if history.is_empty() {
        return Err(AppError::Message("Nothing to fork.".to_string()));
    }
    let end = message_index.min(history.len().saturating_sub(1));
    let mut sliced = history[..=end].to_vec();
    for (i, msg) in sliced.iter_mut().enumerate() {
        msg.hidden = i < end;
    }
    let attr_title = source_title.replace('&', "&amp;").replace('"', "&quot;");
    let banner = format!(
        "<forked_from id=\"{}\" title=\"{}\" />\n",
        source_id.replace('"', ""),
        attr_title
    );
    if let Some(msg) = sliced.get_mut(end) {
        msg.hidden = false;
        if msg.role == "assistant" && !msg.content.contains("<forked_from") {
            msg.content = format!("{}{}", banner, msg.content);
        }
    }

    let new_id = format!("fork-{}", history::now_f64() as u64);
    let new_title = format!("Fork of {source_title}");
    history::upsert_conversation_snapshot(
        &state,
        &proj_path,
        &new_id,
        &new_title,
        sliced.clone(),
    )?;

    *state.history.lock()? = sliced;
    *state.title.lock()? = Some(new_title.clone());
    *state.current_conversation_id.lock()? = Some(new_id.clone());
    state.clear_design_preview_state();
    state.clear_file_checkpoints();

    Ok(serde_json::json!({ "id": new_id, "title": new_title }))
}

fn normalize_feedback(feedback: Option<String>) -> Option<String> {
    feedback
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| s == "up" || s == "down")
}

#[tauri::command]
pub async fn set_message_feedback(
    index: usize,
    feedback: Option<String>,
    conversation_id: Option<String>,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    leave_webview().await;
    let value = normalize_feedback(feedback);
    let current = state.current_conversation_id.lock()?.clone();
    let target = conversation_id.filter(|id| !id.is_empty());
    let use_live = target.is_none() || target.as_ref() == current.as_ref();
    if use_live {
        {
            let mut hist = state.history.lock()?;
            let Some(msg) = hist.get_mut(index) else {
                return Err(AppError::Message("Message not found.".to_string()));
            };
            msg.feedback = value;
        }
        if let Some(path) = app_state.0.lock()?.project_path.clone() {
            let _ = history::save_current_conversation(&state, &path);
        }
        return Ok(());
    }

    let id = target.unwrap_or_default();
    let Some(path) = app_state.0.lock()?.project_path.clone() else {
        return Err(AppError::Message("Message not found.".to_string()));
    };
    let (title, mut hist) = {
        let convs = state.conversations.lock()?;
        let Some(conv) = convs
            .get(&path)
            .and_then(|list| list.iter().find(|c| c.id == id))
        else {
            return Err(AppError::Message("Message not found.".to_string()));
        };
        if conv.history.get(index).is_none() {
            return Err(AppError::Message("Message not found.".to_string()));
        }
        (conv.title.clone(), conv.history.clone())
    };
    if let Some(msg) = hist.get_mut(index) {
        msg.feedback = value;
    }
    history::upsert_conversation_snapshot(&state, &path, &id, &title, hist)
}

#[tauri::command]
pub async fn flush_chat_history(
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    leave_webview().await;
    let path = app_state.0.lock()?.project_path.clone();
    if let Some(path) = path {
        let _ = history::save_current_conversation(&state, &path);
    }
    Ok(())
}

#[tauri::command]
pub fn set_open_at_login(enabled: bool) -> Result<bool, AppError> {
    set_login_item(enabled)?;
    Ok(enabled)
}

#[tauri::command]
pub fn get_open_at_login() -> Result<bool, AppError> {
    Ok(login_item_enabled())
}

fn set_login_item(enabled: bool) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        use winreg::enums::*;
        let hkcu = winreg::RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .map_err(|e| AppError::Message(e.to_string()))?;
        if enabled {
            let exe = std::env::current_exe().map_err(|e| AppError::Message(e.to_string()))?;
            let path = exe.to_string_lossy().to_string();
            key.set_value("Shape", &path)
                .map_err(|e| AppError::Message(e.to_string()))?;
        } else {
            let _ = key.delete_value("Shape");
        }
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        let _ = enabled;
        Ok(())
    }
}

fn login_item_enabled() -> bool {
    #[cfg(windows)]
    {
        use winreg::enums::*;
        let hkcu = winreg::RegKey::predef(HKEY_CURRENT_USER);
        let Ok(key) = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run") else {
            return false;
        };
        key.get_value::<String, _>("Shape").is_ok()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::models::{ChatMessage, Conversation};

    fn user(content: &str) -> ChatMessage {
        ChatMessage {
            role: "user".to_string(),
            content: content.to_string(),
            timestamp: 1.0,
            stats: None,
            model: None,
            feedback: None,
            hidden: false,
        }
    }

    fn conv(id: &str, content: &str, proj: &str) -> Conversation {
        Conversation {
            id: id.to_string(),
            title: id.to_string(),
            history: vec![user(content)],
            project_path: proj.to_string(),
            timestamp: 1.0,
            title_locked: false,
            title_anchor_turns: 1,
            archived: false,
            kind: "chat".to_string(),
            parent_id: None,
        }
    }

    #[test]
    fn focus_switches_away_from_generating_chat() {
        let state = AgentState::new();
        let proj = format!("shape-switch-{}", uuid::Uuid::new_v4());
        *state.current_project.lock().unwrap() = Some(proj.clone());
        *state.current_conversation_id.lock().unwrap() = Some("a".into());
        *state.history.lock().unwrap() = vec![user("hello a")];
        *state.title.lock().unwrap() = Some("a".into());
        assert!(state.try_begin_in_flight("turn-a".into(), Some("a".into())));
        history::stash_live_conversation(&state, &proj).unwrap();
        {
            let mut convs = state.conversations.lock().unwrap();
            convs
                .entry(proj.clone())
                .or_default()
                .push(conv("b", "hello b", &proj));
        }
        apply_focus_conversation(&state, "b", Some(proj.clone())).unwrap();
        assert_eq!(state.current_conversation_id.lock().unwrap().as_deref(), Some("b"));
        assert_eq!(state.history.lock().unwrap()[0].content, "hello b");
        assert!(state.in_flight_contains_turn("turn-a"));

        apply_focus_conversation(&state, "a", Some(proj.clone())).unwrap();
        assert_eq!(state.current_conversation_id.lock().unwrap().as_deref(), Some("a"));
        assert!(
            state
                .history
                .lock()
                .unwrap()
                .iter()
                .any(|m| m.content.contains("hello a"))
        );
        let _ = std::fs::remove_file(history::get_chat_history_path(&proj));
    }

    #[test]
    fn new_chat_during_turn_keeps_background_flight() {
        let state = AgentState::new();
        let proj = format!("shape-new-{}", uuid::Uuid::new_v4());
        *state.current_project.lock().unwrap() = Some(proj.clone());
        *state.current_conversation_id.lock().unwrap() = Some("a".into());
        *state.history.lock().unwrap() = vec![user("hello a")];
        *state.title.lock().unwrap() = Some("a".into());
        assert!(state.try_begin_in_flight("turn-a".into(), Some("a".into())));
        let started = std::time::Instant::now();
        let next = apply_new_chat(&state, Some(proj.clone()), Some(proj.clone())).unwrap();
        assert!(started.elapsed() < std::time::Duration::from_millis(400));
        assert_ne!(next, "a");
        assert!(state.history.lock().unwrap().is_empty());
        assert!(state.in_flight_contains_turn("turn-a"));
        let _ = std::fs::remove_file(history::get_chat_history_path(&proj));
    }

    #[test]
    fn switching_tabs_during_partial_stream_keeps_each_transcript() {
        use std::sync::Arc;
        let state = Arc::new(AgentState::new());
        let proj = format!("shape-race-{}", uuid::Uuid::new_v4());
        *state.current_project.lock().unwrap() = Some(proj.clone());
        *state.current_conversation_id.lock().unwrap() = Some("a".into());
        *state.history.lock().unwrap() = vec![user("hello a")];
        *state.title.lock().unwrap() = Some("a".into());
        assert!(state.try_begin_in_flight("turn-a".into(), Some("a".into())));
        history::stash_live_conversation(&state, &proj).unwrap();
        {
            let mut convs = state.conversations.lock().unwrap();
            convs
                .entry(proj.clone())
                .or_default()
                .push(conv("b", "hello b", &proj));
        }

        let writer = {
            let state = Arc::clone(&state);
            let proj = proj.clone();
            std::thread::spawn(move || {
                for i in 0..80 {
                    state.append_in_flight(
                        &format!("tok{i}"),
                        None,
                        Some(&proj),
                        Some("a"),
                    );
                }
            })
        };

        let started = std::time::Instant::now();
        for _ in 0..40 {
            apply_focus_conversation(&state, "b", Some(proj.clone())).unwrap();
            assert_eq!(state.current_conversation_id.lock().unwrap().as_deref(), Some("b"));
            let live = state.history.lock().unwrap().clone();
            assert!(
                live.iter().any(|m| m.content.contains("hello b")),
                "live history must stay on the focused chat"
            );
            assert!(
                live.iter().all(|m| !m.content.contains("tok")),
                "background tokens must not land in the other chat"
            );
            apply_new_chat(&state, Some(proj.clone()), Some(proj.clone())).unwrap();
            assert!(state.history.lock().unwrap().is_empty());
            apply_focus_conversation(&state, "a", Some(proj.clone())).unwrap();
        }
        writer.join().unwrap();
        assert!(started.elapsed() < std::time::Duration::from_secs(2));
        assert!(state.in_flight_contains_turn("turn-a"));
        let _ = std::fs::remove_file(history::get_chat_history_path(&proj));
    }
}

