use std::collections::{HashMap, HashSet};
use std::sync::{LazyLock, Mutex};

use serde_json::json;
use tauri::{AppHandle, Emitter};

static ACTIVE: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));
static PENDING: LazyLock<Mutex<HashMap<String, Vec<String>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static WAKING: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

fn is_parent_chat(id: &str) -> bool {
    !id.is_empty() && !id.starts_with("mw-worker-") && !id.starts_with("sub-run-")
}

pub fn set_parent_turn_active(conversation_id: Option<&str>, active: bool) {
    let Some(id) = conversation_id.filter(|s| is_parent_chat(s)) else {
        return;
    };
    if let Ok(mut g) = ACTIVE.lock() {
        if active {
            g.insert(id.to_string());
        } else {
            g.remove(id);
        }
    }
}

pub fn parent_turn_active(conversation_id: &str) -> bool {
    ACTIVE
        .lock()
        .ok()
        .map(|g| g.contains(conversation_id))
        .unwrap_or(false)
}

pub fn enqueue_parent_message(conversation_id: &str, text: String) {
    if !is_parent_chat(conversation_id) {
        return;
    }
    if let Ok(mut g) = PENDING.lock() {
        g.entry(conversation_id.to_string()).or_default().push(text);
    }
}

pub fn take_pending(conversation_id: &str) -> Vec<String> {
    PENDING
        .lock()
        .ok()
        .and_then(|mut g| g.remove(conversation_id))
        .unwrap_or_default()
}

/// Queue an update and, if the parent is idle, emit `parent_resume` so the UI starts the next boss turn.
pub fn notify_parent_finished(app: &AppHandle, conversation_id: Option<&str>, text: String) {
    let Some(id) = conversation_id.filter(|s| is_parent_chat(s)) else {
        return;
    };
    enqueue_parent_message(id, text);
    if parent_turn_active(id) {
        return;
    }
    schedule_wake(app.clone(), id.to_string());
}

pub fn schedule_wake_if_idle(app: &AppHandle, conversation_id: Option<&str>) {
    let Some(id) = conversation_id.filter(|s| is_parent_chat(s)) else {
        return;
    };
    if parent_turn_active(id) {
        return;
    }
    let pending_empty = PENDING
        .lock()
        .ok()
        .map(|g| g.get(id).map(|v| v.is_empty()).unwrap_or(true))
        .unwrap_or(true);
    if pending_empty {
        return;
    }
    schedule_wake(app.clone(), id.to_string());
}

fn schedule_wake(app: AppHandle, id: String) {
    {
        let Ok(mut waking) = WAKING.lock() else {
            return;
        };
        if !waking.insert(id.clone()) {
            return;
        }
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
        if parent_turn_active(&id) {
            if let Ok(mut waking) = WAKING.lock() {
                waking.remove(&id);
            }
            return;
        }
        let updates = take_pending(&id);
        if let Ok(mut waking) = WAKING.lock() {
            waking.remove(&id);
        }
        if updates.is_empty() {
            return;
        }
        let body = format!(
            "<subagent_update>\n{}\n</subagent_update>\nIncorporate this result and keep working. Do not wait for more workers unless you need their output.",
            updates.join("\n\n")
        );
        let _ = app.emit(
            "parent_resume",
            json!({
                "conversationId": id,
                "message": body,
            }),
        );
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reset() {
        ACTIVE.lock().unwrap().clear();
        PENDING.lock().unwrap().clear();
        WAKING.lock().unwrap().clear();
    }

    #[test]
    fn queues_while_parent_turn_is_active() {
        reset();
        set_parent_turn_active(Some("abc"), true);
        enqueue_parent_message("abc", "done".into());
        assert!(parent_turn_active("abc"));
        assert_eq!(take_pending("abc"), vec!["done".to_string()]);
        set_parent_turn_active(Some("abc"), false);
        assert!(!parent_turn_active("abc"));
    }

    #[test]
    fn ignores_worker_conversation_ids() {
        reset();
        enqueue_parent_message("mw-worker-1", "x".into());
        enqueue_parent_message("sub-run-9", "y".into());
        assert!(take_pending("mw-worker-1").is_empty());
        assert!(take_pending("sub-run-9").is_empty());
    }

    #[test]
    fn coalesces_multiple_updates() {
        reset();
        enqueue_parent_message("boss", "one".into());
        enqueue_parent_message("boss", "two".into());
        let got = take_pending("boss");
        assert_eq!(got, vec!["one".to_string(), "two".to_string()]);
        assert!(take_pending("boss").is_empty());
    }
}
