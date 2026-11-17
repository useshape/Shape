//! Ephemeral agent files (scripts, plots) live here, not in the user's repo.

use std::fs;
use std::path::{Path, PathBuf};

use crate::core::error::AppError;

pub fn shape_data_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("Shape"))
}

pub fn scratch_root() -> Option<PathBuf> {
    shape_data_dir().map(|d| d.join("scratch"))
}

fn sanitize_id(id: &str) -> String {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return "default".to_string();
    }
    trimmed
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .take(80)
        .collect()
}

pub fn ensure_for(conversation_id: &str) -> Option<PathBuf> {
    let dir = scratch_root()?.join(sanitize_id(conversation_id));
    fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

pub fn is_under_scratch(path: &Path) -> bool {
    let Some(root) = scratch_root() else {
        return false;
    };
    let root = root.canonicalize().unwrap_or(root);
    let resolved = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    resolved.starts_with(&root)
}

fn remove_dir_if_exists(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }
    fs::remove_dir_all(path).is_ok()
}

/// Wipe ephemeral on-disk caches. Does not delete chat transcripts.
#[tauri::command]
pub fn clear_shape_local_data() -> Result<Vec<String>, AppError> {
    let mut cleared = Vec::new();
    if let Some(root) = scratch_root() {
        if remove_dir_if_exists(&root) {
            cleared.push("Agent scratch".to_string());
        }
    }
    if let Some(media) = shape_data_dir().map(|d| d.join("media")) {
        if remove_dir_if_exists(&media) {
            cleared.push("Generated media".to_string());
        }
    }
    if let Some(work) = shape_data_dir().map(|d| d.join("chat-work")) {
        if remove_dir_if_exists(&work) {
            cleared.push("Chat work files".to_string());
        }
    }
    if let Some(index) = dirs::data_dir().map(|d| d.join("shape-index")) {
        if remove_dir_if_exists(&index) {
            cleared.push("Codebase index".to_string());
        }
    }
    Ok(cleared)
}
