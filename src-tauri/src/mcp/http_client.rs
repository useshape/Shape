use crate::mcp::oauth::{ensure_fresh_token, get_token, refresh_access_token};
use crate::mcp::types::{CallToolResult, McpAuthType, McpToolInfo, ToolContent};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};

static REQUEST_ID: AtomicU64 = AtomicU64::new(1);

pub struct HttpMcpClient {
    pub server_id: String,
    pub server_name: String,
    pub url: String,
    pub auth: McpAuthType,
    pub tools: Vec<McpToolInfo>,
    pub last_error: Option<String>,
    pub session_id: Option<String>,
    client: reqwest::Client,
}

impl HttpMcpClient {
    pub async fn connect(
        server_id: &str,
        server_name: &str,
        url: &str,
        auth: McpAuthType,
    ) -> Result<Self, String> {
        let client = reqwest::Client::new();
        let mut http = Self {
            server_id: server_id.to_string(),
            server_name: server_name.to_string(),
            url: url.to_string(),
            auth,
            tools: Vec::new(),
            last_error: None,
            session_id: None,
            client,
        };

        let token = http.resolve_token(true).await?;
        http.initialize(token.as_deref()).await?;
        http.tools = http.fetch_tools(token.as_deref()).await?;
        Ok(http)
    }

    /// `None` auth → no bearer token. OAuth → load/refresh from keyring.
    async fn resolve_token(&self, proactive_refresh: bool) -> Result<Option<String>, String> {
        match self.auth {
            McpAuthType::None => Ok(None),
            McpAuthType::Oauth => {
                if proactive_refresh {
                    let tokens = ensure_fresh_token(&self.server_id).await?;
                    Ok(Some(tokens.access_token))
                } else {
                    let tokens = get_token(&self.server_id).ok_or_else(|| {
                        "Authentication required. Connect this MCP server in Settings → AI → MCP."
                            .to_string()
                    })?;
                    Ok(Some(tokens.access_token))
                }
            }
        }
    }

    async fn rpc(&mut self, token: Option<&str>, method: &str, params: Value) -> Result<Value, String> {
        match self.rpc_once(token, method, &params).await {
            Ok(v) => Ok(v),
            Err(err) if self.auth == McpAuthType::Oauth && is_unauthorized(&err) => {
                let refreshed = refresh_access_token(&self.server_id).await?;
                self.rpc_once(Some(&refreshed.access_token), method, &params)
                    .await
            }
            Err(err) => Err(err),
        }
    }

    async fn rpc_once(
        &mut self,
        token: Option<&str>,
        method: &str,
        params: &Value,
    ) -> Result<Value, String> {
        let id = REQUEST_ID.fetch_add(1, Ordering::SeqCst);
        let body = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        let mut req = self
            .client
            .post(&self.url)
            .header("Accept", "application/json, text/event-stream")
            .header("Content-Type", "application/json")
            .json(&body);

        if let Some(t) = token {
            if !t.is_empty() {
                req = req.header("Authorization", format!("Bearer {}", t));
            }
        }
        if let Some(sid) = &self.session_id {
            req = req.header("Mcp-Session-Id", sid);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| format!("HTTP MCP request failed: {}", e))?;

        if let Some(sid) = resp.headers().get("mcp-session-id").and_then(|v| v.to_str().ok()) {
            self.session_id = Some(sid.to_string());
        }

        let status = resp.status();
        let content_type = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let text = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read MCP response: {}", e))?;

        if status.as_u16() == 401 {
            return Err(format!("HTTP MCP error {}: {}", status, text));
        }
        if !status.is_success() {
            return Err(format!("HTTP MCP error {}: {}", status, text));
        }

        let json = if content_type.contains("text/event-stream") || text.trim_start().starts_with("event:") {
            parse_sse_jsonrpc(&text)?
        } else {
            serde_json::from_str::<Value>(&text)
                .map_err(|e| format!("Invalid MCP JSON response: {}", e))?
        };

        if let Some(err) = json.get("error") {
            return Err(err.to_string());
        }

        // notifications/initialized may omit result
        if method.starts_with("notifications/") {
            return Ok(json.get("result").cloned().unwrap_or(Value::Null));
        }

        json.get("result")
            .cloned()
            .ok_or_else(|| "Missing result in MCP response".to_string())
    }

    async fn initialize(&mut self, token: Option<&str>) -> Result<(), String> {
        self.rpc(
            token,
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "shape", "version": "1.0.0" }
            }),
        )
        .await?;
        let _ = self
            .rpc(token, "notifications/initialized", json!({}))
            .await;
        Ok(())
    }

    async fn fetch_tools(&mut self, token: Option<&str>) -> Result<Vec<McpToolInfo>, String> {
        let result = self.rpc(token, "tools/list", json!({})).await?;
        let tools = result
            .get("tools")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default();

        Ok(tools
            .into_iter()
            .filter_map(|t| {
                let name = t.get("name")?.as_str()?.to_string();
                let description = t
                    .get("description")
                    .and_then(|d| d.as_str())
                    .unwrap_or("")
                    .to_string();
                let input_schema = t
                    .get("inputSchema")
                    .cloned()
                    .unwrap_or(json!({"type": "object"}));
                Some(McpToolInfo {
                    server_id: self.server_id.clone(),
                    server_name: self.server_name.clone(),
                    name: name.clone(),
                    qualified_name: format!(
                        "mcp_{}_{}",
                        crate::mcp::client::sanitize_name(&self.server_id),
                        crate::mcp::client::sanitize_name(&name)
                    ),
                    description,
                    input_schema,
                })
            })
            .collect())
    }

    pub fn call_tool(&mut self, name: &str, args: Value) -> Result<CallToolResult, String> {
        let rt = tokio::runtime::Handle::current();
        let result = tokio::task::block_in_place(|| {
            rt.block_on(async {
                let token = self.resolve_token(true).await?;
                self.rpc(
                    token.as_deref(),
                    "tools/call",
                    json!({ "name": name, "arguments": args }),
                )
                .await
            })
        })?;

        let is_error = result
            .get("isError")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let content = result
            .get("content")
            .and_then(|c| c.as_array())
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|item| {
                let text = item.get("text")?.as_str()?.to_string();
                Some(ToolContent::Text { text })
            })
            .collect();

        Ok(CallToolResult { content, is_error })
    }
}

fn is_unauthorized(err: &str) -> bool {
    err.contains("401") || err.to_lowercase().contains("unauthorized")
}

/// Extract the last JSON-RPC message from an SSE body (`data: {...}` lines).
fn parse_sse_jsonrpc(body: &str) -> Result<Value, String> {
    let mut last: Option<Value> = None;
    for line in body.lines() {
        let trimmed = line.trim();
        let data = if let Some(rest) = trimmed.strip_prefix("data:") {
            rest.trim()
        } else if trimmed.starts_with('{') {
            trimmed
        } else {
            continue;
        };
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(data) {
            last = Some(v);
        }
    }
    last.ok_or_else(|| "No JSON-RPC payload in SSE response".to_string())
}
