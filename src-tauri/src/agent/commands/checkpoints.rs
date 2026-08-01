/// File checkpoint persistence: mirrors `history.rs`'s conversation persistence so
/// pre-edit file snapshots survive app restarts and conversation switches.
use super::super::models::TurnCheckpoint;
use super::logging;

fn sanitize_id(id: &str) -> String {
    id.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

pub fn get_checkpoints_path(conversation_id: &str) -> std::path::PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("Shape");
    path.push("checkpoints");
    let _ = std::fs::create_dir_all(&path);
    path.push(format!("{}.json", sanitize_id(conversation_id)));
    path
}

pub fn load_checkpoints(conversation_id: &str) -> Vec<TurnCheckpoint> {
    if conversation_id.is_empty() {
        return Vec::new();
    }
    let file_path = get_checkpoints_path(conversation_id);
    if let Ok(content) = std::fs::read_to_string(&file_path) {
        if let Ok(checkpoints) = serde_json::from_str(&content) {
            return checkpoints;
        }
        logging::warn("checkpoints", "Failed to parse checkpoint file, returning empty");
    }
    Vec::new()
}

pub fn save_checkpoints(conversation_id: &str, checkpoints: &[TurnCheckpoint]) {
    if conversation_id.is_empty() {
        return;
    }
    let file_path = get_checkpoints_path(conversation_id);
    if checkpoints.is_empty() {
        let _ = std::fs::remove_file(&file_path);
        return;
    }
    if let Ok(content) = serde_json::to_string(checkpoints) {
        let _ = std::fs::write(&file_path, content);
    } else {
        logging::error("checkpoints", "Failed to serialize checkpoints");
    }
}

pub fn delete_checkpoints(conversation_id: &str) {
    if conversation_id.is_empty() {
        return;
    }
    let _ = std::fs::remove_file(get_checkpoints_path(conversation_id));
}
