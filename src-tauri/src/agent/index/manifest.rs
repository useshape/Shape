use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

/// Bump when index.bin can no longer be read. A mismatch forces a local rebuild.
pub const INDEX_FORMAT: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IndexManifest {
    pub files: HashMap<String, u64>,
    pub last_indexed_at: Option<f64>,
    #[serde(default)]
    pub format: u32,
    #[serde(default)]
    pub next_remote_id: u32,
    /// True until the website has accepted one full upload of the current ids.
    #[serde(default)]
    pub needs_full_sync: bool,
}

impl IndexManifest {
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self).unwrap_or_else(|_| "{}".to_string());
        std::fs::write(path, json)
    }
}
