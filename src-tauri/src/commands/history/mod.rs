use crate::core::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub timestamp: i64,
    pub label: String,
    pub size: usize,
}

fn history_root() -> Result<PathBuf, AppError> {
    let base = dirs::data_dir()
        .ok_or_else(|| AppError::Message("Could not resolve data directory".to_string()))?;
    Ok(base.join("shape").join("local-history"))
}

fn hash_key(input: &str) -> String {
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn file_history_dir(project_path: &str, file_path: &str) -> Result<PathBuf, AppError> {
    let project_key = hash_key(project_path);
    let rel = normalize_relative(project_path, file_path);
    let file_key = hash_key(&rel);
    Ok(history_root()?.join(project_key).join(file_key))
}

fn normalize_relative(project_path: &str, file_path: &str) -> String {
    let project = Path::new(project_path);
    let file = Path::new(file_path);
    file.strip_prefix(project)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| file_path.replace('\\', "/"))
}

pub fn save_history_version(
    project_path: &str,
    file_path: &str,
    content: &str,
) -> Result<(), AppError> {
    if file_path.starts_with("shape://") {
        return Ok(());
    }

    let dir = file_history_dir(project_path, file_path)?;
    fs::create_dir_all(&dir).map_err(AppError::Io)?;

    let timestamp = chrono_like_timestamp();
    let id = format!("{}", timestamp);
    let entry_path = dir.join(format!("{}.json", id));

    let entry = serde_json::json!({
        "id": id,
        "timestamp": timestamp,
        "label": format!("Save at {}", format_timestamp(timestamp)),
        "content": content,
    });

    let serialized = serde_json::to_string_pretty(&entry)
        .map_err(|e| AppError::Message(format!("Failed to serialize history: {}", e)))?;
    fs::write(&entry_path, serialized).map_err(AppError::Io)?;

    trim_history_versions(&dir, 50)?;
    Ok(())
}

fn trim_history_versions(dir: &Path, max: usize) -> Result<(), AppError> {
    let mut entries: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(AppError::Io)?
        .filter_map(|e| e.ok().map(|d| d.path()))
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();

    entries.sort_by_key(|p| p.metadata().and_then(|m| m.modified()).ok());

    if entries.len() > max {
        for path in entries.iter().take(entries.len() - max) {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

pub fn get_file_history(project_path: &str, file_path: &str) -> Result<Vec<HistoryEntry>, AppError> {
    if file_path.starts_with("shape://") {
        return Ok(vec![]);
    }

    let dir = file_history_dir(project_path, file_path)?;
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<HistoryEntry> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(AppError::Io)?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let raw = fs::read_to_string(&path).map_err(AppError::Io)?;
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) {
            let content_len = parsed
                .get("content")
                .and_then(|c| c.as_str())
                .map(|s| s.len())
                .unwrap_or(0);
            entries.push(HistoryEntry {
                id: parsed
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                timestamp: parsed
                    .get("timestamp")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
                label: parsed
                    .get("label")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Version")
                    .to_string(),
                size: content_len,
            });
        }
    }

    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(entries)
}

pub fn restore_history_version(
    project_path: &str,
    file_path: &str,
    version_id: &str,
) -> Result<String, AppError> {
    let dir = file_history_dir(project_path, file_path)?;
    let entry_path = dir.join(format!("{}.json", version_id));
    if !entry_path.exists() {
        return Err(AppError::Message("History version not found".to_string()));
    }

    let raw = fs::read_to_string(&entry_path).map_err(AppError::Io)?;
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| AppError::Message(format!("Invalid history entry: {}", e)))?;

    parsed
        .get("content")
        .and_then(|c| c.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::Message("History entry missing content".to_string()))
}

fn chrono_like_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn format_timestamp(ts: i64) -> String {
    // Simple ISO-like formatting without chrono dependency
    let secs = ts;
    let days = secs / 86400;
    let rem = secs % 86400;
    let hours = rem / 3600;
    let mins = (rem % 3600) / 60;
    let secs = rem % 60;
    format!("1970-01-{:02} {:02}:{:02}:{:02}", 1 + days, hours, mins, secs)
}
