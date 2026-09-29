//! Local media stash under app data so generated/attached files are reusable without re-download.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

static INDEX: LazyLock<Mutex<HashMap<String, MediaEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaEntry {
    pub id: String,
    pub path: String,
    pub mime: String,
    pub kind: String,
    pub prompt: Option<String>,
    pub conversation_id: Option<String>,
    pub name: Option<String>,
}

fn app_data_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("Shape").join("media"))
}

fn ensure_dir(conversation_id: Option<&str>) -> Result<PathBuf, String> {
    let base = app_data_dir().ok_or_else(|| "Could not resolve app data directory.".to_string())?;
    let dir = match conversation_id.filter(|s| !s.is_empty()) {
        Some(cid) => base.join(cid),
        None => base.join("_shared"),
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn ext_for(mime: &str, kind: &str) -> &'static str {
    let m = mime.to_ascii_lowercase();
    if m.contains("svg") || kind == "svg" {
        "svg"
    } else if m.contains("png") {
        "png"
    } else if m.contains("jpeg") || m.contains("jpg") {
        "jpg"
    } else if m.contains("webp") {
        "webp"
    } else if m.contains("mpeg") || m.contains("mp3") || kind == "audio" {
        "mp3"
    } else if m.contains("wav") {
        "wav"
    } else if kind == "audio" {
        "mp3"
    } else {
        "bin"
    }
}

pub fn stash_bytes(
    bytes: &[u8],
    mime: &str,
    kind: &str,
    conversation_id: Option<&str>,
    prompt: Option<&str>,
    name: Option<&str>,
) -> Result<MediaEntry, String> {
    let dir = ensure_dir(conversation_id)?;
    let id = Uuid::new_v4().to_string();
    let ext = ext_for(mime, kind);
    let path = dir.join(format!("{id}.{ext}"));
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let entry = MediaEntry {
        id: id.clone(),
        path: path.to_string_lossy().into_owned(),
        mime: mime.to_string(),
        kind: kind.to_string(),
        prompt: prompt.map(|s| s.to_string()),
        conversation_id: conversation_id.map(|s| s.to_string()),
        name: name.map(|s| s.to_string()),
    };
    if let Ok(mut guard) = INDEX.lock() {
        guard.insert(id, entry.clone());
    }
    Ok(entry)
}

pub fn stash_data_url(
    data_url: &str,
    kind: &str,
    conversation_id: Option<&str>,
    prompt: Option<&str>,
    name: Option<&str>,
) -> Result<MediaEntry, String> {
    let (mime, bytes) = decode_data_url(data_url)?;
    stash_bytes(&bytes, &mime, kind, conversation_id, prompt, name)
}

pub fn get(id: &str) -> Option<MediaEntry> {
    INDEX.lock().ok().and_then(|g| g.get(id).cloned())
}

pub fn read_bytes(id: &str) -> Result<Vec<u8>, String> {
    let entry = get(id).ok_or_else(|| format!("Unknown media_id '{id}'."))?;
    fs::read(&entry.path).map_err(|e| e.to_string())
}

pub fn find_by_name(name: &str) -> Option<MediaEntry> {
    let needle = name.to_ascii_lowercase();
    INDEX.lock().ok().and_then(|g| {
        g.values()
            .find(|e| {
                e.name
                    .as_deref()
                    .map(|n| n.eq_ignore_ascii_case(&needle))
                    .unwrap_or(false)
                    || Path::new(&e.path)
                        .file_name()
                        .and_then(|f| f.to_str())
                        .map(|f| f.eq_ignore_ascii_case(&needle))
                        .unwrap_or(false)
            })
            .cloned()
    })
}

pub fn decode_data_url(data_url: &str) -> Result<(String, Vec<u8>), String> {
    let rest = data_url
        .strip_prefix("data:")
        .ok_or_else(|| "Expected a data: URL.".to_string())?;
    let (meta, b64) = rest
        .split_once(',')
        .ok_or_else(|| "Malformed data: URL.".to_string())?;
    let mime = meta
        .split(';')
        .next()
        .unwrap_or("application/octet-stream")
        .to_string();
    if !meta.contains(";base64") {
        return Err("Only base64 data: URLs are supported.".to_string());
    }
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|e| e.to_string())?;
    Ok((mime, bytes))
}
