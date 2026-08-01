use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Text,
    Diff,
}

impl Default for FileKind {
    fn default() -> Self {
        Self::Text
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiffMetadata {
    pub staged: bool,
    #[serde(default)]
    pub commit_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Diagnostic {
    pub message: String,
    pub severity: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    #[serde(default)]
    pub is_dirty: bool,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub kind: FileKind,
    pub diff_metadata: Option<DiffMetadata>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectState {
    pub project_path: Option<String>,
    pub open_files: Vec<FileInfo>,
    pub active_file: Option<String>,
    #[serde(default)]
    pub diagnostics: HashMap<String, Vec<Diagnostic>>,
    #[serde(default)]
    pub color_history: Vec<String>,
}

pub struct AppState(pub Mutex<ProjectState>);

impl AppState {
    pub fn new() -> Self {
        Self(Mutex::new(ProjectState {
            project_path: None,
            open_files: Vec::new(),
            active_file: None,
            diagnostics: HashMap::new(),
            color_history: Vec::new(),
        }))
    }
}
