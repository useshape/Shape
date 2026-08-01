use crate::mcp::types::{CallToolResult, McpToolInfo, ToolContent};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

static REQUEST_ID: AtomicU64 = AtomicU64::new(1);

pub struct McpClient {
    pub server_id: String,
    pub server_name: String,
    child: Child,
    stdin: Arc<Mutex<std::process::ChildStdin>>,
    pending: Arc<Mutex<HashMap<u64, std::sync::mpsc::Sender<Value>>>>,
    reader_handle: Option<std::thread::JoinHandle<()>>,
    pub tools: Vec<McpToolInfo>,
    pub last_error: Option<String>,
}

impl McpClient {
    pub fn spawn(
        server_id: &str,
        server_name: &str,
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> Result<Self, String> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        for (k, v) in env {
            cmd.env(k, v);
        }

        #[cfg(windows)]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn MCP server: {}", e))?;
        let stdin = child.stdin.take().ok_or("No stdin")?;
        let stdout = child.stdout.take().ok_or("No stdout")?;

        let stdin = Arc::new(Mutex::new(stdin));
        let pending: Arc<Mutex<HashMap<u64, std::sync::mpsc::Sender<Value>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let pending_reader = pending.clone();

        let reader_handle = std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut headers = String::new();
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).ok().filter(|n| *n > 0).is_none() {
                        return;
                    }
                    if line == "\r\n" || line == "\n" {
                        break;
                    }
                    headers.push_str(&line);
                }

                let content_length = headers
                    .lines()
                    .find_map(|l| {
                        let lower = l.to_ascii_lowercase();
                        lower
                            .strip_prefix("content-length:")
                            .map(|v| v.trim().parse::<usize>().ok())
                    })
                    .flatten();

                let Some(len) = content_length else {
                    continue;
                };

                let mut body = vec![0u8; len];
                if reader.read_exact(&mut body).is_err() {
                    return;
                }

                let Ok(val) = serde_json::from_slice::<Value>(&body) else {
                    continue;
                };

                if let Some(id) = val.get("id").and_then(|v| v.as_u64()) {
                    if let Ok(mut map) = pending_reader.lock() {
                        if let Some(tx) = map.remove(&id) {
                            let _ = tx.send(val);
                        }
                    }
                }
            }
        });

        let mut client = Self {
            server_id: server_id.to_string(),
            server_name: server_name.to_string(),
            child,
            stdin,
            pending,
            reader_handle: Some(reader_handle),
            tools: Vec::new(),
            last_error: None,
        };

        client.initialize()?;
        client.load_tools()?;
        Ok(client)
    }

    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = REQUEST_ID.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = std::sync::mpsc::channel();

        {
            let mut map = self.pending.lock().map_err(|e| e.to_string())?;
            map.insert(id, tx);
        }

        let msg = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        self.send_message(&msg)?;

        match rx.recv_timeout(std::time::Duration::from_secs(30)) {
            Ok(resp) => {
                if let Some(err) = resp.get("error") {
                    return Err(err.to_string());
                }
                Ok(resp.get("result").cloned().unwrap_or(Value::Null))
            }
            Err(_) => Err(format!("MCP request timed out: {}", method)),
        }
    }

    fn send_message(&self, msg: &Value) -> Result<(), String> {
        let body = serde_json::to_string(msg).map_err(|e| e.to_string())?;
        let frame = format!("Content-Length: {}\r\n\r\n{}", body.len(), body);
        let mut stdin = self.stdin.lock().map_err(|e| e.to_string())?;
        stdin.write_all(frame.as_bytes()).map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())
    }

    fn initialize(&mut self) -> Result<(), String> {
        let result = self.request(
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "shape", "version": "0.1.0" }
            }),
        )?;
        if result.is_null() {
            return Err("MCP initialize returned null".to_string());
        }
        let _ = self.send_notification("notifications/initialized", json!({}))?;
        Ok(())
    }

    fn send_notification(&self, method: &str, params: Value) -> Result<(), String> {
        let msg = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });
        self.send_message(&msg)
    }

    fn load_tools(&mut self) -> Result<(), String> {
        let result = self.request("tools/list", json!({}))?;
        let tools = result
            .get("tools")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default();

        self.tools = tools
            .into_iter()
            .filter_map(|t| {
                let name = t.get("name")?.as_str()?.to_string();
                let description = t
                    .get("description")
                    .and_then(|d| d.as_str())
                    .unwrap_or("")
                    .to_string();
                let input_schema = t.get("inputSchema").cloned().unwrap_or(json!({}));
                let qualified = format!("mcp_{}_{}", sanitize_name(&self.server_name), sanitize_name(&name));
                Some(McpToolInfo {
                    server_id: self.server_id.clone(),
                    server_name: self.server_name.clone(),
                    name,
                    qualified_name: qualified,
                    description,
                    input_schema,
                })
            })
            .collect();
        Ok(())
    }

    pub fn call_tool(&mut self, tool_name: &str, arguments: Value) -> Result<CallToolResult, String> {
        let result = self.request(
            "tools/call",
            json!({ "name": tool_name, "arguments": arguments }),
        )?;

        let is_error = result.get("isError").and_then(|v| v.as_bool()).unwrap_or(false);
        let content: Vec<ToolContent> = result
            .get("content")
            .and_then(|c| c.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        let text = item.get("text")?.as_str()?.to_string();
                        Some(ToolContent::Text { text })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(CallToolResult { content, is_error })
    }
}

impl Drop for McpClient {
    fn drop(&mut self) {
        let _ = self.child.kill();
        if let Some(handle) = self.reader_handle.take() {
            let _ = handle.join();
        }
    }
}

pub fn sanitize_name(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}
