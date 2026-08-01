/// Durable turn journals so interrupted work can be inspected after restart.
use serde::{Deserialize, Serialize};
use super::logging;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnJournal {
    pub conversation_id: String,
    pub turn_id: String,
    pub project_path: Option<String>,
    pub status: String,
    pub updated_at: f64,
    #[serde(default)]
    pub subagent_ids: Vec<String>,
    pub note: Option<String>,
}

fn sanitize_id(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn journals_root() -> std::path::PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("Shape");
    path.push("journals");
    let _ = std::fs::create_dir_all(&path);
    path
}

fn turn_path(conversation_id: &str, turn_id: &str) -> std::path::PathBuf {
    let mut path = journals_root();
    path.push(format!(
        "turn_{}_{}.json",
        sanitize_id(conversation_id),
        sanitize_id(turn_id)
    ));
    path
}

pub fn save_turn_journal(journal: &TurnJournal) {
    if journal.conversation_id.is_empty() || journal.turn_id.is_empty() {
        return;
    }
    let path = turn_path(&journal.conversation_id, &journal.turn_id);
    if let Ok(content) = serde_json::to_string(journal) {
        let _ = std::fs::write(path, content);
    } else {
        logging::error("journals", "Failed to serialize turn journal");
    }
}

pub fn clear_turn_journal(conversation_id: &str, turn_id: &str) {
    if conversation_id.is_empty() || turn_id.is_empty() {
        return;
    }
    let _ = std::fs::remove_file(turn_path(conversation_id, turn_id));
}

pub fn load_turn_journal(conversation_id: &str, turn_id: &str) -> Option<TurnJournal> {
    let content = std::fs::read_to_string(turn_path(conversation_id, turn_id)).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn list_open_turn_journals() -> Vec<TurnJournal> {
    let root = journals_root();
    let Ok(entries) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("turn_") || !name.ends_with(".json") {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(entry.path()) {
            if let Ok(j) = serde_json::from_str::<TurnJournal>(&content) {
                if j.status == "running" || j.status == "interrupted" {
                    out.push(j);
                }
            }
        }
    }
    out.sort_by(|a, b| b.updated_at.partial_cmp(&a.updated_at).unwrap_or(std::cmp::Ordering::Equal));
    out
}
