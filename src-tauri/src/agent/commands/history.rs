/// Conversation persistence: save/load/manage chat history to disk.

use std::time::{SystemTime, UNIX_EPOCH};
use crate::core::error::AppError;
use super::super::models::{AgentState, ChatMessage, Conversation};
use super::logging;

/// Sentinel store for Chat / Cowork conversations (not tied to a coding folder).
pub const TALK_STORE: &str = "__shape_talk__";

pub fn now_f64() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs_f64()
}

pub fn is_talk_store(path: &str) -> bool {
    normalize_project_path(path) == TALK_STORE
}

/// Per-conversation folder for Chat files and shell. Outside any open code project.
pub fn chat_work_dir(conversation_id: &str) -> String {
    let id: String = conversation_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(80)
        .collect();
    let id = if id.is_empty() { "chat".to_string() } else { id };
    let root = dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("Shape")
        .join("chat-work")
        .join(id);
    let _ = std::fs::create_dir_all(&root);
    root.to_string_lossy().to_string()
}

pub fn is_chat_work_dir(path: &str) -> bool {
    path.replace('\\', "/").to_ascii_lowercase().contains("/shape/chat-work/")
}

pub fn conversation_store(talk: bool, project: Option<&str>) -> String {
    if talk {
        TALK_STORE.to_string()
    } else {
        project.unwrap_or(TALK_STORE).to_string()
    }
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
        if let Ok(mut convs) = serde_json::from_str::<Vec<Conversation>>(&content) {
            for conv in &mut convs {
                for msg in &mut conv.history {
                    if msg.role == "assistant" {
                        msg.content = crate::agent::tools::browse::scrub_transcript_screenshots(
                            &msg.content,
                        );
                        msg.content = interrupt_stale_thread_refs(&msg.content);
                    }
                }
            }
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

fn history_write_lock() -> &'static std::sync::Mutex<()> {
    static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| std::sync::Mutex::new(()))
}

fn save_conversations_inner(proj_path: &str, convs: &[Conversation], removed: &[&str], merge_disk: bool) {
    let file_path = get_chat_history_path(proj_path);
    let _guard = history_write_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
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

/// Load this project's conversation list from disk if the in-memory map is empty.
/// Runs the file read without holding `conversations`, so tab switches are not
/// blocked behind a history write.
pub fn hydrate_project_conversations(state: &AgentState, proj_path: &str) {
    let needs_disk = state
        .conversations
        .lock()
        .ok()
        .map(|convs| convs.get(proj_path).map(|list| list.is_empty()).unwrap_or(true))
        .unwrap_or(true);
    if !needs_disk {
        return;
    }
    let disk = load_conversations(proj_path);
    if disk.is_empty() {
        return;
    }
    if let Ok(mut convs) = state.conversations.lock() {
        let list = convs.entry(proj_path.to_string()).or_default();
        if list.is_empty() {
            *list = disk;
        }
    }
}

/// Copy the live transcript into the in-memory map. Does not touch disk.
pub fn stash_live_conversation(state: &AgentState, proj_path: &str) -> Result<(), AppError> {
    if state.incognito() {
        return Ok(());
    }
    hydrate_project_conversations(state, proj_path);
    let history = state.history_for_persistence()?;
    let title = state.title.lock()?.clone();
    if history.is_empty() && title.is_none() {
        return Ok(());
    }
    let title = title.unwrap_or_else(|| provisional_title(&history));
    let id = {
        let mut conv_id_guard = state.current_conversation_id.lock()?;
        let id = conv_id_guard
            .clone()
            .unwrap_or_else(|| format!("{}", now_f64() as u64));
        *conv_id_guard = Some(id.clone());
        id
    };
    let kind = state
        .conversation_kind
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .unwrap_or_else(|| "chat".to_string());
    let (locked, anchor) = state.title_meta();
    let mut convs = state.conversations.lock()?;
    let list = project_conversation_list(&mut convs, proj_path);
    if let Some(existing) = list.iter_mut().find(|c| c.id == id) {
        // A tab switch can run while the live buffer is still empty. Do not
        // replace a saved transcript with that blank buffer.
        if history.is_empty() && !existing.history.is_empty() {
            return Ok(());
        }
        existing.history = history;
        existing.title = title;
        existing.timestamp = now_f64();
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
            parent_id: None,
        });
        if let Some(last) = list.last_mut() {
            collapse_duplicate_assistants(&mut last.history);
        }
    }
    Ok(())
}

fn snapshot_project_list(state: &AgentState, proj_path: &str) -> Vec<Conversation> {
    state
        .conversations
        .lock()
        .ok()
        .and_then(|convs| convs.get(proj_path).cloned())
        .unwrap_or_default()
}

fn save_current_conversation_inner(
    state: &AgentState,
    proj_path: &str,
    merge_disk: bool,
) -> Result<(), AppError> {
    hydrate_project_conversations(state, proj_path);
    stash_live_conversation(state, proj_path)?;
    let list = snapshot_project_list(state, proj_path);
    if merge_disk {
        save_conversations(proj_path, &list);
    } else {
        save_conversations_checkpoint(proj_path, &list);
    }
    logging::debug("history", "Current conversation saved");
    Ok(())
}

fn provisional_title(history: &[ChatMessage]) -> String {
    let Some(user) = history.iter().find(|m| m.role == "user") else {
        return "Untitled".to_string();
    };
    let line = user
        .content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("Untitled");
    let clipped: String = line.chars().take(48).collect();
    if clipped.is_empty() {
        "Untitled".to_string()
    } else {
        clipped
    }
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
    hydrate_project_conversations(state, proj_path);
    let snapshot = {
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
                parent_id: None,
            });
            if let Some(last) = list.last_mut() {
                collapse_duplicate_assistants(&mut last.history);
            }
        }
        list.clone()
    };
    save_conversations(proj_path, &snapshot);
    Ok(())
}

pub fn upsert_thread_conversation(
    state: &AgentState,
    proj_path: &str,
    id: &str,
    title: &str,
    parent_id: &str,
    history: Vec<ChatMessage>,
) -> Result<(), AppError> {
    hydrate_project_conversations(state, proj_path);
    let snapshot = {
        let mut convs = state.conversations.lock()?;
        let list = project_conversation_list(&mut convs, proj_path);
        if let Some(existing) = list.iter_mut().find(|c| c.id == id) {
            existing.history = history;
            existing.title = title.to_string();
            existing.timestamp = now_f64();
            existing.kind = "thread".to_string();
            existing.parent_id = Some(parent_id.to_string());
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
                kind: "thread".to_string(),
                parent_id: Some(parent_id.to_string()),
            });
        }
        list.clone()
    };
    save_conversations(proj_path, &snapshot);
    Ok(())
}

/// Patch `<subagent_ref status="running">` in the parent transcript to a terminal status.
pub fn patch_subagent_ref_status(
    state: &AgentState,
    proj_path: &str,
    parent_id: &str,
    thread_id: &str,
    status: &str,
) {
    let needle = format!("id=\"{}\"", thread_id);
    let current_id = state
        .current_conversation_id
        .lock()
        .ok()
        .and_then(|g| g.clone());
    if current_id.as_deref() == Some(parent_id) {
        if let Ok(mut hist) = state.history.lock() {
            for msg in hist.iter_mut().rev() {
                if msg.role == "assistant" && msg.content.contains(&needle) {
                    msg.content = rewrite_subagent_ref_status(&msg.content, thread_id, status);
                    break;
                }
            }
        }
        let _ = save_current_conversation(state, proj_path);
        return;
    }
    let snapshot = {
        let Ok(mut convs) = state.conversations.lock() else {
            return;
        };
        let list = project_conversation_list(&mut convs, proj_path);
        let Some(existing) = list.iter_mut().find(|c| c.id == parent_id) else {
            return;
        };
        for msg in existing.history.iter_mut().rev() {
            if msg.role == "assistant" && msg.content.contains(&needle) {
                msg.content = rewrite_subagent_ref_status(&msg.content, thread_id, status);
                break;
            }
        }
        existing.timestamp = now_f64();
        list.clone()
    };
    save_conversations(proj_path, &snapshot);
}

fn interrupt_stale_thread_refs(content: &str) -> String {
    let mut out = content.to_string();
    let mut search_from = 0usize;
    while let Some(tag_rel) = out[search_from..].find("<subagent_ref") {
        let tag_start = search_from + tag_rel;
        let Some(tag_end_rel) = out[tag_start..].find("/>") else {
            break;
        };
        let tag_end = tag_start + tag_end_rel + 2;
        let tag = out[tag_start..tag_end].to_string();
        if tag.contains("status=\"running\"") {
            if let Some(id_at) = tag.find("id=\"") {
                let start = id_at + 4;
                if let Some(end) = tag[start..].find('"') {
                    let id = tag[start..start + end].to_string();
                    if !id.is_empty() && !crate::agent::subagents::is_live(&id) {
                        out = rewrite_subagent_ref_status(&out, &id, "error");
                        search_from = 0;
                        continue;
                    }
                }
            }
        }
        search_from = tag_end;
    }
    out
}

pub(crate) fn rewrite_subagent_ref_status(content: &str, thread_id: &str, status: &str) -> String {
    let marker = format!("id=\"{}\"", thread_id);
    let Some(id_at) = content.rfind(&marker) else {
        return content.to_string();
    };
    let Some(tag_start) = content[..id_at].rfind("<subagent_ref") else {
        return content.to_string();
    };
    let rest = &content[tag_start..];
    let Some(tag_end_rel) = rest.find("/>") else {
        return content.to_string();
    };
    let tag_end = tag_start + tag_end_rel + 2;
    let tag = &content[tag_start..tag_end];
    let updated = if let Some(status_at) = tag.find("status=\"") {
        let value_start = status_at + 8;
        if let Some(value_end) = tag[value_start..].find('"') {
            let mut next = tag.to_string();
            next.replace_range(value_start..value_start + value_end, status);
            next
        } else {
            tag.to_string()
        }
    } else {
        tag.trim_end_matches("/>").to_string() + &format!(" status=\"{}\" />", status)
    };
    let mut out = content.to_string();
    out.replace_range(tag_start..tag_end, &updated);
    out
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
pub(crate) fn project_conversation_list<'a>(
    convs: &'a mut std::collections::HashMap<String, Vec<Conversation>>,
    proj_path: &str,
) -> &'a mut Vec<Conversation> {
    convs.entry(proj_path.to_string()).or_default()
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
    fn provisional_title_uses_first_user_line() {
        let history = vec![msg("user", "Fix the login timeout\nmore")];
        assert_eq!(provisional_title(&history), "Fix the login timeout");
    }

    #[test]
    fn concurrent_saves_do_not_sleep_the_caller() {
        let path = format!("shape-hist-{}", uuid::Uuid::new_v4());
        let started = std::time::Instant::now();
        std::thread::scope(|scope| {
            for i in 0..4 {
                let path = path.clone();
                scope.spawn(move || {
                    let state = AgentState::new();
                    *state.history.lock().unwrap() = vec![msg("user", &format!("hello {i}"))];
                    *state.current_conversation_id.lock().unwrap() = Some(format!("conv-{i}"));
                    save_current_conversation(&state, &path).unwrap();
                });
            }
        });
        let _ = std::fs::remove_file(get_chat_history_path(&path));
        assert!(
            started.elapsed() < std::time::Duration::from_millis(800),
            "history save contended for {:?}",
            started.elapsed()
        );
    }

    #[test]
    fn saves_user_only_history_without_title() {
        let state = AgentState::new();
        *state.history.lock().unwrap() = vec![msg("user", "hello world")];
        *state.current_conversation_id.lock().unwrap() = Some("conv-user-only".into());
        let path = format!("shape-hist-{}", uuid::Uuid::new_v4());
        save_current_conversation(&state, &path).unwrap();
        let loaded = load_conversations(&path);
        let _ = std::fs::remove_file(get_chat_history_path(&path));
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].history.len(), 1);
        assert_eq!(loaded[0].history[0].content, "hello world");
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

    #[test]
    fn patches_running_subagent_ref_to_done() {
        let content = "Hello\n<subagent_ref id=\"thread-abc\" agent=\"Scan\" task=\"find\" status=\"running\" />\n";
        let next = rewrite_subagent_ref_status(content, "thread-abc", "done");
        assert!(next.contains("status=\"done\""));
        assert!(!next.contains("status=\"running\""));
    }
}
