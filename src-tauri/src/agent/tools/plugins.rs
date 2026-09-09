use serde_json::{json, Value};

async fn plugin_request(method: &str, path: &str, access_token: &str, body: Option<Value>) -> Result<Value, String> {
    let base = crate::core::website_url::shape_website_base();
    let url = format!("{}{}", base.trim_end_matches('/'), path);

    let client = reqwest::Client::new();
    let mut req = match method {
        "POST" => client.post(&url),
        _ => client.get(&url),
    };
    req = req
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json");
    if let Some(body) = body {
        req = req.json(&body);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("Plugin request failed: {}", e))?;

    if resp.status().as_u16() == 401 {
        return Err("Sign in to Shape to use plugins.".to_string());
    }
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Plugin error: {}",
            text.chars().take(400).collect::<String>()
        ));
    }
    resp.json::<Value>()
        .await
        .map_err(|e| format!("Failed to parse plugin response: {}", e))
}

pub async fn execute_plugin_list(access_token: &str) -> String {
    match plugin_request("GET", "/api/plugins", access_token, None).await {
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
    match plugin_request("GET", &path, access_token, None).await {
        Ok(data) => serde_json::to_string_pretty(&data).unwrap_or_else(|_| "{}".to_string()),
        Err(e) => e,
    }
}

pub async fn execute_plugin_search(query: &str, access_token: &str) -> String {
    let path = format!("/api/plugins/search?query={}", urlencoding::encode(query));
    match plugin_request("GET", &path, access_token, None).await {
        Ok(data) => serde_json::to_string_pretty(&data).unwrap_or_else(|_| "{}".to_string()),
        Err(e) => e,
    }
}

pub async fn execute_plugin_run(slug: &str, arguments: &Value, access_token: &str) -> String {
    match plugin_request(
        "POST",
        "/api/plugins/execute",
        access_token,
        Some(json!({ "slug": slug, "arguments": arguments })),
    )
    .await
    {
        Ok(data) => serde_json::to_string_pretty(&data).unwrap_or_else(|_| "{}".to_string()),
        Err(e) => e,
    }
}
