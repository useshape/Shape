use std::time::Duration;

use serde_json::{json, Value};

fn strip_urls(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    loop {
        let http = rest.find("http://");
        let https = rest.find("https://");
        let idx = match (http, https) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        };
        let Some(i) = idx else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..i]);
        let after = &rest[i..];
        let end = after
            .find(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | ')' | '<' | '>' | ']' | ','))
            .unwrap_or(after.len());
        rest = &after[end..];
    }
    out
}

fn sanitize_plugin_error(raw: &str) -> String {
    if let Ok(v) = serde_json::from_str::<Value>(raw) {
        if let Some(e) = v.get("error").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            return strip_urls(e).chars().take(240).collect();
        }
        if let Some(e) = v.get("message").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            return strip_urls(e).chars().take(240).collect();
        }
    }
    let cleaned = strip_urls(raw);
    let first = cleaned.lines().next().unwrap_or("Plugin request failed.").trim();
    if first.is_empty() {
        "Plugin request failed.".to_string()
    } else {
        first.chars().take(240).collect()
    }
}

pub(crate) async fn plugin_request(
    method: &str,
    path: &str,
    access_token: &str,
    body: Option<Value>,
    turn_id: Option<&str>,
    conversation_id: Option<&str>,
) -> Result<Value, String> {
    let base = crate::core::website_url::shape_website_base();
    let url = format!("{}{}", base.trim_end_matches('/'), path);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let mut req = match method {
        "POST" => client.post(&url),
        _ => client.get(&url),
    };
    req = req
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json");
    if let Some(turn_id) = turn_id.filter(|s| !s.is_empty()) {
        req = req.header("X-Shape-Turn-Id", turn_id);
    }
    if let Some(conversation_id) = conversation_id.filter(|s| !s.is_empty()) {
        req = req.header("X-Shape-Conversation-Id", conversation_id);
    }
    if let Some(body) = body {
        req = req.json(&body);
    }

    let resp = req
        .send()
        .await
        .map_err(|_| "Plugin request failed.".to_string())?;

    if resp.status().as_u16() == 401 {
        return Err("Sign in to Shape to use plugins.".to_string());
    }
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(sanitize_plugin_error(&text));
    }
    resp.json::<Value>()
        .await
        .map_err(|_| "Failed to parse plugin response.".to_string())
}

pub async fn execute_plugin_list(access_token: &str) -> String {
    match plugin_request("GET", "/api/plugins", access_token, None, None, None).await {
        Ok(data) => {
            if data.get("configured") == Some(&json!(false)) {
                return "Plugins are not configured on the Shape server.".to_string();
            }
            let plugins = data.get("plugins").cloned().unwrap_or(json!([]));
            serde_json::to_string_pretty(&plugins).unwrap_or_else(|_| "[]".to_string())
        }
        Err(e) => e,
    }
}

pub async fn execute_plugin_tools(toolkit: &str, query: Option<&str>, access_token: &str) -> String {
    let mut path = format!(
        "/api/plugins/tools?toolkit={}",
        urlencoding::encode(toolkit)
    );
    if let Some(q) = query.filter(|s| !s.is_empty()) {
        path.push_str("&query=");
        path.push_str(&urlencoding::encode(q));
    }
    match plugin_request("GET", &path, access_token, None, None, None).await {
        Ok(data) => serde_json::to_string_pretty(&data).unwrap_or_else(|_| "{}".to_string()),
        Err(e) => e,
    }
}

pub async fn execute_plugin_search(
    query: &str,
    access_token: &str,
    turn_id: Option<&str>,
    conversation_id: Option<&str>,
) -> String {
    let path = format!("/api/plugins/search?query={}", urlencoding::encode(query));
    match plugin_request("GET", &path, access_token, None, turn_id, conversation_id).await {
        Ok(data) => {
            if let Some(answer) = data
                .get("answer")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
            {
                return answer.to_string();
            }
            let mut rec = data
                .get("recommended")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if rec.is_empty() {
                rec = data
                    .get("tools")
                    .and_then(|v| v.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|t| t.get("slug"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
            }
            let connected = data
                .get("connected")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            if rec.is_empty() && connected.is_empty() {
                return "No plugins are connected. Tell the user to connect the app in Settings → Plugins."
                    .to_string();
            }
            if rec.is_empty() {
                return format!(
                    "Connected: {connected}. No matching actions. plugin_search again with a shorter phrase like \"list\". Do not say the app is disconnected."
                );
            }
            let rec_args = data
                .get("tools")
                .and_then(|v| v.as_array())
                .and_then(|arr| {
                    arr.iter().find(|t| t.get("slug").and_then(|s| s.as_str()) == Some(rec.as_str()))
                })
                .and_then(|t| t.get("args"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let mut lines = vec![
                format!("Connected: {connected}."),
                format!("plugin_run now: slug={rec} arguments={{{rec_args}}}"),
                "Allowed slugs below. After a list result, plugin_run the FETCH/HISTORY/GET slug with the id from the list. Do not argue. Do not list twice.".to_string(),
            ];
            if let Some(arr) = data.get("tools").and_then(|v| v.as_array()) {
                for t in arr.iter().take(6) {
                    let slug = t.get("slug").and_then(|v| v.as_str()).unwrap_or("");
                    if slug.is_empty() {
                        continue;
                    }
                    let args = t.get("args").and_then(|v| v.as_str()).unwrap_or("");
                    let p = t.get("p").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    lines.push(format!("- {slug} args={{{args}}} p={p:.2}"));
                }
            }
            lines.join("\n")
        }
        Err(e) => e,
    }
}

pub async fn execute_plugin_run(
    slug: &str,
    arguments: &Value,
    access_token: &str,
    turn_id: Option<&str>,
    conversation_id: Option<&str>,
    task: Option<&str>,
) -> String {
    let mut body = json!({ "slug": slug, "arguments": arguments });
    if let Some(task) = task.filter(|s| !s.is_empty()) {
        body["task"] = json!(task.chars().take(2000).collect::<String>());
    }
    match plugin_request(
        "POST",
        "/api/plugins/execute",
        access_token,
        Some(body),
        turn_id,
        conversation_id,
    )
    .await
    {
        Ok(data) => {
            if let Some(s) = data.get("result").and_then(|v| v.as_str()) {
                return s.to_string();
            }
            serde_json::to_string(&data).unwrap_or_else(|_| "{}".to_string())
        }
        Err(e) => e,
    }
}

/// Hidden per-turn pack picker. Fail open so a miss never blocks the main model.
pub async fn fetch_steer(
    access_token: &str,
    message: &str,
    mode: &str,
    turn_id: Option<&str>,
    conversation_id: Option<&str>,
) -> crate::agent::tools::schema::SteerPacks {
    use crate::agent::tools::schema::SteerPacks;
    if access_token.trim().is_empty() {
        return SteerPacks::all_on();
    }
    let base = crate::core::website_url::shape_website_base();
    let url = format!("{}/api/agent/steer", base.trim_end_matches('/'));
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(2500))
        .build()
    {
        Ok(c) => c,
        Err(_) => return SteerPacks::all_on(),
    };
    let mut req = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&json!({
            "message": message.chars().take(4000).collect::<String>(),
            "mode": mode,
        }));
    if let Some(turn_id) = turn_id.filter(|s| !s.is_empty()) {
        req = req.header("X-Shape-Turn-Id", turn_id);
    }
    if let Some(conversation_id) = conversation_id.filter(|s| !s.is_empty()) {
        req = req.header("X-Shape-Conversation-Id", conversation_id);
    }
    match req.send().await {
        Ok(resp) if resp.status().is_success() => match resp.json::<Value>().await {
            Ok(body) => SteerPacks::from_json(&body),
            Err(_) => SteerPacks::all_on(),
        },
        _ => SteerPacks::all_on(),
    }
}

pub async fn fetch_gate(
    access_token: &str,
    body: Value,
    turn_id: Option<&str>,
    conversation_id: Option<&str>,
) -> Value {
    if access_token.trim().is_empty() {
        return json!({});
    }
    let base = crate::core::website_url::shape_website_base();
    let url = format!("{}/api/agent/gate", base.trim_end_matches('/'));
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(2500))
        .build()
    {
        Ok(c) => c,
        Err(_) => return json!({}),
    };
    let mut req = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&body);
    if let Some(turn_id) = turn_id.filter(|s| !s.is_empty()) {
        req = req.header("X-Shape-Turn-Id", turn_id);
    }
    if let Some(conversation_id) = conversation_id.filter(|s| !s.is_empty()) {
        req = req.header("X-Shape-Conversation-Id", conversation_id);
    }
    match req.send().await {
        Ok(resp) if resp.status().is_success() => resp.json::<Value>().await.unwrap_or_else(|_| json!({})),
        _ => json!({}),
    }
}

pub fn gate_action(body: &Value) -> &str {
    body.get("action").and_then(|v| v.as_str()).unwrap_or("")
}
