//! Runtime inspect for Review: Chromium DevTools Protocol against a local
//! website preview or an Electron / Tauri / Wails webview.

use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;
use url::Url;

use super::page_shot;

const ATTACH_PORTS: &[u16] = &[9222, 9223, 9229, 9230, 9242, 5858];
const PROBE_PORTS: &[u16] = &[1420, 5173, 3000, 4173, 8080, 8081, 34115, 1421];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeKind {
    Website,
    Electron,
    Tauri,
    Wails,
    Unsupported(String),
}

impl RuntimeKind {
    pub fn label(&self) -> &str {
        match self {
            Self::Website => "website",
            Self::Electron => "electron",
            Self::Tauri => "tauri",
            Self::Wails => "wails",
            Self::Unsupported(reason) => reason,
        }
    }

    pub fn inspectable(&self) -> bool {
        !matches!(self, Self::Unsupported(_))
    }
}

pub fn detect_runtime_kind(project_path: &str) -> RuntimeKind {
    let root = Path::new(project_path);
    if root.join("wails.json").is_file() || root.join("wails.prod.json").is_file() {
        return RuntimeKind::Wails;
    }
    if root.join("src-tauri").is_dir()
        || root.join("tauri.conf.json").is_file()
        || root.join("src-tauri/tauri.conf.json").is_file()
        || cargo_depends_on_tauri(root)
    {
        return RuntimeKind::Tauri;
    }
    if package_has_dep(root, "electron") {
        return RuntimeKind::Electron;
    }
    if looks_like_website(root) {
        return RuntimeKind::Website;
    }
    RuntimeKind::Unsupported(unsupported_reason(root))
}

fn cargo_depends_on_tauri(root: &Path) -> bool {
    let cargo = root.join("Cargo.toml");
    let Ok(text) = std::fs::read_to_string(cargo) else {
        return false;
    };
    text.contains("tauri") && (text.contains("[dependencies") || text.contains("crate-type"))
}

fn package_has_dep(root: &Path, name: &str) -> bool {
    let pkg = root.join("package.json");
    let Ok(text) = std::fs::read_to_string(pkg) else {
        return false;
    };
    let Ok(v) = serde_json::from_str::<Value>(&text) else {
        return false;
    };
    for key in ["dependencies", "devDependencies", "peerDependencies"] {
        if v.get(key).and_then(|d| d.get(name)).is_some() {
            return true;
        }
    }
    false
}

fn looks_like_website(root: &Path) -> bool {
    const MARKERS: &[&str] = &[
        "next.config.js",
        "next.config.mjs",
        "next.config.ts",
        "vite.config.js",
        "vite.config.ts",
        "vite.config.mjs",
        "astro.config.mjs",
        "astro.config.ts",
        "nuxt.config.ts",
        "nuxt.config.js",
        "remix.config.js",
        "svelte.config.js",
        "angular.json",
        "index.html",
    ];
    if MARKERS.iter().any(|m| root.join(m).is_file()) {
        return true;
    }
    package_has_dep(root, "next")
        || package_has_dep(root, "react")
        || package_has_dep(root, "vue")
        || package_has_dep(root, "svelte")
        || package_has_dep(root, "nuxt")
        || package_has_dep(root, "@angular/core")
}

fn unsupported_reason(root: &Path) -> String {
    if root.join("project.godot").is_file() {
        return "Godot game (no Chromium webview)".into();
    }
    if dir_has_ext(root, "uproject") {
        return "Unreal project (no Chromium webview)".into();
    }
    if root.join("Assets").is_dir()
        && (root.join("ProjectSettings").is_dir() || root.join("Packages").is_dir())
    {
        return "Unity project (no Chromium webview)".into();
    }
    if root.join("Cargo.toml").is_file() {
        let cargo = std::fs::read_to_string(root.join("Cargo.toml")).unwrap_or_default();
        if cargo.contains("gtk") || cargo.contains("gdk") {
            return "native GTK / Rust GUI (no Chromium webview)".into();
        }
        if cargo.contains("winit") || cargo.contains("egui") || cargo.contains("iced") {
            return "native Rust GUI (no Chromium webview)".into();
        }
        return "native Rust (not Tauri)".into();
    }
    if root.join("go.mod").is_file() {
        return "Go service / CLI (no Chromium webview)".into();
    }
    if root.join("Package.swift").is_file() {
        return "native Swift / SwiftUI".into();
    }
    if dir_has_ext(root, "xcodeproj") || dir_has_ext(root, "xcworkspace") {
        return "native Apple app (no Chromium webview)".into();
    }
    if dir_has_ext(root, "csproj")
        || dir_has_ext(root, "sln")
        || root.join("App.xaml").is_file()
        || root.join("Package.appxmanifest").is_file()
    {
        return "native Windows / WinUI / WPF (no Chromium webview)".into();
    }
    if root.join("CMakeLists.txt").is_file() || root.join("Makefile").is_file() {
        return "native C/C++ project".into();
    }
    if root.join("meson.build").is_file() {
        return "native GTK / meson project".into();
    }
    if package_has_dep(root, "express") || package_has_dep(root, "fastify") {
        return "Node API (no browser UI)".into();
    }
    "not a website or Electron/Tauri/Wails app".into()
}

fn dir_has_ext(root: &Path, ext: &str) -> bool {
    std::fs::read_dir(root)
        .ok()
        .map(|it| {
            it.filter_map(|e| e.ok())
                .any(|e| e.path().extension().and_then(|x| x.to_str()) == Some(ext))
        })
        .unwrap_or(false)
}

pub fn unsupported_message(kind: &RuntimeKind) -> String {
    format!(
        "This project is not a website or a webview desktop app (Electron, Tauri, or Wails).\n\
inspect_runtime cannot attach DevTools here — there is no Chromium document (Network tab, console, DOM).\n\
Detected: {}.\n\
Review source, tests, and logs instead. Native UI (WinUI, SwiftUI, GTK, games, CLIs, headless APIs) is not inspectable this way.",
        kind.label()
    )
}

pub fn resolve_inspect_url(url: Option<&str>, path: Option<&str>) -> Result<String, String> {
    match page_shot::resolve_page_url(url, path) {
        Ok(u) => Ok(u),
        Err(_) => {
            if let Some(found) = poll_common_origins() {
                if let Some(raw_path) = path.map(str::trim).filter(|s| !s.is_empty()) {
                    let origin = page_shot::origin_of(&found).unwrap_or(found);
                    let suffix = if raw_path.starts_with('/') {
                        raw_path.to_string()
                    } else {
                        format!("/{raw_path}")
                    };
                    return Ok(format!("{origin}{suffix}"));
                }
                return Ok(found);
            }
            Err(
                "No local preview URL. Pass path (e.g. /stats) or url (http://localhost:…), start the app, or open Preview."
                    .into(),
            )
        }
    }
}

fn poll_common_origins() -> Option<String> {
    for port in PROBE_PORTS {
        if port_open(*port) {
            return Some(format!("http://127.0.0.1:{port}/"));
        }
    }
    None
}

fn port_open(port: u16) -> bool {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok()
}

struct BrowserChild {
    child: Child,
    data_dir: PathBuf,
}

impl Drop for BrowserChild {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self.data_dir);
    }
}

pub async fn inspect_url(target_url: &str) -> Result<String, String> {
    if let Ok(report) = attach_existing(target_url).await {
        return Ok(report);
    }
    spawn_and_inspect(target_url).await
}

async fn attach_existing(target_url: &str) -> Result<String, String> {
    for port in ATTACH_PORTS {
        if let Ok(ws) = fetch_page_ws(*port).await {
            if let Ok(report) = cdp_session(*port, &ws, Some(target_url), true).await {
                return Ok(format!("Attached to existing Chromium debug port {port}.\n{report}"));
            }
        }
    }
    Err("no existing debug port".into())
}

async fn spawn_and_inspect(target_url: &str) -> Result<String, String> {
    let browser = find_chromium().ok_or_else(|| {
        "No Chromium-based browser found (Chrome or Edge). Install one to inspect Network/console like DevTools."
            .to_string()
    })?;
    let port = free_port().ok_or_else(|| "Could not find a free debug port.".to_string())?;
    let data_dir = std::env::temp_dir().join(format!("shape-inspect-{port}"));
    let _ = std::fs::create_dir_all(&data_dir);
    let mut cmd = Command::new(&browser);
    cmd.args([
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--disable-extensions",
        "--disable-background-networking",
        &format!("--remote-debugging-port={port}"),
        &format!("--user-data-dir={}", data_dir.display()),
        "about:blank",
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to launch Chromium ({browser}): {e}"))?;
    let _session = BrowserChild { child, data_dir };

    let deadline = Instant::now() + Duration::from_secs(8);
    let mut ws = None;
    while Instant::now() < deadline {
        if let Ok(url) = fetch_page_ws(port).await {
            ws = Some(url);
            break;
        }
        tokio::time::sleep(Duration::from_millis(120)).await;
    }
    let ws = ws.ok_or_else(|| "Chromium started but DevTools never came up.".to_string())?;
    let report = cdp_session(port, &ws, Some(target_url), false).await?;
    Ok(format!("Spawned Chromium DevTools (headless).\n{report}"))
}

fn find_chromium() -> Option<String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    #[cfg(windows)]
    {
        if let Ok(pf) = std::env::var("PROGRAMFILES") {
            candidates.push(PathBuf::from(pf.clone()).join("Google/Chrome/Application/chrome.exe"));
            candidates.push(PathBuf::from(pf).join("Microsoft/Edge/Application/msedge.exe"));
        }
        if let Ok(pf86) = std::env::var("PROGRAMFILES(X86)") {
            candidates.push(PathBuf::from(&pf86).join("Microsoft/Edge/Application/msedge.exe"));
            candidates.push(PathBuf::from(pf86).join("Google/Chrome/Application/chrome.exe"));
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            candidates.push(PathBuf::from(local).join("Google/Chrome/Application/chrome.exe"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from(
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ));
        candidates.push(PathBuf::from(
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ));
        candidates.push(PathBuf::from(
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ));
    }
    #[cfg(target_os = "linux")]
    {
        for name in [
            "google-chrome",
            "google-chrome-stable",
            "chromium",
            "chromium-browser",
            "microsoft-edge",
            "microsoft-edge-stable",
        ] {
            if let Ok(out) = Command::new("which").arg(name).output() {
                if out.status.success() {
                    let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !p.is_empty() {
                        return Some(p);
                    }
                }
            }
        }
    }
    candidates
        .into_iter()
        .find(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
}

fn free_port() -> Option<u16> {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
}

async fn fetch_page_ws(port: u16) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(800))
        .build()
        .map_err(|e| e.to_string())?;
    let list: Value = client
        .get(format!("http://127.0.0.1:{port}/json/list"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let pages = list.as_array().ok_or("DevTools list was not an array")?;
    pages
        .iter()
        .find(|p| p.get("type").and_then(|t| t.as_str()) == Some("page"))
        .or(pages.first())
        .and_then(|p| p.get("webSocketDebuggerUrl").and_then(|u| u.as_str()))
        .map(|s| s.to_string())
        .ok_or_else(|| "No DevTools page target".into())
}

struct NetHit {
    url: String,
    status: u16,
    mime: String,
    failed: Option<String>,
}

async fn cdp_session(
    _port: u16,
    ws_url: &str,
    navigate: Option<&str>,
    already_open: bool,
) -> Result<String, String> {
    let (mut ws, _) = timeout(Duration::from_secs(5), tokio_tungstenite::connect_async(ws_url))
        .await
        .map_err(|_| "DevTools websocket timed out".to_string())?
        .map_err(|e| format!("DevTools websocket: {e}"))?;

    let mut next_id = 1u64;
    let mut send_cdp = |method: &str, params: Value| {
        let id = next_id;
        next_id += 1;
        (id, json!({"id": id, "method": method, "params": params}).to_string())
    };

    for (method, params) in [
        ("Network.enable", json!({})),
        ("Runtime.enable", json!({})),
        ("Console.enable", json!({})),
        ("Page.enable", json!({})),
    ] {
        let (_id, body) = send_cdp(method, params);
        ws.send(Message::Text(body.into()))
            .await
            .map_err(|e| e.to_string())?;
    }
    if let Some(url) = navigate {
        if !already_open || Url::parse(url).is_ok() {
            let (_id, body) = send_cdp("Page.navigate", json!({ "url": url }));
            ws.send(Message::Text(body.into()))
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    let mut hits: Vec<NetHit> = Vec::new();
    let mut console: Vec<String> = Vec::new();
    let mut loaded = false;
    let start = Instant::now();
    let max = Duration::from_secs(12);
    let mut last_event = Instant::now();

    while start.elapsed() < max {
        match timeout(Duration::from_millis(400), ws.next()).await {
            Ok(Some(Ok(Message::Text(text)))) => {
                last_event = Instant::now();
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    ingest_cdp_event(&v, &mut hits, &mut console, &mut loaded);
                }
            }
            Ok(Some(Ok(_))) => {}
            Ok(Some(Err(e))) => return Err(format!("DevTools socket: {e}")),
            Ok(None) => break,
            Err(_) => {
                if loaded && last_event.elapsed() > Duration::from_millis(800) {
                    break;
                }
            }
        }
    }

    let eval_script = r#"JSON.stringify({
      title: document.title,
      href: location.href,
      ready: document.readyState,
      resources: performance.getEntriesByType('resource').slice(0, 60).map(function(e) {
        return { name: e.name, ms: Math.round(e.duration), type: e.initiatorType, size: e.transferSize || 0 };
      })
    })"#;
    let (eid, body) = send_cdp(
        "Runtime.evaluate",
        json!({ "expression": eval_script, "returnByValue": true }),
    );
    ws.send(Message::Text(body.into()))
        .await
        .map_err(|e| e.to_string())?;
    let mut eval_result: Option<Value> = None;
    let eval_deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < eval_deadline {
        match timeout(Duration::from_millis(300), ws.next()).await {
            Ok(Some(Ok(Message::Text(text)))) => {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    if v.get("id").and_then(|i| i.as_u64()) == Some(eid) {
                        eval_result = v.get("result").cloned();
                        break;
                    }
                    ingest_cdp_event(&v, &mut hits, &mut console, &mut loaded);
                }
            }
            _ => break,
        }
    }
    let _ = ws.close(None).await;

    Ok(format_report(
        navigate.unwrap_or(""),
        &hits,
        &console,
        eval_result.as_ref(),
    ))
}

fn ingest_cdp_event(v: &Value, hits: &mut Vec<NetHit>, console: &mut Vec<String>, loaded: &mut bool) {
    let Some(method) = v.get("method").and_then(|m| m.as_str()) else {
        return;
    };
    match method {
        "Page.loadEventFired" => *loaded = true,
        "Network.responseReceived" => {
            if let Some(resp) = v.pointer("/params/response") {
                hits.push(NetHit {
                    url: resp.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string(),
                    status: resp.get("status").and_then(|s| s.as_u64()).unwrap_or(0) as u16,
                    mime: resp
                        .get("mimeType")
                        .and_then(|m| m.as_str())
                        .unwrap_or("")
                        .to_string(),
                    failed: None,
                });
            }
        }
        "Network.loadingFailed" => {
            let err = v
                .pointer("/params/errorText")
                .and_then(|u| u.as_str())
                .unwrap_or("failed")
                .to_string();
            hits.push(NetHit {
                url: "request".into(),
                status: 0,
                mime: String::new(),
                failed: Some(err),
            });
        }
        "Runtime.exceptionThrown" => {
            if let Some(text) = v
                .pointer("/params/exceptionDetails/text")
                .and_then(|t| t.as_str())
            {
                console.push(format!("exception: {text}"));
            }
        }
        "Runtime.consoleAPICalled" => {
            let typ = v
                .pointer("/params/type")
                .and_then(|t| t.as_str())
                .unwrap_or("");
            if typ == "error" || typ == "warning" {
                let text = v
                    .pointer("/params/args")
                    .and_then(|a| a.as_array())
                    .map(|args| {
                        args.iter()
                            .filter_map(|a| {
                                a.get("value")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                                    .or_else(|| {
                                        a.get("description").and_then(|d| d.as_str()).map(|s| s.to_string())
                                    })
                                    .or_else(|| a.get("value").map(|v| v.to_string()))
                            })
                            .collect::<Vec<_>>()
                            .join(" ")
                    })
                    .unwrap_or_default();
                if !text.is_empty() {
                    console.push(format!("{typ}: {text}"));
                }
            }
        }
        "Console.messageAdded" => {
            let level = v
                .pointer("/params/message/level")
                .and_then(|l| l.as_str())
                .unwrap_or("");
            if level == "error" || level == "warning" {
                let text = v
                    .pointer("/params/message/text")
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                console.push(format!("{level}: {text}"));
            }
        }
        _ => {}
    }
}

fn format_report(
    target: &str,
    hits: &[NetHit],
    console: &[String],
    eval_result: Option<&Value>,
) -> String {
    let mut out = String::new();
    out.push_str(&format!("Target: {target}\n"));

    if let Some(result) = eval_result.and_then(|r| r.pointer("/result/value")).and_then(|v| v.as_str()) {
        if let Ok(parsed) = serde_json::from_str::<Value>(result) {
            if let Some(title) = parsed.get("title").and_then(|t| t.as_str()) {
                out.push_str(&format!("Title: {title}\n"));
            }
            if let Some(href) = parsed.get("href").and_then(|t| t.as_str()) {
                out.push_str(&format!("Location: {href}\n"));
            }
        }
    }

    let failed: Vec<&NetHit> = hits
        .iter()
        .filter(|h| h.failed.is_some() || (h.status >= 400 && h.status != 0))
        .collect();
    out.push_str(&format!(
        "Network: {} requests, {} failed/4xx/5xx\n",
        hits.len(),
        failed.len()
    ));
    if failed.is_empty() {
        out.push_str("No failed network requests.\n");
    } else {
        out.push_str("Failed / error responses:\n");
        for hit in failed.iter().take(25) {
            if let Some(err) = &hit.failed {
                out.push_str(&format!("- FAIL {} ({err})\n", clip_url(&hit.url)));
            } else {
                out.push_str(&format!(
                    "- {} {} {}\n",
                    hit.status,
                    clip_url(&hit.url),
                    hit.mime
                ));
            }
        }
    }

    let notable: Vec<&NetHit> = hits
        .iter()
        .filter(|h| h.status > 0 && h.status < 400)
        .take(12)
        .collect();
    if !notable.is_empty() {
        out.push_str("Sample responses:\n");
        for hit in notable {
            out.push_str(&format!("- {} {}\n", hit.status, clip_url(&hit.url)));
        }
    }

    if console.is_empty() {
        out.push_str("Console: no errors or warnings captured.\n");
    } else {
        out.push_str("Console:\n");
        for line in console.iter().take(20) {
            out.push_str(&format!("- {line}\n"));
        }
    }

    if let Some(result) = eval_result.and_then(|r| r.pointer("/result/value")).and_then(|v| v.as_str()) {
        if let Ok(parsed) = serde_json::from_str::<Value>(result) {
            if let Some(resources) = parsed.get("resources").and_then(|r| r.as_array()) {
                let mut slow: Vec<&Value> = resources
                    .iter()
                    .filter(|r| r.get("ms").and_then(|m| m.as_u64()).unwrap_or(0) >= 400)
                    .collect();
                slow.sort_by_key(|r| std::cmp::Reverse(r.get("ms").and_then(|m| m.as_u64()).unwrap_or(0)));
                if !slow.is_empty() {
                    out.push_str("Slow resources (≥400ms):\n");
                    for r in slow.iter().take(8) {
                        let name = r.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        let ms = r.get("ms").and_then(|m| m.as_u64()).unwrap_or(0);
                        out.push_str(&format!("- {ms}ms {}\n", clip_url(name)));
                    }
                }
            }
        }
    }

    out.push_str(
        "\nCite failed requests, console errors, and slow resources. A clean inspect is not proof the product is correct — only that this load had no obvious runtime faults.",
    );
    out
}

fn clip_url(url: &str) -> String {
    if url.chars().count() <= 140 {
        return url.to_string();
    }
    let t: String = url.chars().take(140).collect();
    format!("{t}…")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_project(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("shape-inspect-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn detects_tauri() {
        let dir = temp_project("tauri");
        fs::create_dir_all(dir.join("src-tauri")).unwrap();
        fs::write(dir.join("src-tauri/tauri.conf.json"), "{}").unwrap();
        assert_eq!(detect_runtime_kind(dir.to_str().unwrap()), RuntimeKind::Tauri);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn detects_electron() {
        let dir = temp_project("electron");
        fs::write(
            dir.join("package.json"),
            r#"{"devDependencies":{"electron":"33.0.0"}}"#,
        )
        .unwrap();
        assert_eq!(detect_runtime_kind(dir.to_str().unwrap()), RuntimeKind::Electron);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn detects_wails() {
        let dir = temp_project("wails");
        fs::write(dir.join("wails.json"), "{}").unwrap();
        assert_eq!(detect_runtime_kind(dir.to_str().unwrap()), RuntimeKind::Wails);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn detects_next_website() {
        let dir = temp_project("next");
        fs::write(dir.join("next.config.ts"), "export default {}").unwrap();
        assert_eq!(detect_runtime_kind(dir.to_str().unwrap()), RuntimeKind::Website);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn rust_cli_is_unsupported() {
        let dir = temp_project("cli");
        fs::write(dir.join("Cargo.toml"), "[package]\nname=\"cli\"\nversion=\"0.1.0\"\n").unwrap();
        let kind = detect_runtime_kind(dir.to_str().unwrap());
        assert!(!kind.inspectable());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn winui_is_unsupported() {
        let dir = temp_project("winui");
        fs::write(dir.join("App.csproj"), "<Project></Project>").unwrap();
        let kind = detect_runtime_kind(dir.to_str().unwrap());
        assert!(!kind.inspectable());
        assert!(kind.label().contains("WinUI"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn godot_is_unsupported() {
        let dir = temp_project("godot");
        fs::write(dir.join("project.godot"), "").unwrap();
        let kind = detect_runtime_kind(dir.to_str().unwrap());
        assert!(!kind.inspectable());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn unsupported_message_is_honest() {
        let msg = unsupported_message(&RuntimeKind::Unsupported("Go service / CLI (no Chromium webview)".into()));
        assert!(msg.contains("cannot attach DevTools"));
        assert!(msg.contains("Electron, Tauri, or Wails"));
    }
}
