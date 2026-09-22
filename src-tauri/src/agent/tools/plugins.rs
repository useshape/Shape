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

pub async fn execute_plugin_search(query: &str, access_token: &str) -> String {
    let path = format!("/api/plugins/search?query={}", urlencoding::encode(query));
    match plugin_request("GET", &path, access_token, None, None, None).await {
        Ok(data) => serde_json::to_string_pretty(&data).unwrap_or_else(|_| "{}".to_string()),
        Err(e) => e,
    }
}

pub async fn execute_plugin_run(
    slug: &str,
    arguments: &Value,
    access_token: &str,
    turn_id: Option<&str>,
    conversation_id: Option<&str>,
) -> String {
    match plugin_request(
        "POST",
        "/api/plugins/execute",
        access_token,
        Some(json!({ "slug": slug, "arguments": arguments })),
        turn_id,
        conversation_id,
    )
    .await
    {
        Ok(data) => serde_json::to_string_pretty(&data).unwrap_or_else(|_| "{}".to_string()),
        Err(e) => e,
    }
}
