mod engine;

use crate::core::error::AppError;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;

use self::engine::{OutlineEngine, ParseRequest};

#[derive(Debug, Clone, Copy)]
pub enum SymbolKind {
    Function,
    Class,
    Interface,
    Type,
    Enum,
    Constant,
    Variable,
    Method,
    Property,
    Field,
    Heading,
    Selector,
}

impl SymbolKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Function => "Function",
            Self::Class => "Class",
            Self::Interface => "Interface",
            Self::Type => "Type",
            Self::Enum => "Enum",
            Self::Constant => "Constant",
            Self::Variable => "Variable",
            Self::Method => "Method",
            Self::Property => "Property",
            Self::Field => "Field",
            Self::Heading => "Heading",
            Self::Selector => "Selector",
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct OutlineSymbol {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub start_line: usize,
    pub start_col: usize,
    pub end_line: usize,
    pub end_col: usize,
    pub children: Vec<OutlineSymbol>,
}

#[derive(Debug, Serialize, Clone)]
pub struct OutlineResponse {
    pub symbols: Vec<OutlineSymbol>,
    pub total_symbols: usize,
    pub truncated: bool,
    pub version: u64,
}

static OUTLINE_ENGINE: OnceLock<Mutex<OutlineEngine>> = OnceLock::new();

fn outline_engine() -> &'static Mutex<OutlineEngine> {
    OUTLINE_ENGINE.get_or_init(|| Mutex::new(OutlineEngine::default()))
}

pub async fn get_outline(
    file_path: String,
    content: String,
    extension: String,
    version: u64,
) -> Result<OutlineResponse, AppError> {
    let parse_result = tauri::async_runtime::spawn_blocking(move || {
        let mut engine = outline_engine()
            .lock()
            .map_err(|e| AppError::Poison(e.to_string()))?;
        engine.parse_document(ParseRequest {
            file_path,
            content,
            extension,
        })
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))??;

    Ok(OutlineResponse {
        symbols: parse_result.symbols,
        total_symbols: parse_result.total_symbols,
        truncated: parse_result.truncated,
        version,
    })
}
