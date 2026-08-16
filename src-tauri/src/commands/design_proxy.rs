use std::sync::Arc;

use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, Notify};

use crate::core::error::AppError;

const INJECT_MARK: &str = "<!--shape-design-bridge-->";

pub struct DesignProxyState {
    inner: Mutex<Option<RunningProxy>>,
}

struct RunningProxy {
    port: u16,
    target: String,
    inject: bool,
    shutdown: Arc<Notify>,
}

impl Default for DesignProxyState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

#[derive(Serialize)]
pub struct DesignProxyInfo {
    pub port: u16,
    pub src: String,
}

fn inject_bridge(html: &str, script: &str) -> String {
    if html.contains(INJECT_MARK) {
        return html.to_string();
    }
    // Run after window load so React/Vite can hydrate and play intro animations
    // before we attach inspectors. Inject at </body> so we don't block <head> scripts.
    let tag = format!(
        "{INJECT_MARK}<script>(function(){{function boot(){{{script}\n}}if(document.readyState==='complete')boot();else window.addEventListener('load',boot);}})();</script>"
    );
    let lower = html.to_ascii_lowercase();
    if let Some(idx) = lower.rfind("</body>") {
        let mut out = String::with_capacity(html.len() + tag.len());
        out.push_str(&html[..idx]);
        out.push_str(&tag);
        out.push_str(&html[idx..]);
        return out;
    }
    if let Some(idx) = lower.rfind("</html>") {
        let mut out = String::with_capacity(html.len() + tag.len());
        out.push_str(&html[..idx]);
        out.push_str(&tag);
        out.push_str(&html[idx..]);
        return out;
    }
    format!("{html}{tag}")
}

fn host_header(parsed: &url::Url) -> String {
    let host = parsed.host_str().unwrap_or("localhost");
    match parsed.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_string(),
    }
}

fn rewrite_csp_frame_ancestors(csp: &str) -> String {
    let mut parts: Vec<String> = csp
        .split(';')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let mut found = false;
    for part in parts.iter_mut() {
        if part.to_ascii_lowercase().starts_with("frame-ancestors") {
            *part = "frame-ancestors *".to_string();
            found = true;
        }
    }
    if !found {
        parts.push("frame-ancestors *".to_string());
    }
    parts.join("; ")
}

fn origin_of(parsed: &url::Url) -> String {
    format!(
        "{}://{}{}",
        parsed.scheme(),
        parsed.host_str().unwrap_or("localhost"),
        parsed
            .port()
            .map(|p| format!(":{p}"))
            .unwrap_or_default()
    )
}

fn proxy_src(listen_port: u16, parsed: &url::Url) -> String {
    // Listener is bound to 127.0.0.1 — using "localhost" here can hit ::1 on Windows
    // and show the OS "refused to connect" page.
    let mut out = format!("http://127.0.0.1:{listen_port}{}", parsed.path());
    if let Some(q) = parsed.query() {
        out.push('?');
        out.push_str(q);
    }
    out
}

fn rewrite_location(value: &str, listen_port: u16, target: &url::Url) -> String {
    if let Ok(u) = url::Url::parse(value) {
        if u.host_str() == target.host_str() && u.port_or_known_default() == target.port_or_known_default() {
            return proxy_src(listen_port, &u);
        }
    }
    value.to_string()
}

async fn handle_client(
    mut client: TcpStream,
    target: url::Url,
    script: Arc<String>,
    listen_port: u16,
) {
    let mut buf = vec![0u8; 64 * 1024];
    let n = match client.read(&mut buf).await {
        Ok(0) | Err(_) => return,
        Ok(n) => n,
    };
    let req = &buf[..n];
    let header_end = req.windows(4).position(|w| w == b"\r\n\r\n");
    let Some(header_end) = header_end else { return };
    let header_text = String::from_utf8_lossy(&req[..header_end]);
    let mut lines = header_text.split("\r\n");
    let request_line = lines.next().unwrap_or("");
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let path = parts.next().unwrap_or("/");

    if method.eq_ignore_ascii_case("CONNECT") || path.starts_with("ws") {
        let _ = client.shutdown().await;
        return;
    }

    let mut dest = target.clone();
    if let Ok(rel) = url::Url::parse(&format!("http://placeholder.local{path}")) {
        dest.set_path(rel.path());
        dest.set_query(rel.query());
    }

    let client_http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build();
    let Ok(http) = client_http else { return };

    let mut builder = http.request(
        method.parse::<reqwest::Method>().unwrap_or(reqwest::Method::GET),
        dest.clone(),
    );
    for line in lines {
        let Some((name, value)) = line.split_once(':') else { continue };
        let name = name.trim();
        let value = value.trim();
        let lower = name.to_ascii_lowercase();
        if lower == "host" || lower == "connection" || lower == "accept-encoding" {
            continue;
        }
        builder = builder.header(name, value);
    }
    builder = builder.header("host", host_header(&dest));
    builder = builder.header("accept-encoding", "identity");

    let body = &req[header_end + 4..];
    if !body.is_empty() {
        builder = builder.body(body.to_vec());
    }

    let resp = match builder.send().await {
        Ok(r) => r,
        Err(_) => {
            let msg = b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 11\r\n\r\nBad Gateway";
            let _ = client.write_all(msg).await;
            return;
        }
    };

    let status = resp.status();
    let headers = resp.headers().clone();
    let bytes = resp.bytes().await.unwrap_or_default();
    let content_type = headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();

    let mut out_body = bytes.to_vec();
    if !script.is_empty() && content_type.contains("text/html") {
        if let Ok(html) = std::str::from_utf8(&out_body) {
            out_body = inject_bridge(html, &script).into_bytes();
        }
    }

    let mut head = format!("HTTP/1.1 {} {}\r\n", status.as_u16(), status.canonical_reason().unwrap_or("OK"));
    for (name, value) in headers.iter() {
        let lower = name.as_str().to_ascii_lowercase();
        if lower == "content-length"
            || lower == "transfer-encoding"
            || lower == "content-encoding"
            || lower == "connection"
            || lower == "x-frame-options"
        {
            continue;
        }
        let mut val = value.to_str().unwrap_or("").to_string();
        if lower == "location" {
            val = rewrite_location(&val, listen_port, &target);
        }
        if lower == "content-security-policy" || lower == "content-security-policy-report-only" {
            val = rewrite_csp_frame_ancestors(&val);
        }
        head.push_str(name.as_str());
        head.push_str(": ");
        head.push_str(&val);
        head.push_str("\r\n");
    }
    head.push_str(&format!("Content-Length: {}\r\nConnection: close\r\n\r\n", out_body.len()));
    let _ = client.write_all(head.as_bytes()).await;
    let _ = client.write_all(&out_body).await;
}

#[tauri::command]
pub async fn start_design_proxy(
    target_url: String,
    bridge_script: String,
    state: tauri::State<'_, DesignProxyState>,
) -> Result<DesignProxyInfo, AppError> {
    let parsed = url::Url::parse(&target_url)
        .map_err(|e| AppError::Message(format!("Invalid preview URL: {e}")))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(AppError::Message("Design mode only supports http(s) preview URLs.".into()));
    }

    let inject = !bridge_script.trim().is_empty();

    {
        let guard = state.inner.lock().await;
        if let Some(running) = guard.as_ref() {
            if running.target == origin_of(&parsed) && running.inject == inject {
                return Ok(DesignProxyInfo {
                    port: running.port,
                    src: proxy_src(running.port, &parsed),
                });
            }
        }
    }

    stop_running(&*state).await;

    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let shutdown = Arc::new(Notify::new());
    let shutdown_worker = shutdown.clone();
    let origin = origin_of(&parsed);
    let base = parsed.clone();
    let script = Arc::new(bridge_script);

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = shutdown_worker.notified() => break,
                accepted = listener.accept() => {
                    match accepted {
                        Ok((stream, _)) => {
                            let script = script.clone();
                            let target = base.clone();
                            tokio::spawn(async move {
                                handle_client(stream, target, script, port).await;
                            });
                        }
                        Err(_) => break,
                    }
                }
            }
        }
    });

    let src = proxy_src(port, &parsed);

    *state.inner.lock().await = Some(RunningProxy {
        port,
        target: origin,
        inject,
        shutdown,
    });

    Ok(DesignProxyInfo { port, src })
}

async fn stop_running(state: &DesignProxyState) {
    if let Some(running) = state.inner.lock().await.take() {
        running.shutdown.notify_waiters();
    }
}

#[tauri::command]
pub async fn stop_design_proxy(state: tauri::State<'_, DesignProxyState>) -> Result<(), AppError> {
    stop_running(&*state).await;
    Ok(())
}

/// TCP reachability check so the iframe is never pointed at a dead port
/// (WebView would show the OS “refused to connect” page).
#[tauri::command]
pub async fn probe_preview_url(url: String) -> Result<bool, AppError> {
    let parsed = url::Url::parse(&url)
        .map_err(|e| AppError::Message(format!("Invalid preview URL: {e}")))?;
    let host = parsed.host_str().unwrap_or("localhost");
    let port = parsed.port_or_known_default().unwrap_or(80);
    // IPv4 only — [::1] on Windows can stall far past the connect timeout.
    let mut candidates = vec![format!("{host}:{port}")];
    let lower = host.to_ascii_lowercase();
    if lower == "localhost" {
        candidates.push(format!("127.0.0.1:{port}"));
    } else if lower == "127.0.0.1" {
        candidates.push(format!("localhost:{port}"));
    }
    for addr in candidates {
        let connect = TcpStream::connect(addr);
        match tokio::time::timeout(std::time::Duration::from_millis(400), connect).await {
            Ok(Ok(_stream)) => return Ok(true),
            _ => continue,
        }
    }
    Ok(false)
}
