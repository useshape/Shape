//! Server-side embeddings via Shape website API (OpenRouter on the server).

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Debug, Clone, Default)]
pub struct ApiContext {
    pub token: Option<String>,
    pub turn_id: Option<String>,
    pub conversation_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EmbeddingStore {
    pub enabled: bool,
    pub server_vectors: usize,
}

#[derive(Debug, Clone)]
pub struct RemoteSearchHit {
    pub file: String,
    pub start_line: usize,
    pub end_line: usize,
    /// Kept for parity with the server response; ranking uses RRF position instead.
    #[allow(dead_code)]
    pub score: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncChunkPayload {
    pub chunk_index: usize,
    pub file_path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncBody {
    project_key: String,
    full_replace: bool,
    chunks: Vec<SyncChunkPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncResponse {
    #[allow(dead_code)]
    chunk_count: usize,
    vectors: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchBody {
    project_key: String,
    query: String,
    top_k: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchHitJson {
    file_path: String,
    start_line: usize,
    end_line: usize,
    score: f64,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    hits: Vec<SearchHitJson>,
}

pub fn project_key(project_path: &str) -> String {
    let mut hash: u64 = 5381;
    for b in project_path.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(b as u64);
    }
    format!("{:016x}", hash)
}

fn website_base() -> String {
    crate::core::website_url::shape_website_base()
}

/// Shared blocking client — never drop a per-request `blocking::Client` on a tokio worker
/// (that panics: "Cannot drop a runtime in a context where blocking is not allowed").
fn blocking_http_client() -> &'static reqwest::blocking::Client {
    static CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .unwrap_or_else(|_| reqwest::blocking::Client::new())
    })
}

pub struct RemoteIndexClient {
    context: ApiContext,
    project_key: String,
}

impl RemoteIndexClient {
    pub fn new(project_path: &str, context: ApiContext) -> Self {
        Self {
            context,
            project_key: project_key(project_path),
        }
    }

    pub fn is_available(&self) -> bool {
        self.context
            .token
            .as_ref()
            .map(|t| !t.trim().is_empty())
            .unwrap_or(false)
    }

    fn apply_headers(
        &self,
        builder: reqwest::blocking::RequestBuilder,
    ) -> reqwest::blocking::RequestBuilder {
        let mut req = builder.header("Content-Type", "application/json");
        if let Some(token) = &self.context.token {
            req = req.header("Authorization", format!("Bearer {}", token));
        }
        if let Some(turn) = &self.context.turn_id {
            req = req.header("X-Shape-Turn-Id", turn);
        }
        if let Some(conv) = &self.context.conversation_id {
            req = req.header("X-Shape-Conversation-Id", conv);
        }
        req
    }

    pub fn sync_chunks(
        &self,
        chunks: Vec<SyncChunkPayload>,
        full_replace: bool,
    ) -> Result<usize, String> {
        if chunks.is_empty() && !full_replace {
            return Ok(0);
        }
        if !self.is_available() {
            return Err("Sign in to Shape to sync codebase embeddings.".to_string());
        }

        let url = format!("{}/api/index/sync", website_base().trim_end_matches('/'));
        let body = SyncBody {
            project_key: self.project_key.clone(),
            full_replace,
            chunks,
        };

        let resp = self
            .apply_headers(blocking_http_client().post(&url))
            .json(&body)
            .send()
            .map_err(|e| format!("Index sync request failed: {e}"))?;

        if resp.status().as_u16() == 401 {
            return Err("Sign in to Shape to sync codebase embeddings.".to_string());
        }
        if !resp.status().is_success() {
            let text = resp.text().unwrap_or_default();
            return Err(format!(
                "Index sync error: {}",
                text.chars().take(400).collect::<String>()
            ));
        }

        let parsed: SyncResponse = resp
            .json()
            .map_err(|e| format!("Failed to parse index sync response: {e}"))?;
        Ok(parsed.vectors)
    }

    pub fn search(&self, query: &str, top_k: usize) -> Result<Vec<RemoteSearchHit>, String> {
        if !self.is_available() {
            return Ok(vec![]);
        }

        let url = format!("{}/api/index/search", website_base().trim_end_matches('/'));
        let body = SearchBody {
            project_key: self.project_key.clone(),
            query: query.to_string(),
            top_k,
        };

        let resp = self
            .apply_headers(blocking_http_client().post(&url))
            .json(&body)
            .send()
            .map_err(|e| format!("Index search request failed: {e}"))?;

        if resp.status().as_u16() == 401 {
            return Ok(vec![]);
        }
        if !resp.status().is_success() {
            let text = resp.text().unwrap_or_default();
            return Err(format!(
                "Index search error: {}",
                text.chars().take(400).collect::<String>()
            ));
        }

        let parsed: SearchResponse = resp
            .json()
            .map_err(|e| format!("Failed to parse index search response: {e}"))?;

        Ok(parsed
            .hits
            .into_iter()
            .map(|h| RemoteSearchHit {
                file: h.file_path,
                start_line: h.start_line,
                end_line: h.end_line,
                score: h.score as f32,
            })
            .collect())
    }
}

/// Back-compat name used by hybrid search wiring.
pub type Embedder = RemoteIndexClient;
