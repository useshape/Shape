/// Conversation persistence: save/load/manage chat history to disk.

use std::time::{SystemTime, UNIX_EPOCH};
use crate::core::error::AppError;
use super::super::models::{AgentState, ChatMessage, Conversation};
use super::logging;

pub fn now_f64() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs_f64()
}

pub fn normalize_project_path(path: &str) -> String {
    path.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

pub fn project_paths_equal(a: &Option<String>, b: &Option<String>) -> bool {
    match (a.as_deref(), b.as_deref()) {
        (None, None) => true,
        (Some(a), Some(b)) => normalize_project_path(a) == normalize_project_path(b),
        _ => false,
    }
}

pub fn get_chat_history_path(proj_path: &str) -> std::path::PathBuf {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    proj_path.hash(&mut hasher);
    let hash = hasher.finish();

    let mut path = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("Shape");
    path.push("chat_history");
    let _ = std::fs::create_dir_all(&path);
    path.push(format!("{:x}.json", hash));
    path
}

pub fn load_conversations(proj_path: &str) -> Vec<Conversation> {
    let file_path = get_chat_history_path(proj_path);
    logging::debug("history", &format!("Loading conversations from {:?}", file_path));
    if let Ok(content) = std::fs::read_to_string(&file_path) {
        if let Ok(convs) = serde_json::from_str(&content) {
            return convs;
        } else {
            logging::warn("history", "Failed to parse conversation file, returning empty");
        }
    }
    Vec::new()
}

pub fn save_conversations(proj_path: &str, convs: &[Conversation]) {
    let file_path = get_chat_history_path(proj_path);
    if let Ok(content) = serde_json::to_string(convs) {
        let _ = std::fs::write(&file_path, content);
        logging::debug("history", &format!("Saved {} conversations", convs.len()));
    } else {
        logging::error("history", "Failed to serialize conversations");
    }
}

/// Locate a conversation by id, optionally preferring a project file first.
pub fn find_conversation_by_id(id: &str, preferred_proj: Option<&str>) -> Option<(String, Conversation)> {
    if let Some(proj) = preferred_proj.filter(|p| !p.is_empty()) {
        let list = load_conversations(proj);
        if let Some(conv) = list.into_iter().find(|c| c.id == id) {
            return Some((proj.to_string(), conv));
        }
    }

    let mut root = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    root.push("Shape");
    root.push("chat_history");

    let Ok(entries) = std::fs::read_dir(root) else {
        return None;
    };

    for entry in entries.flatten() {
        if entry.path().extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(entry.path()) else {
            continue;
        };
        let Ok(list) = serde_json::from_str::<Vec<Conversation>>(&content) else {
            continue;
        };
        if let Some(conv) = list.into_iter().find(|c| c.id == id) {
            return Some((conv.project_path.clone(), conv));
        }
    }

    None
}

pub fn save_current_conversation(state: &AgentState, proj_path: &str) -> Result<(), AppError> {
    let history = state.history_for_persistence()?;
    if history.is_empty() {
        return Ok(());
    }

    let title = state.title.lock()?.clone();
    let has_assistant_response = history.iter().any(|m| m.role == "assistant");
    // Persist as soon as we have a title (even user-only) so a mid-generation switch
    // does not drop the chat. Still skip completely untitled empty drafts.
    if title.is_none() && !has_assistant_response {
        return Ok(());
    }

    let title = title.unwrap_or_else(|| "Untitled".to_string());

    let mut conv_id_guard = state.current_conversation_id.lock()?;
    let id = conv_id_guard
        .clone()
        .unwrap_or_else(|| format!("{}", now_f64() as u64));
    *conv_id_guard = Some(id.clone());

    let mut convs = state.conversations.lock()?;
    let list = convs.entry(proj_path.to_string()).or_insert_with(Vec::new);
    if let Some(existing) = list.iter_mut().find(|c| c.id == id) {
        existing.history = history;
        existing.title = title;
        existing.timestamp = now_f64();
    } else {
        list.push(Conversation {
            id,
            title,
            history,
            project_path: proj_path.to_string(),
            timestamp: now_f64(),
        });
    }

    save_conversations(proj_path, list);
    logging::debug("history", "Current conversation saved");

    Ok(())
}

/// Persist a finished/abandoned turn into a specific conversation without touching the live chat.
pub fn upsert_conversation_snapshot(
    state: &AgentState,
    proj_path: &str,
    id: &str,
    title: &str,
    history: Vec<ChatMessage>,
) -> Result<(), AppError> {
    if history.is_empty() {
        return Ok(());
    }
    let mut convs = state.conversations.lock()?;
    let list = convs.entry(proj_path.to_string()).or_insert_with(Vec::new);
    if let Some(existing) = list.iter_mut().find(|c| c.id == id) {
        existing.history = history;
        existing.title = title.to_string();
        existing.timestamp = now_f64();
    } else {
        list.push(Conversation {
            id: id.to_string(),
            title: title.to_string(),
            history,
            project_path: proj_path.to_string(),
            timestamp: now_f64(),
        });
    }
    save_conversations(proj_path, list);
    Ok(())
}
