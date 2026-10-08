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
    save_conversations_inner(proj_path, convs, &[], true);
}

/// Mid-turn checkpoint: write memory as-is. Skip re-reading the whole JSON file
/// so long chats do not hitch every few seconds on parse + serialize.
pub fn save_conversations_checkpoint(proj_path: &str, convs: &[Conversation]) {
    save_conversations_inner(proj_path, convs, &[], false);
}

/// Write the project chat file, merging with whatever another window already saved.
/// `removed` ids are deleted even if they still exist on disk.
pub fn save_conversations_removing(proj_path: &str, convs: &[Conversation], removed: &str) {
    save_conversations_inner(proj_path, convs, &[removed], true);
}

fn save_conversations_inner(proj_path: &str, convs: &[Conversation], removed: &[&str], merge_disk: bool) {
    let file_path = get_chat_history_path(proj_path);
    let mut lock_path = file_path.clone();
    lock_path.set_extension("lock");
    let started = std::time::Instant::now();
    loop {
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock_path)
        {
            Ok(_lock) => {
                let merged = if merge_disk {
                    merge_with_disk(proj_path, convs, removed)
                } else {
                    let mut out = convs.to_vec();
                    for id in removed {
                        out.retain(|c| c.id != *id);
                    }
                    out
                };
                if let Ok(content) = serde_json::to_string(&merged) {
                    let _ = std::fs::write(&file_path, content);
                    logging::debug("history", &format!("Saved {} conversations", merged.len()));
                } else {
                    logging::error("history", "Failed to serialize conversations");
                }
                let _ = std::fs::remove_file(&lock_path);
                return;
            }
            Err(_) if started.elapsed() < std::time::Duration::from_secs(2) => {
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Err(_) => {
                let _ = std::fs::remove_file(&lock_path);
            }
        }
    }
}

fn histories_compatible_prefix(a: &[crate::agent::models::ChatMessage], b: &[crate::agent::models::ChatMessage]) -> bool {
    let (short, long) = if a.len() <= b.len() { (a, b) } else { (b, a) };
    short.iter().zip(long.iter()).all(|(left, right)| {
        left.role == right.role && left.content == right.content
    })
}

fn merge_with_disk(proj_path: &str, incoming: &[Conversation], removed: &[&str]) -> Vec<Conversation> {
    let mut merged = load_conversations(proj_path);
    for id in removed {
        merged.retain(|c| c.id != *id);
    }
    for conv in incoming {
        if removed.iter().any(|id| *id == conv.id) {
            continue;
        }
        if let Some(existing) = merged.iter_mut().find(|c| c.id == conv.id) {
            if histories_compatible_prefix(&conv.history, &existing.history) {
                if conv.history.len() >= existing.history.len() {
                    *existing = conv.clone();
                }
            } else if conv.timestamp >= existing.timestamp {
                *existing = conv.clone();
            }
        } else {
            merged.push(conv.clone());
        }
    }
    merged
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
    save_current_conversation_inner(state, proj_path, true)
}

pub fn save_current_conversation_checkpoint(
    state: &AgentState,
    proj_path: &str,
) -> Result<(), AppError> {
    save_current_conversation_inner(state, proj_path, false)
}

fn save_current_conversation_inner(
    state: &AgentState,
    proj_path: &str,
    merge_disk: bool,
) -> Result<(), AppError> {
    if state.incognito() {
        return Ok(());
    }
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
    let list = project_conversation_list(&mut convs, proj_path);
    let kind = state
        .conversation_kind
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .unwrap_or_else(|| "chat".to_string());
    if let Some(existing) = list.iter_mut().find(|c| c.id == id) {
        existing.history = history;
        existing.title = title;
        existing.timestamp = now_f64();
        let (locked, anchor) = state.title_meta();
        existing.title_locked = locked;
        existing.title_anchor_turns = anchor;
        if existing.kind.trim().is_empty() || existing.kind == "chat" || existing.kind == "multiwork"
        {
            existing.kind = if kind == "multiwork" {
                "chat".to_string()
            } else {
                kind
            };
        }
        collapse_duplicate_assistants(&mut existing.history);
    } else {
        let (locked, anchor) = state.title_meta();
        list.push(Conversation {
            id,
            title,
            history,
            project_path: proj_path.to_string(),
            timestamp: now_f64(),
            title_locked: locked,
            title_anchor_turns: anchor,
            archived: false,
            kind,
        });
        if let Some(last) = list.last_mut() {
            collapse_duplicate_assistants(&mut last.history);
        }
    }

    if merge_disk {
        save_conversations(proj_path, list);
    } else {
        save_conversations_checkpoint(proj_path, list);
    }
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
    let list = project_conversation_list(&mut convs, proj_path);
    if let Some(existing) = list.iter_mut().find(|c| c.id == id) {
        existing.history = history;
        existing.title = title.to_string();
        existing.timestamp = now_f64();
        collapse_duplicate_assistants(&mut existing.history);
    } else {
        list.push(Conversation {
            id: id.to_string(),
            title: title.to_string(),
            history,
            project_path: proj_path.to_string(),
            timestamp: now_f64(),
            title_locked: false,
            title_anchor_turns: 0,
            archived: false,
            kind: "chat".to_string(),
        });
        if let Some(last) = list.last_mut() {
            collapse_duplicate_assistants(&mut last.history);
        }
    }
    save_conversations(proj_path, list);
    Ok(())
}

/// One assistant bubble per user turn. Mid-stream snapshots already store a
/// partial assistant; finishing the turn must replace it, not append.
pub fn replace_or_push_assistant(hist: &mut Vec<ChatMessage>, msg: ChatMessage) {
    if hist.last().is_some_and(|m| m.role == "assistant") {
        hist.pop();
    }
    hist.push(msg);
}

/// Drop consecutive assistant messages left by snapshot-then-append races.
pub fn collapse_duplicate_assistants(hist: &mut Vec<ChatMessage>) {
    let mut i = 1;
    while i < hist.len() {
        let prev_assistant = hist[i - 1].role == "assistant";
        let this_assistant = hist[i].role == "assistant";
        if prev_assistant && this_assistant {
            let prev = &hist[i - 1].content;
            let this = &hist[i].content;
            let overlap = prev == this
                || (!prev.is_empty() && this.starts_with(prev))
                || (!this.is_empty() && prev.starts_with(this));
            if overlap {
                if this.len() >= prev.len() {
                    hist.remove(i - 1);
                } else {
                    hist.remove(i);
                }
                continue;
            }
        }
        i += 1;
    }
}

/// Load disk history before mutating so a cold in-memory cache cannot overwrite
/// every other chat in the project file.
fn project_conversation_list<'a>(
    convs: &'a mut std::collections::HashMap<String, Vec<Conversation>>,
    proj_path: &str,
) -> &'a mut Vec<Conversation> {
    let list = convs
        .entry(proj_path.to_string())
        .or_insert_with(|| load_conversations(proj_path));
    if list.is_empty() {
        let disk = load_conversations(proj_path);
        if !disk.is_empty() {
            *list = disk;
        }
    }
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.to_string(),
            content: content.to_string(),
            timestamp: 0.0,
            stats: None,
            model: None,
            feedback: None,
            hidden: false,
        }
    }

    #[test]
    fn replace_or_push_replaces_partial_assistant() {
        let mut hist = vec![msg("user", "hi"), msg("assistant", "Hel")];
        replace_or_push_assistant(&mut hist, msg("assistant", "Hello world"));
        assert_eq!(hist.len(), 2);
        assert_eq!(hist[1].content, "Hello world");
    }

    #[test]
    fn collapse_keeps_final_when_partial_then_full() {
        let mut hist = vec![
            msg("user", "hi"),
            msg("assistant", "Hel"),
            msg("assistant", "Hello world"),
        ];
        collapse_duplicate_assistants(&mut hist);
        assert_eq!(hist.len(), 2);
        assert_eq!(hist[1].content, "Hello world");
    }
}
