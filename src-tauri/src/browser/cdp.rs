//! Thin Chrome DevTools Protocol client. One websocket per call keeps the
//! callers simple; the screencast keeps its own long-lived socket.

use std::time::{Duration, Instant};

use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

pub async fn call(ws_url: &str, method: &str, params: Value) -> Result<Value, String> {
    let (mut ws, _) = timeout(Duration::from_secs(8), tokio_tungstenite::connect_async(ws_url))
        .await
        .map_err(|_| "DevTools websocket timed out".to_string())?
        .map_err(|e| format!("DevTools websocket: {e}"))?;
    let body = json!({"id": 1, "method": method, "params": params}).to_string();
    ws.send(Message::Text(body.into()))
        .await
        .map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        match timeout(Duration::from_millis(400), ws.next()).await {
            Ok(Some(Ok(Message::Text(text)))) => {
                let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
                if v.get("id").and_then(|id| id.as_u64()) == Some(1) {
                    if let Some(err) = v.get("error") {
                        return Err(err
                            .get("message")
                            .and_then(|m| m.as_str())
                            .unwrap_or("DevTools error")
                            .to_string());
                    }
                    return Ok(v.get("result").cloned().unwrap_or(Value::Null));
                }
            }
            Ok(Some(Ok(_))) => {}
            Ok(Some(Err(e))) => return Err(format!("DevTools socket: {e}")),
            Ok(None) => break,
            Err(_) => {}
        }
    }
    Err(format!("DevTools timed out during {method}"))
}

/// Send several commands over one socket, in order, and wait for all replies.
pub async fn call_all(ws_url: &str, calls: Vec<(&str, Value)>) -> Result<Vec<Value>, String> {
    if calls.is_empty() {
        return Ok(Vec::new());
    }
    let (mut ws, _) = timeout(Duration::from_secs(8), tokio_tungstenite::connect_async(ws_url))
        .await
        .map_err(|_| "DevTools websocket timed out".to_string())?
        .map_err(|e| format!("DevTools websocket: {e}"))?;
    for (index, (method, params)) in calls.iter().enumerate() {
        let body = json!({"id": (index as u64) + 1, "method": method, "params": params}).to_string();
        ws.send(Message::Text(body.into()))
            .await
            .map_err(|e| e.to_string())?;
    }
    let mut results: std::collections::HashMap<u64, Value> = std::collections::HashMap::new();
    let deadline = Instant::now() + Duration::from_secs(20);
    while results.len() < calls.len() && Instant::now() < deadline {
        match timeout(Duration::from_millis(400), ws.next()).await {
            Ok(Some(Ok(Message::Text(text)))) => {
                let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
                if let Some(id) = v.get("id").and_then(|id| id.as_u64()) {
                    if let Some(err) = v.get("error") {
                        return Err(err.to_string());
                    }
                    results.insert(id, v.get("result").cloned().unwrap_or(Value::Null));
                }
            }
            Ok(Some(Ok(_))) => {}
            Ok(Some(Err(e))) => return Err(format!("DevTools socket: {e}")),
            Ok(None) => break,
            Err(_) => {}
        }
    }
    if results.len() < calls.len() {
        return Err("DevTools timed out.".into());
    }
    Ok((1..=calls.len() as u64).filter_map(|id| results.remove(&id)).collect())
}

/// Evaluate an expression and return its value as a string (JSON for objects).
pub async fn eval(ws_url: &str, expression: &str) -> Result<String, String> {
    let v = call(
        ws_url,
        "Runtime.evaluate",
        json!({
            "expression": expression,
            "returnByValue": true,
            "awaitPromise": true
        }),
    )
    .await?;
    if let Some(err) = v.pointer("/exceptionDetails/text").and_then(|t| t.as_str()) {
        return Err(err.to_string());
    }
    match v.pointer("/result/value") {
        Some(Value::String(s)) => Ok(s.clone()),
        Some(Value::Null) | None => Ok(String::new()),
        Some(other) => Ok(other.to_string()),
    }
}

/// JPEG screenshot as base64 (no data-url prefix). `scale` shrinks the capture.
pub async fn screenshot_jpeg(ws_url: &str, quality: u8, scale: f64) -> Result<String, String> {
    let mut params = json!({ "format": "jpeg", "quality": quality });
    if scale < 0.999 {
        let metrics = eval(
            ws_url,
            "JSON.stringify({w: window.innerWidth, h: window.innerHeight})",
        )
        .await
        .unwrap_or_default();
        let m: Value = serde_json::from_str(&metrics).unwrap_or(Value::Null);
        let w = m.get("w").and_then(|v| v.as_f64()).unwrap_or(1280.0);
        let h = m.get("h").and_then(|v| v.as_f64()).unwrap_or(800.0);
        params["clip"] = json!({ "x": 0, "y": 0, "width": w, "height": h, "scale": scale });
    }
    let v = call(ws_url, "Page.captureScreenshot", params).await?;
    v.get("data")
        .and_then(|d| d.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "No screenshot data".into())
}

pub async fn click_px(ws_url: &str, x: f64, y: f64) -> Result<(), String> {
    call_all(
        ws_url,
        vec![
            ("Input.dispatchMouseEvent", json!({ "type": "mouseMoved", "x": x, "y": y })),
            (
                "Input.dispatchMouseEvent",
                json!({ "type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1 }),
            ),
            (
                "Input.dispatchMouseEvent",
                json!({ "type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1 }),
            ),
        ],
    )
    .await
    .map(|_| ())
}

type Ws = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

/// One page socket for a whole browse call, so a batch of actions does not
/// reconnect DevTools between every click.
pub struct PageConn {
    ws: Ws,
    next_id: u64,
}

impl PageConn {
    pub async fn connect(ws_url: &str) -> Result<Self, String> {
        let (ws, _) = timeout(Duration::from_secs(8), tokio_tungstenite::connect_async(ws_url))
            .await
            .map_err(|_| "DevTools websocket timed out".to_string())?
            .map_err(|e| format!("DevTools websocket: {e}"))?;
        Ok(Self { ws, next_id: 0 })
    }

    pub async fn call(
        &mut self,
        method: &str,
        params: Value,
        stop: fn() -> bool,
    ) -> Result<Value, String> {
        let results = self
            .call_all(vec![(method, params)], stop)
            .await?;
        results
            .into_iter()
            .next()
            .ok_or_else(|| format!("DevTools timed out during {method}"))
    }

    pub async fn call_all(
        &mut self,
        calls: Vec<(&str, Value)>,
        stop: fn() -> bool,
    ) -> Result<Vec<Value>, String> {
        if calls.is_empty() {
            return Ok(Vec::new());
        }
        let mut wanted = std::collections::HashMap::new();
        for (method, params) in calls {
            self.next_id += 1;
            let id = self.next_id;
            wanted.insert(id, method.to_string());
            let body = json!({"id": id, "method": method, "params": params}).to_string();
            self.ws
                .send(Message::Text(body.into()))
                .await
                .map_err(|e| e.to_string())?;
        }
        let mut results = std::collections::HashMap::new();
        let deadline = Instant::now() + Duration::from_secs(20);
        while results.len() < wanted.len() && Instant::now() < deadline {
            if stop() {
                return Err("The user stopped browser control.".into());
            }
            match timeout(Duration::from_millis(400), self.ws.next()).await {
                Ok(Some(Ok(Message::Text(text)))) => {
                    let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
                    if let Some(id) = v.get("id").and_then(|id| id.as_u64()) {
                        if !wanted.contains_key(&id) {
                            continue;
                        }
                        if let Some(err) = v.get("error") {
                            let message = err
                                .get("message")
                                .and_then(|m| m.as_str())
                                .unwrap_or("DevTools error");
                            return Err(message.to_string());
                        }
                        results.insert(id, v.get("result").cloned().unwrap_or(Value::Null));
                    }
                }
                Ok(Some(Ok(_))) => {}
                Ok(Some(Err(e))) => return Err(format!("DevTools socket: {e}")),
                Ok(None) => break,
                Err(_) => {}
            }
        }
        if results.len() < wanted.len() {
            let missing = wanted
                .iter()
                .find(|(id, _)| !results.contains_key(id))
                .map(|(_, method)| method.as_str())
                .unwrap_or("command");
            return Err(format!("DevTools timed out during {missing}"));
        }
        let mut ordered = Vec::new();
        let mut ids: Vec<u64> = wanted.keys().copied().collect();
        ids.sort_unstable();
        for id in ids {
            if let Some(value) = results.remove(&id) {
                ordered.push(value);
            }
        }
        Ok(ordered)
    }

    pub async fn eval(&mut self, expression: &str, stop: fn() -> bool) -> Result<String, String> {
        let v = self
            .call(
                "Runtime.evaluate",
                json!({
                    "expression": expression,
                    "returnByValue": true,
                    "awaitPromise": true
                }),
                stop,
            )
            .await?;
        if let Some(err) = v.pointer("/exceptionDetails/text").and_then(|t| t.as_str()) {
            let extra = v
                .pointer("/exceptionDetails/exception/description")
                .and_then(|t| t.as_str())
                .unwrap_or("");
            if extra.is_empty() {
                return Err(err.to_string());
            }
            return Err(format!("{err}: {extra}"));
        }
        match v.pointer("/result/value") {
            Some(Value::String(s)) => Ok(s.clone()),
            Some(Value::Null) | None => Ok(String::new()),
            Some(other) => Ok(other.to_string()),
        }
    }
}

/// Poll until the document is ready (or the deadline passes).
pub async fn wait_ready(ws_url: &str, max: Duration) {
    let deadline = Instant::now() + max;
    while Instant::now() < deadline {
        if let Ok(state) = eval(
            ws_url,
            r#"(function(){ var h = location.href || ""; return (h.indexOf("about:") === 0 ? "about" : "") + document.readyState; })()"#,
        )
        .await
        {
            if state == "complete" || state == "interactive" {
                return;
            }
        }
        tokio::time::sleep(Duration::from_millis(120)).await;
    }
}
