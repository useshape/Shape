//! Docked DevTools for the Browser tab.
//!
//! The page lives in an iframe, so it is not a `/json/list` page target.
//! WebView2 only exposes that iframe after `Target.setAutoAttach` on the
//! top-level page. This proxies the inspector onto that session.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use futures::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message;

use super::surface::{best_target, inspector_url, is_app_page, score_target};

const MISS: &str = "This page doesn't have developer tools yet.";
const RESTART: &str = "Restart Shape, then open developer tools for this page.";

struct Proxy {
    task: tauri::async_runtime::JoinHandle<()>,
}

static PROXY: Mutex<Option<Proxy>> = Mutex::new(None);

pub async fn inspector_for(want: &str) -> Result<String, String> {
    if !(want.starts_with("http://") || want.starts_with("https://")) {
        return Err(MISS.into());
    }
    let list = json_list().await?;
    if let Some(page) = best_target(&list, want) {
        let ws = page.get("webSocketDebuggerUrl").and_then(|v| v.as_str()).unwrap_or("");
        if ws.contains("/devtools/page/") {
            let front = inspector_url(&page);
            if !front.is_empty() {
                return Ok(front);
            }
        }
    }
    let page_ws = app_page_ws(&list)?;
    iframe_session_id(&page_ws, want).await?;
    let port = start_proxy(page_ws, want.to_string()).await?;
    Ok(format!(
        "{}/devtools/inspector.html?ws=127.0.0.1:{port}/devtools/page/frame",
        crate::browser::webview_debug::base_url()
    ))
}

fn app_page_ws(list: &[Value]) -> Result<String, String> {
    let mut pages: Vec<&Value> = list
        .iter()
        .filter(|item| {
            let url = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let kind = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let ws = item.get("webSocketDebuggerUrl").and_then(|v| v.as_str()).unwrap_or("");
            kind == "page" && is_app_page(url) && ws.starts_with("ws")
        })
        .collect();
    if pages.is_empty() {
        return Err(RESTART.into());
    }
    pages.sort_by_key(|item| {
        let url = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
        usize::from(url.contains("onboarding"))
    });
    pages[0]
        .get("webSocketDebuggerUrl")
        .and_then(|v| v.as_str())
        .filter(|ws| !ws.is_empty())
        .map(str::to_string)
        .ok_or_else(|| RESTART.to_string())
}

async fn json_list() -> Result<Vec<Value>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;
    client
        .get(format!("{}/json/list", crate::browser::webview_debug::base_url()))
        .send()
        .await
        .map_err(|_| RESTART.to_string())?
        .json::<Vec<Value>>()
        .await
        .map_err(|_| RESTART.to_string())
}

async fn iframe_session_id(page_ws: &str, want: &str) -> Result<String, String> {
    let (mut socket, _) = tokio_tungstenite::connect_async(page_ws)
        .await
        .map_err(|_| RESTART.to_string())?;
    let session = wait_iframe(&mut socket, want).await?;
    Ok(session)
}

async fn wait_iframe(
    socket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    want: &str,
) -> Result<String, String> {
    let attach = serde_json::json!({
        "id": 1,
        "method": "Target.setAutoAttach",
        "params": {"autoAttach": true, "waitForDebuggerOnStart": false, "flatten": true}
    });
    socket
        .send(Message::Text(attach.to_string().into()))
        .await
        .map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(3);
    let mut best: Option<(i32, String)> = None;
    let mut seen: Vec<String> = Vec::new();
    while Instant::now() < deadline {
        let next = tokio::time::timeout(Duration::from_millis(250), socket.next()).await;
        let text = match next {
            Ok(Some(Ok(Message::Text(text)))) => text,
            Ok(Some(Ok(Message::Ping(payload)))) => {
                let _ = socket.send(Message::Pong(payload)).await;
                continue;
            }
            Ok(Some(Ok(_))) => continue,
            Ok(Some(Err(err))) => return Err(err.to_string()),
            Ok(None) => break,
            Err(_) => {
                if best.is_some() {
                    break;
                }
                continue;
            }
        };
        let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        if value.get("id").and_then(|v| v.as_i64()) == Some(1) {
            if let Some(err) = value.pointer("/error/message").and_then(|v| v.as_str()) {
                log::warn!("devtools attach failed: {err}");
                return Err(MISS.into());
            }
        }
        if value.get("method").and_then(|v| v.as_str()) != Some("Target.attachedToTarget") {
            continue;
        }
        let info = value.pointer("/params/targetInfo");
        let url = info.and_then(|v| v.get("url")).and_then(|v| v.as_str()).unwrap_or("");
        let kind = info.and_then(|v| v.get("type")).and_then(|v| v.as_str()).unwrap_or("");
        if seen.len() < 8 {
            seen.push(format!("{kind} {url}"));
        }
        let session = value
            .pointer("/params/sessionId")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if session.is_empty() {
            continue;
        }
        let score = score_target(url, want, kind);
        if score < 0 {
            continue;
        }
        if best.as_ref().map(|(have, _)| score > *have).unwrap_or(true) {
            best = Some((score, session.to_string()));
        }
        if score >= 40 {
            break;
        }
    }
    if let Some((_, session)) = best {
        return Ok(session);
    }
    log::warn!("devtools: no iframe session for {want}; saw {}", seen.join(" | "));
    Err(MISS.into())
}

async fn start_proxy(page_ws: String, want: String) -> Result<u16, String> {
    if let Some(old) = PROXY.lock().unwrap_or_else(|p| p.into_inner()).take() {
        old.task.abort();
    }
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let task = tauri::async_runtime::spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                break;
            };
            let page_ws = page_ws.clone();
            let want = want.clone();
            tauri::async_runtime::spawn(async move {
                let Ok(frontend) = tokio_tungstenite::accept_async(stream).await else {
                    return;
                };
                relay(frontend, page_ws, want).await;
            });
        }
    });
    *PROXY.lock().unwrap_or_else(|p| p.into_inner()) = Some(Proxy { task });
    Ok(port)
}

async fn relay(
    frontend: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    page_ws: String,
    want: String,
) {
    let Ok((mut page, _)) = tokio_tungstenite::connect_async(&page_ws).await else {
        return;
    };
    let Ok(session) = wait_iframe(&mut page, &want).await else {
        return;
    };
    let (mut page_write, mut page_read) = page.split();
    let (mut front_write, mut front_read) = frontend.split();
    loop {
        tokio::select! {
            incoming = front_read.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        let Some(out) = tag_session(&text, &session) else { continue };
                        if page_write.send(Message::Text(out.into())).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        if front_write.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                }
            }
            incoming = page_read.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        let Some(out) = untag_session(&text, &session) else { continue };
                        if front_write.send(Message::Text(out.into())).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        if page_write.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }
}

fn tag_session(text: &str, session: &str) -> Option<String> {
    let mut value: Value = serde_json::from_str(text).ok()?;
    value.as_object_mut()?.insert("sessionId".to_string(), Value::String(session.to_string()));
    Some(value.to_string())
}

fn untag_session(text: &str, session: &str) -> Option<String> {
    let mut value: Value = serde_json::from_str(text).ok()?;
    let obj = value.as_object_mut()?;
    if obj.get("sessionId").and_then(|v| v.as_str())? != session {
        return None;
    }
    obj.remove("sessionId");
    Some(value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_tag_roundtrip() {
        let tagged = tag_session(r#"{"id":4,"method":"Runtime.enable"}"#, "abc").unwrap();
        let value: Value = serde_json::from_str(&tagged).unwrap();
        assert_eq!(value["sessionId"], "abc");
        assert_eq!(value["method"], "Runtime.enable");
        let plain = untag_session(&tagged, "abc").unwrap();
        let back: Value = serde_json::from_str(&plain).unwrap();
        assert!(back.get("sessionId").is_none());
        assert!(untag_session(&tagged, "other").is_none());
    }
}
