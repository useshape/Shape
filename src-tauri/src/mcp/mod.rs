pub(crate) mod client;
mod credentials;
mod http_client;
mod oauth;
mod types;

pub use oauth::{handle_oauth_callback, start_oauth};
pub use types::*;

use client::McpClient as StdioClient;
use credentials::delete_token;
use http_client::HttpMcpClient;
use oauth::get_token;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Built-in hosted MCP servers that support OAuth. Kept in sync with the
/// TypeScript catalog so the agent can prompt Connect before mcp.json exists.
const BUILTIN_OAUTH_MCP: &[(&str, &str)] = &[
    ("github", "GitHub"),
    ("linear", "Linear"),
    ("notion", "Notion"),
    ("figma", "Figma"),
    ("sentry", "Sentry"),
    ("stripe", "Stripe"),
    ("vercel", "Vercel"),
    ("supabase", "Supabase"),
    ("neon", "Neon"),
    ("atlassian", "Atlassian"),
    ("datadog", "Datadog"),
    ("posthog", "PostHog"),
    ("slack", "Slack"),
    ("hubspot", "HubSpot"),
    ("amplitude", "Amplitude"),
    ("asana", "Asana"),
    ("monday", "Monday.com"),
    ("intercom", "Intercom"),
    ("launchdarkly", "LaunchDarkly"),
    ("webflow", "Webflow"),
    ("canva", "Canva"),
    ("pagerduty", "PagerDuty"),
    ("prisma", "Prisma"),
    ("paypal", "PayPal"),
    ("clickup", "ClickUp"),
    ("mixpanel", "Mixpanel"),
    ("mongodb", "MongoDB"),
    ("gitlab", "GitLab"),
];

enum ConnectedClient {
    Stdio(StdioClient),
    Http(HttpMcpClient),
}

impl ConnectedClient {
    fn tools(&self) -> &[McpToolInfo] {
        match self {
            ConnectedClient::Stdio(c) => &c.tools,
            ConnectedClient::Http(c) => &c.tools,
        }
    }

    fn last_error(&self) -> Option<String> {
        match self {
            ConnectedClient::Stdio(c) => c.last_error.clone(),
            ConnectedClient::Http(c) => c.last_error.clone(),
        }
    }

    fn call_tool(&mut self, name: &str, args: Value) -> Result<CallToolResult, String> {
        match self {
            ConnectedClient::Stdio(c) => c.call_tool(name, args),
            ConnectedClient::Http(c) => c.call_tool(name, args),
        }
    }
}

pub struct McpState {
    /// Per-server locks so a long tool call does not block status/sync/schema.
    clients: Mutex<HashMap<String, Arc<Mutex<ConnectedClient>>>>,
    configs: Mutex<Vec<McpServerConfig>>,
}

impl McpState {
    pub fn new() -> Self {
        Self {
            clients: Mutex::new(HashMap::new()),
            configs: Mutex::new(Vec::new()),
        }
    }

    fn connect_server(server: &McpServerConfig) -> Result<ConnectedClient, String> {
        if server.transport == McpTransport::Http {
            let url = server
                .url
                .as_ref()
                .filter(|u| !u.is_empty())
                .ok_or("HTTP MCP server missing url")?;
            if server.auth == McpAuthType::Oauth && get_token(&server.id).is_none() {
                return Err("NEEDS_AUTH".to_string());
            }
            // Reached from async Tauri commands: `block_on` on a tokio worker panics
            // unless the worker is first moved to blocking mode via `block_in_place`.
            let rt = tokio::runtime::Handle::current();
            let auth = server.auth.clone();
            let client = tokio::task::block_in_place(|| {
                rt.block_on(HttpMcpClient::connect(&server.id, &server.name, url, auth))
            })?;
            return Ok(ConnectedClient::Http(client));
        }

        StdioClient::spawn(
            &server.id,
            &server.name,
            &server.command,
            &server.args,
            &server.env,
        )
        .map(ConnectedClient::Stdio)
    }

    pub fn sync_servers(&self, servers: Vec<McpServerConfig>) -> Result<Vec<McpStatusEntry>, String> {
        {
            let mut configs = self.configs.lock().map_err(|e| e.to_string())?;
            *configs = servers.clone();
        }

        let mut clients = self.clients.lock().map_err(|e| e.to_string())?;
        clients.clear();

        let mut statuses = Vec::new();

        for server in servers {
            if !server.enabled {
                statuses.push(McpStatusEntry {
                    id: server.id.clone(),
                    name: server.name.clone(),
                    status: McpServerStatus::Disabled,
                    tool_count: 0,
                    error: None,
                    auth: server.auth.clone(),
                });
                continue;
            }

            match Self::connect_server(&server) {
                Ok(client) => {
                    let tool_count = client.tools().len();
                    statuses.push(McpStatusEntry {
                        id: server.id.clone(),
                        name: server.name.clone(),
                        status: McpServerStatus::Connected,
                        tool_count,
                        error: None,
                        auth: server.auth.clone(),
                    });
                    clients.insert(server.id.clone(), Arc::new(Mutex::new(client)));
                }
                Err(e) if e == "NEEDS_AUTH" => {
                    statuses.push(McpStatusEntry {
                        id: server.id.clone(),
                        name: server.name.clone(),
                        status: McpServerStatus::NeedsAuth,
                        tool_count: 0,
                        error: Some(
                            "Connect your account in Settings → Connections (separate from Shape sign-in)."
                                .to_string(),
                        ),
                        auth: server.auth.clone(),
                    });
                }
                Err(e) => {
                    statuses.push(McpStatusEntry {
                        id: server.id.clone(),
                        name: server.name.clone(),
                        status: McpServerStatus::Error,
                        tool_count: 0,
                        error: Some(e),
                        auth: server.auth.clone(),
                    });
                }
            }
        }

        Ok(statuses)
    }

    pub fn get_status(&self) -> Result<Vec<McpStatusEntry>, String> {
        let clients = self.clients.lock().map_err(|e| e.to_string())?;
        let configs = self.configs.lock().map_err(|e| e.to_string())?;

        Ok(configs
            .iter()
            .map(|cfg| {
                if !cfg.enabled {
                    return McpStatusEntry {
                        id: cfg.id.clone(),
                        name: cfg.name.clone(),
                        status: McpServerStatus::Disabled,
                        tool_count: 0,
                        error: None,
                        auth: cfg.auth.clone(),
                    };
                }
                if let Some(client) = clients.get(&cfg.id) {
                    let guard = client.lock().unwrap_or_else(|e| e.into_inner());
                    McpStatusEntry {
                        id: cfg.id.clone(),
                        name: cfg.name.clone(),
                        status: McpServerStatus::Connected,
                        tool_count: guard.tools().len(),
                        error: guard.last_error(),
                        auth: cfg.auth.clone(),
                    }
                } else if cfg.transport == McpTransport::Http
                    && cfg.auth == McpAuthType::Oauth
                    && get_token(&cfg.id).is_none()
                {
                    McpStatusEntry {
                        id: cfg.id.clone(),
                        name: cfg.name.clone(),
                        status: McpServerStatus::NeedsAuth,
                        tool_count: 0,
                        error: Some("Not connected".to_string()),
                        auth: cfg.auth.clone(),
                    }
                } else {
                    McpStatusEntry {
                        id: cfg.id.clone(),
                        name: cfg.name.clone(),
                        status: McpServerStatus::Error,
                        tool_count: 0,
                        error: Some("Not connected".to_string()),
                        auth: cfg.auth.clone(),
                    }
                }
            })
            .collect())
    }

    pub fn all_tools(&self) -> Result<Vec<McpToolInfo>, String> {
        let clients = self.clients.lock().map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for client in clients.values() {
            let guard = client.lock().map_err(|e| e.to_string())?;
            out.extend(guard.tools().iter().cloned());
        }
        Ok(out)
    }

    pub fn tools_as_openai_schema(&self) -> Result<Vec<Value>, String> {
        let mut out = self
            .all_tools()?
            .into_iter()
            .map(|t| {
                json!({
                    "type": "function",
                    "function": {
                        "name": t.qualified_name,
                        "description": format!("[MCP: {}] {}", t.server_name, t.description),
                        "parameters": t.input_schema,
                    }
                })
            })
            .collect::<Vec<_>>();

        // Disconnected OAuth servers: one connect tool so the model can prompt login.
        let configs = self.configs.lock().map_err(|e| e.to_string())?;
        for cfg in configs.iter() {
            if !cfg.enabled || cfg.auth != McpAuthType::Oauth {
                continue;
            }
            if get_token(&cfg.id).is_some() {
                continue;
            }
            let slug = crate::mcp::client::sanitize_name(&cfg.id);
            out.push(json!({
                "type": "function",
                "function": {
                    "name": format!("mcp_connect_{}", slug),
                    "description": format!(
                        "[MCP: {}] Not connected. Call this when you need {}. It shows a Connect card so the user can sign in with OAuth. Do not invent other {} tools until they connect.",
                        cfg.name, cfg.name, cfg.name
                    ),
                    "parameters": { "type": "object", "properties": {} },
                }
            }));
        }

        let mut listed: std::collections::HashSet<String> = configs
            .iter()
            .map(|c| crate::mcp::client::sanitize_name(&c.id))
            .collect();
        drop(configs);
        for (id, name) in BUILTIN_OAUTH_MCP {
            if get_token(id).is_some() {
                continue;
            }
            let slug = crate::mcp::client::sanitize_name(id);
            if listed.contains(&slug) {
                continue;
            }
            listed.insert(slug.clone());
            out.push(json!({
                "type": "function",
                "function": {
                    "name": format!("mcp_connect_{}", slug),
                    "description": format!(
                        "[MCP: {}] Not connected. Call this when you need {}. It shows a Connect card so the user can sign in with OAuth. Do not invent other {} tools until they connect.",
                        name, name, name
                    ),
                    "parameters": { "type": "object", "properties": {} },
                }
            }));
        }
        Ok(out)
    }

    pub fn describe_tool(&self, qualified_name: &str) -> Option<(String, String, String)> {
        let clients = self.clients.lock().ok()?;
        for client in clients.values() {
            let guard = client.lock().ok()?;
            if let Some(t) = guard.tools().iter().find(|t| t.qualified_name == qualified_name) {
                return Some((t.server_id.clone(), t.server_name.clone(), t.name.clone()));
            }
        }
        None
    }

    pub fn find_server_by_connect_tool(&self, qualified_name: &str) -> Option<(String, String)> {
        let slug = qualified_name.strip_prefix("mcp_connect_")?;
        if let Ok(configs) = self.configs.lock() {
            if let Some(found) = configs.iter().find_map(|cfg| {
                if crate::mcp::client::sanitize_name(&cfg.id) == slug {
                    Some((cfg.id.clone(), cfg.name.clone()))
                } else {
                    None
                }
            }) {
                return Some(found);
            }
        }
        BUILTIN_OAUTH_MCP.iter().find_map(|(id, name)| {
            if crate::mcp::client::sanitize_name(id) == slug {
                Some(((*id).to_string(), (*name).to_string()))
            } else {
                None
            }
        })
    }

    pub fn call_tool(&self, qualified_name: &str, args_json: &str) -> Result<String, String> {
        let args: Value = serde_json::from_str(args_json)
            .map_err(|e| format!("Invalid MCP tool arguments JSON: {}", e))?;

        // Resolve the target client under the map lock, then drop it before the
        // network/stdio round-trip so status/sync/schema are not blocked.
        let target = {
            let clients = self.clients.lock().map_err(|e| e.to_string())?;
            let mut found = None;
            for client in clients.values() {
                let guard = client.lock().map_err(|e| e.to_string())?;
                if let Some(name) = guard
                    .tools()
                    .iter()
                    .find(|t| t.qualified_name == qualified_name)
                    .map(|t| t.name.clone())
                {
                    found = Some((Arc::clone(client), name));
                    break;
                }
            }
            found
        };

        let Some((client, name)) = target else {
            return Err(format!("Unknown MCP tool: {}", qualified_name));
        };

        let mut guard = client.lock().map_err(|e| e.to_string())?;
        let result = guard.call_tool(&name, args)?;
        let text = result
            .content
            .into_iter()
            .filter_map(|c| match c {
                ToolContent::Text { text } => Some(text),
            })
            .collect::<Vec<_>>()
            .join("\n");
        if result.is_error {
            return Err(text);
        }
        Ok(text)
    }

    pub fn restart_server(&self, server_id: &str) -> Result<McpStatusEntry, String> {
        let configs = self.configs.lock().map_err(|e| e.to_string())?;
        let server = configs
            .iter()
            .find(|s| s.id == server_id)
            .cloned()
            .ok_or_else(|| "Server not found".to_string())?;
        drop(configs);

        let mut clients = self.clients.lock().map_err(|e| e.to_string())?;
        clients.remove(server_id);

        if !server.enabled {
            return Ok(McpStatusEntry {
                id: server.id,
                name: server.name,
                status: McpServerStatus::Disabled,
                tool_count: 0,
                error: None,
                auth: server.auth.clone(),
            });
        }

        match Self::connect_server(&server) {
            Ok(client) => {
                let entry = McpStatusEntry {
                    id: server.id.clone(),
                    name: server.name.clone(),
                    status: McpServerStatus::Connected,
                    tool_count: client.tools().len(),
                    error: None,
                    auth: server.auth.clone(),
                };
                clients.insert(server.id, Arc::new(Mutex::new(client)));
                Ok(entry)
            }
            Err(e) if e == "NEEDS_AUTH" => Ok(McpStatusEntry {
                id: server.id,
                name: server.name,
                status: McpServerStatus::NeedsAuth,
                tool_count: 0,
                error: Some("Authentication required".to_string()),
                auth: server.auth.clone(),
            }),
            Err(e) => Ok(McpStatusEntry {
                id: server.id,
                name: server.name,
                status: McpServerStatus::Error,
                tool_count: 0,
                error: Some(e),
                auth: server.auth.clone(),
            }),
        }
    }

    pub async fn start_server_oauth(&self, server_id: &str) -> Result<(), String> {
        let (server_id_owned, url) = {
            let configs = self.configs.lock().map_err(|e| e.to_string())?;
            let server = configs
                .iter()
                .find(|s| s.id == server_id)
                .cloned()
                .ok_or_else(|| "Server not found".to_string())?;
            let url = server
                .url
                .as_ref()
                .ok_or("HTTP MCP server missing url")?
                .clone();
            (server.id, url)
        };
        start_oauth(&server_id_owned, &url).await
    }

    pub fn clear_server_oauth(&self, server_id: &str) -> Result<(), String> {
        delete_token(server_id)
    }
}
