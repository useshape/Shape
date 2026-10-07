//! Headless Chromium for the agent's `browse` tool and design-review personas.
//! The Browser tab the user drives is an iframe in the main webview (`surface`), not this.

pub mod cdp;
#[cfg(windows)]
pub mod devtools_dock;
pub mod surface;
pub mod webview_debug;

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU16, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::Emitter;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

use crate::agent::tools::runtime_inspect::{find_chromium, free_port};

pub const VIEW_W: u32 = 1280;
pub const VIEW_H: u32 = 800;

struct Host {
    child: Child,
    port: u16,
    data_dir: PathBuf,
    browser_ws: String,
}

static HOST: Mutex<Option<Host>> = Mutex::new(None);
static TABS: Mutex<Vec<Tab>> = Mutex::new(Vec::new());
static ACTIVE: Mutex<Option<String>> = Mutex::new(None);
static CAST_GEN: AtomicU64 = AtomicU64::new(0);
/// Debug port of the agent's browse session, when that Chromium is already up.
static LIVE_PORT: AtomicU16 = AtomicU16::new(0);
static HOST_GATE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static TAB_SEQ: AtomicU64 = AtomicU64::new(1);
static HISTORY: Mutex<Option<Vec<HistoryEntry>>> = Mutex::new(None);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabInfo {
    pub id: String,
    pub url: String,
    pub title: String,
    pub loading: bool,
    pub can_back: bool,
    pub can_forward: bool,
    pub error: Option<String>,
    pub favicon: Option<String>,
}

struct Tab {
    info: TabInfo,
    target_id: String,
    ws: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub url: String,
    pub title: String,
    pub visits: u32,
    pub last: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TabsPayload {
    tabs: Vec<TabInfo>,
    active_id: Option<String>,
}

/// A page in its own browser context. Used by design-review personas.
pub struct IsolatedPage {
    pub ws: String,
    pub target_id: String,
    pub context_id: String,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn lock_tabs() -> std::sync::MutexGuard<'static, Vec<Tab>> {
    TABS.lock().unwrap_or_else(|p| p.into_inner())
}

fn tab_ws(id: &str) -> Result<String, String> {
    lock_tabs()
        .iter()
        .find(|t| t.info.id == id)
        .map(|t| t.ws.clone())
        .ok_or_else(|| "That tab is closed.".to_string())
}

fn tabs_payload() -> TabsPayload {
    let tabs = lock_tabs().iter().map(|t| t.info.clone()).collect();
    let active_id = ACTIVE.lock().unwrap_or_else(|p| p.into_inner()).clone();
    TabsPayload { tabs, active_id }
}

fn emit_tabs(app: &tauri::AppHandle) {
    let _ = app.emit("browser-tabs", tabs_payload());
}

fn update_tab(id: &str, f: impl FnOnce(&mut TabInfo)) -> bool {
    let mut tabs = lock_tabs();
    match tabs.iter_mut().find(|t| t.info.id == id) {
        Some(tab) => {
            f(&mut tab.info);
            true
        }
        None => false,
    }
}

// ---------------------------------------------------------------------------
// Chromium process

fn host_alive() -> Option<(u16, String)> {
    let guard = HOST.lock().unwrap_or_else(|p| p.into_inner());
    let host = guard.as_ref()?;
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], host.port));
    if std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
        Some((host.port, host.browser_ws.clone()))
    } else {
        None
    }
}

async fn fetch_browser_ws(port: u16) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(800))
        .build()
        .map_err(|e| e.to_string())?;
    let v: Value = client
        .get(format!("http://127.0.0.1:{port}/json/version"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    v.get("webSocketDebuggerUrl")
        .and_then(|u| u.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "DevTools has no browser endpoint".into())
}

/// Remember the browse tool's Chromium so design review can open pages there
/// instead of launching a second browser.
pub fn note_live_port(port: u16) {
    LIVE_PORT.store(port, Ordering::SeqCst);
}

pub fn clear_live_port() {
    LIVE_PORT.store(0, Ordering::SeqCst);
}

async fn ensure_host() -> Result<(u16, String), String> {
    let _gate = HOST_GATE.lock().await;
    if let Some(alive) = host_alive() {
        return Ok(alive);
    }
    shutdown();
    let browser = find_chromium().ok_or_else(|| {
        "No Chrome or Edge found. Install one to use the browser inside Shape.".to_string()
    })?;
    let port = free_port().ok_or_else(|| "Could not find a free debug port.".to_string())?;
    let data_dir = std::env::temp_dir().join(format!("shape-browser-{port}"));
    let _ = std::fs::create_dir_all(&data_dir);
    let mut cmd = Command::new(&browser);
    cmd.args([
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--disable-extensions",
        "--disable-background-networking",
        "--hide-scrollbars",
        &format!("--window-size={VIEW_W},{VIEW_H}"),
        "--force-device-scale-factor=1",
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
        .map_err(|e| format!("Failed to launch the browser ({browser}): {e}"))?;

    let deadline = Instant::now() + Duration::from_secs(8);
    let mut browser_ws = None;
    while Instant::now() < deadline {
        if let Ok(ws) = fetch_browser_ws(port).await {
            browser_ws = Some(ws);
            break;
        }
        tokio::time::sleep(Duration::from_millis(120)).await;
    }
    let Some(browser_ws) = browser_ws else {
        let mut child = child;
        kill_child(&mut child);
        let _ = std::fs::remove_dir_all(&data_dir);
        return Err("The browser started but DevTools never came up.".into());
    };
    let mut guard = HOST.lock().unwrap_or_else(|p| p.into_inner());
    *guard = Some(Host {
        child,
        port,
        data_dir,
        browser_ws: browser_ws.clone(),
    });
    Ok((port, browser_ws))
}

fn kill_child(child: &mut Child) {
    let pid = child.id();
    let _ = child.kill();
    let _ = child.wait();
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
    }
}

/// Kill the browser process and forget every tab.
pub fn shutdown() {
    CAST_GEN.fetch_add(1, Ordering::SeqCst);
    lock_tabs().clear();
    *ACTIVE.lock().unwrap_or_else(|p| p.into_inner()) = None;
    let mut guard = HOST.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(mut host) = guard.take() {
        kill_child(&mut host.child);
        let _ = std::fs::remove_dir_all(&host.data_dir);
    }
}

async fn create_target(
    port: u16,
    browser_ws: &str,
    url: &str,
    context_id: Option<&str>,
) -> Result<(String, String), String> {
    // Width and height are only valid when newWindow is true. Chrome rejects
    // them on a tab with "Target position can only be set for new windows".
    let mut params = json!({ "url": url });
    if let Some(ctx) = context_id {
        params["browserContextId"] = json!(ctx);
    }
    let v = cdp::call(browser_ws, "Target.createTarget", params).await?;
    let target_id = v
        .get("targetId")
        .and_then(|t| t.as_str())
        .ok_or_else(|| "DevTools did not return a target".to_string())?
        .to_string();
    let ws = format!("ws://127.0.0.1:{port}/devtools/page/{target_id}");
    let _ = cdp::call_all(
        &ws,
        vec![
            ("Page.enable", json!({})),
            (
                "Emulation.setDeviceMetricsOverride",
                json!({
                    "width": VIEW_W,
                    "height": VIEW_H,
                    "deviceScaleFactor": 1,
                    "mobile": false,
                    "scale": 1
                }),
            ),
            ("Emulation.setFocusEmulationEnabled", json!({ "enabled": true })),
        ],
    )
    .await;
    Ok((target_id, ws))
}

/// Open a page for a design-review persona. Prefer the browse tool's Chromium
/// when it is already running. A private context is used when DevTools allows
/// it; otherwise the page is a normal tab in that same browser.
pub async fn open_isolated_page(url: &str) -> Result<IsolatedPage, String> {
    let preferred = LIVE_PORT.load(Ordering::SeqCst);
    if preferred != 0 {
        if let Ok(ws) = fetch_browser_ws(preferred).await {
            if let Ok(page) = open_review_page(preferred, &ws, url).await {
                return Ok(page);
            }
        }
    }
    let (port, browser_ws) = ensure_host().await?;
    open_review_page(port, &browser_ws, url).await
}

async fn open_review_page(port: u16, browser_ws: &str, url: &str) -> Result<IsolatedPage, String> {
    // A private browser context makes Edge show "you don't have the user rights
    // to view this page" for normal sites. A regular tab in the same browser loads.
    let (target_id, ws) = create_target(port, browser_ws, url, None).await?;
    Ok(IsolatedPage {
        ws,
        target_id,
        context_id: String::new(),
    })
}

pub async fn close_isolated_page(page: &IsolatedPage) {
    let browser_ws = if let Some((_, ws)) = host_alive() {
        Some(ws)
    } else {
        let port = LIVE_PORT.load(Ordering::SeqCst);
        if port == 0 {
            None
        } else {
            fetch_browser_ws(port).await.ok()
        }
    };
    let Some(browser_ws) = browser_ws else {
        return;
    };
    let _ = cdp::call(
        &browser_ws,
        "Target.closeTarget",
        json!({ "targetId": page.target_id }),
    )
    .await;
    if !page.context_id.is_empty() {
        let _ = cdp::call(
            &browser_ws,
            "Target.disposeBrowserContext",
            json!({ "browserContextId": page.context_id }),
        )
        .await;
    }
}

// ---------------------------------------------------------------------------
// Page state

const STATE_JS: &str = r#"(function(){
  var href = location.href || "";
  var failed = href.indexOf("chrome-error") === 0 || href.indexOf("edge-error") === 0 || !!document.getElementById("main-frame-error");
  var icon = "";
  try {
    var link = document.querySelector('link[rel~="icon"]');
    if (link && link.href) icon = String(link.href);
  } catch (e) {}
  return JSON.stringify({ href: href, title: document.title || "", ready: document.readyState, failed: failed, icon: icon });
})()"#;

fn friendly_error(raw: &str) -> String {
    let code = raw.trim();
    let upper = code.to_ascii_uppercase();
    if upper.contains("NAME_NOT_RESOLVED") {
        return "This site's address couldn't be found.".into();
    }
    if upper.contains("CONNECTION_REFUSED") {
        return "Nothing is listening at this address.".into();
    }
    if upper.contains("CONNECTION_TIMED_OUT") || upper.contains("TIMED_OUT") {
        return "The site took too long to respond.".into();
    }
    if upper.contains("INTERNET_DISCONNECTED") {
        return "You're offline.".into();
    }
    if upper.contains("CERT") || upper.contains("SSL") {
        return "This site's security certificate isn't valid.".into();
    }
    if upper.contains("CONNECTION_RESET") || upper.contains("CONNECTION_CLOSED") {
        return "The connection was closed before the page loaded.".into();
    }
    if upper.contains("BLOCKED_BY_CLIENT") || upper.contains("BLOCKED_BY_RESPONSE") {
        return "This page refused to load here.".into();
    }
    if upper.contains("ABORTED") {
        return "The page load was interrupted.".into();
    }
    if code.is_empty() {
        "This site can't be reached.".into()
    } else {
        format!("This site can't be reached ({code}).")
    }
}

pub(crate) fn record_history(url: &str, title: &str) {
    if url.is_empty() || url.starts_with("about:") || url.starts_with("chrome") {
        return;
    }
    let mut list = load_history();
    let now = now_ms();
    if let Some(entry) = list.iter_mut().find(|e| e.url == url) {
        entry.visits = entry.visits.saturating_add(1);
        entry.last = now;
        if !title.is_empty() {
            entry.title = title.to_string();
        }
    } else {
        list.push(HistoryEntry {
            url: url.to_string(),
            title: title.to_string(),
            visits: 1,
            last: now,
        });
    }
    if list.len() > 2000 {
        list.sort_by(|a, b| b.last.cmp(&a.last));
        list.truncate(2000);
    }
    save_history(list);
}

fn history_path() -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("Shape");
    let _ = std::fs::create_dir_all(&path);
    path.push("browser_history.json");
    path
}

fn load_history() -> Vec<HistoryEntry> {
    let mut guard = HISTORY.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(list) = guard.as_ref() {
        return list.clone();
    }
    let list: Vec<HistoryEntry> = std::fs::read_to_string(history_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    *guard = Some(list.clone());
    list
}

fn save_history(list: Vec<HistoryEntry>) {
    if let Ok(text) = serde_json::to_string(&list) {
        let _ = std::fs::write(history_path(), text);
    }
    *HISTORY.lock().unwrap_or_else(|p| p.into_inner()) = Some(list);
}

/// Re-read title, URL, history position and failure state from the page.
async fn refresh_tab(app: &tauri::AppHandle, id: &str) -> bool {
    let Ok(ws) = tab_ws(id) else {
        return false;
    };
    let (state, nav) = tokio::join!(
        cdp::eval(&ws, STATE_JS),
        cdp::call(&ws, "Page.getNavigationHistory", json!({}))
    );
    let state: Value = state
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null);
    let href = state.get("href").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let title = state.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let ready = state.get("ready").and_then(|v| v.as_str()).unwrap_or("");
    let failed = state.get("failed").and_then(|v| v.as_bool()).unwrap_or(false);
    let icon = state
        .get("icon")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let (can_back, can_forward) = nav
        .ok()
        .map(|v| {
            let index = v.get("currentIndex").and_then(|i| i.as_i64()).unwrap_or(0);
            let count = v
                .get("entries")
                .and_then(|e| e.as_array())
                .map(|e| e.len() as i64)
                .unwrap_or(1);
            (index > 0, index + 1 < count)
        })
        .unwrap_or((false, false));

    let mut changed_url = false;
    let complete = ready == "complete";
    update_tab(id, |info| {
        if !href.is_empty() && !failed {
            if info.url != href {
                changed_url = true;
            }
            info.url = href.clone();
            info.error = None;
        } else if failed && info.error.is_none() {
            info.error = Some("This site can't be reached.".into());
        }
        if !title.is_empty() && !failed {
            info.title = title.clone();
        } else if info.title.is_empty() {
            info.title = short_host(&info.url);
        }
        if complete || failed {
            info.loading = false;
        }
        info.can_back = can_back;
        info.can_forward = can_forward;
        if icon.is_some() {
            info.favicon = icon.clone();
        }
    });
    if complete && !failed && !href.is_empty() {
        let title_for_history = if title.is_empty() { short_host(&href) } else { title.clone() };
        if changed_url || !title.is_empty() {
            record_history(&href, &title_for_history);
        }
    }
    emit_tabs(app);
    complete || failed
}

fn short_host(url: &str) -> String {
    url.trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or("")
        .to_string()
}

/// After a navigation, poll until the document settles so the tab strip and
/// history update without the UI asking.
fn settle_tab(app: tauri::AppHandle, id: String) {
    tauri::async_runtime::spawn(async move {
        for delay in [200u64, 400, 700, 1200, 2000, 3000] {
            tokio::time::sleep(Duration::from_millis(delay)).await;
            if tab_ws(&id).is_err() {
                return;
            }
            if refresh_tab(&app, &id).await {
                // One more pass for SPAs that set the title after load.
                tokio::time::sleep(Duration::from_millis(600)).await;
                refresh_tab(&app, &id).await;
                return;
            }
        }
        update_tab(&id, |info| info.loading = false);
        emit_tabs(&app);
    });
}

async fn navigate_tab(app: &tauri::AppHandle, id: &str, url: &str) -> Result<(), String> {
    let ws = tab_ws(id)?;
    update_tab(id, |info| {
        info.loading = true;
        info.error = None;
        info.url = url.to_string();
        info.title = short_host(url);
        info.favicon = None;
    });
    emit_tabs(app);
    let result = cdp::call(&ws, "Page.navigate", json!({ "url": url })).await;
    match result {
        Ok(v) => {
            if let Some(err) = v
                .get("errorText")
                .and_then(|e| e.as_str())
                .filter(|s| !s.is_empty())
            {
                let message = friendly_error(err);
                update_tab(id, |info| {
                    info.loading = false;
                    info.error = Some(message);
                });
                emit_tabs(app);
                return Ok(());
            }
            settle_tab(app.clone(), id.to_string());
            Ok(())
        }
        Err(e) => {
            let message = friendly_error(&e);
            update_tab(id, |info| {
                info.loading = false;
                info.error = Some(message);
            });
            emit_tabs(app);
            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// Screencast

fn start_cast(app: tauri::AppHandle, id: String) {
    let gen = CAST_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        while CAST_GEN.load(Ordering::SeqCst) == gen {
            if tab_ws(&id).is_err() {
                break;
            }
            match run_cast(&app, &id, gen).await {
                Ok(()) => break,
                Err(_) => tokio::time::sleep(Duration::from_millis(300)).await,
            }
        }
    });
}

async fn run_cast(app: &tauri::AppHandle, id: &str, gen: u64) -> Result<(), String> {
    let ws_url = tab_ws(id)?;
    let (mut ws, _) = timeout(Duration::from_secs(8), tokio_tungstenite::connect_async(&ws_url))
        .await
        .map_err(|_| "DevTools websocket timed out".to_string())?
        .map_err(|e| format!("DevTools websocket: {e}"))?;
    let start = json!({
        "id": 1,
        "method": "Page.startScreencast",
        "params": {
            "format": "jpeg",
            "quality": 60,
            "maxWidth": VIEW_W,
            "maxHeight": VIEW_H,
            "everyNthFrame": 1
        }
    });
    ws.send(Message::Text(start.to_string().into()))
        .await
        .map_err(|e| e.to_string())?;
    let mut ack_id: u64 = 10;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut last_refresh = Instant::now();
    while CAST_GEN.load(Ordering::SeqCst) == gen {
        if last_refresh.elapsed() > Duration::from_millis(1500) {
            last_refresh = Instant::now();
            let is_loading = lock_tabs()
                .iter()
                .find(|t| t.info.id == id)
                .map(|t| t.info.loading)
                .unwrap_or(false);
            if !is_loading {
                refresh_tab(app, id).await;
            }
        }
        match timeout(Duration::from_secs(2), ws.next()).await {
            Ok(Some(Ok(Message::Text(text)))) => {
                let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
                if v.get("method").and_then(|m| m.as_str()) != Some("Page.screencastFrame") {
                    continue;
                }
                let session_id = v.pointer("/params/sessionId").cloned().unwrap_or(Value::Null);
                ack_id += 1;
                let ack = json!({
                    "id": ack_id,
                    "method": "Page.screencastFrameAck",
                    "params": { "sessionId": session_id }
                });
                let _ = ws.send(Message::Text(ack.to_string().into())).await;
                if last_emit.elapsed() < Duration::from_millis(60) {
                    continue;
                }
                let Some(data) = v.pointer("/params/data").and_then(|d| d.as_str()) else {
                    continue;
                };
                if data.is_empty() {
                    continue;
                }
                last_emit = Instant::now();
                let _ = app.emit(
                    "browser-frame",
                    json!({ "tabId": id, "image": format!("data:image/jpeg;base64,{data}") }),
                );
            }
            Ok(Some(Ok(_))) => {}
            Ok(Some(Err(_))) | Ok(None) => return Err("Screencast socket closed.".into()),
            Err(_) => {}
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Commands

#[tauri::command]
pub fn browser_tabs() -> Value {
    serde_json::to_value(tabs_payload()).unwrap_or(Value::Null)
}

#[tauri::command]
pub async fn browser_open_tab(
    app: tauri::AppHandle,
    url: Option<String>,
    activate: Option<bool>,
) -> Result<TabInfo, String> {
    let (port, browser_ws) = ensure_host().await?;
    let (target_id, ws) = create_target(port, &browser_ws, "about:blank", None).await?;
    let id = format!("tab-{}", TAB_SEQ.fetch_add(1, Ordering::SeqCst));
    let info = TabInfo {
        id: id.clone(),
        url: String::new(),
        title: "New tab".into(),
        loading: false,
        can_back: false,
        can_forward: false,
        error: None,
        favicon: None,
    };
    lock_tabs().push(Tab {
        info: info.clone(),
        target_id,
        ws,
    });
    if activate.unwrap_or(true) {
        *ACTIVE.lock().unwrap_or_else(|p| p.into_inner()) = Some(id.clone());
        start_cast(app.clone(), id.clone());
    }
    emit_tabs(&app);
    if let Some(url) = url.filter(|u| !u.trim().is_empty()) {
        navigate_tab(&app, &id, url.trim()).await?;
    }
    Ok(lock_tabs()
        .iter()
        .find(|t| t.info.id == id)
        .map(|t| t.info.clone())
        .unwrap_or(info))
}

#[tauri::command]
pub async fn browser_close_tab(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let target = {
        let mut tabs = lock_tabs();
        let pos = tabs.iter().position(|t| t.info.id == id);
        pos.map(|p| tabs.remove(p).target_id)
    };
    let fallback = lock_tabs().last().map(|t| t.info.id.clone());
    let next_active = {
        let mut active = ACTIVE.lock().unwrap_or_else(|p| p.into_inner());
        if active.as_deref() == Some(id.as_str()) {
            *active = fallback;
            Some(active.clone())
        } else {
            None
        }
    };
    if let Some(next) = next_active {
        match next {
            Some(next_id) => start_cast(app.clone(), next_id),
            None => {
                CAST_GEN.fetch_add(1, Ordering::SeqCst);
            }
        }
    }
    emit_tabs(&app);
    if let (Some(target_id), Some((_, browser_ws))) = (target, host_alive()) {
        let _ = cdp::call(&browser_ws, "Target.closeTarget", json!({ "targetId": target_id })).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_activate_tab(app: tauri::AppHandle, id: String) -> Result<(), String> {
    tab_ws(&id)?;
    *ACTIVE.lock().unwrap_or_else(|p| p.into_inner()) = Some(id.clone());
    start_cast(app.clone(), id.clone());
    emit_tabs(&app);
    refresh_tab(&app, &id).await;
    Ok(())
}

#[tauri::command]
pub async fn browser_navigate(app: tauri::AppHandle, id: String, url: String) -> Result<(), String> {
    navigate_tab(&app, &id, url.trim()).await
}

#[tauri::command]
pub async fn browser_back(app: tauri::AppHandle, id: String) -> Result<(), String> {
    history_step(&app, &id, -1).await
}

#[tauri::command]
pub async fn browser_forward(app: tauri::AppHandle, id: String) -> Result<(), String> {
    history_step(&app, &id, 1).await
}

async fn history_step(app: &tauri::AppHandle, id: &str, delta: i64) -> Result<(), String> {
    let ws = tab_ws(id)?;
    let nav = cdp::call(&ws, "Page.getNavigationHistory", json!({})).await?;
    let index = nav.get("currentIndex").and_then(|i| i.as_i64()).unwrap_or(0);
    let entries = nav.get("entries").and_then(|e| e.as_array()).cloned().unwrap_or_default();
    let target = index + delta;
    if target < 0 || target >= entries.len() as i64 {
        return Ok(());
    }
    let entry = &entries[target as usize];
    let entry_id = entry.get("id").and_then(|i| i.as_i64()).unwrap_or(0);
    let url = entry.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string();
    update_tab(id, |info| {
        info.loading = true;
        info.error = None;
        if !url.is_empty() {
            info.url = url.clone();
        }
    });
    emit_tabs(app);
    cdp::call(&ws, "Page.navigateToHistoryEntry", json!({ "entryId": entry_id })).await?;
    settle_tab(app.clone(), id.to_string());
    Ok(())
}

#[tauri::command]
pub async fn browser_reload(app: tauri::AppHandle, id: String, hard: Option<bool>) -> Result<(), String> {
    let ws = tab_ws(&id)?;
    let has_error = lock_tabs()
        .iter()
        .find(|t| t.info.id == id)
        .map(|t| t.info.error.is_some())
        .unwrap_or(false);
    if has_error {
        let url = lock_tabs()
            .iter()
            .find(|t| t.info.id == id)
            .map(|t| t.info.url.clone())
            .unwrap_or_default();
        if !url.is_empty() {
            return navigate_tab(&app, &id, &url).await;
        }
    }
    update_tab(&id, |info| {
        info.loading = true;
        info.error = None;
    });
    emit_tabs(&app);
    cdp::call(&ws, "Page.reload", json!({ "ignoreCache": hard.unwrap_or(false) })).await?;
    settle_tab(app.clone(), id);
    Ok(())
}

fn percent_to_px(x: f64, y: f64) -> (f64, f64) {
    (
        (x.clamp(0.0, 100.0) / 100.0 * VIEW_W as f64).round(),
        (y.clamp(0.0, 100.0) / 100.0 * VIEW_H as f64).round(),
    )
}

fn key_code_for(key: &str) -> Option<u32> {
    Some(match key {
        "Enter" => 13,
        "Backspace" => 8,
        "Tab" => 9,
        "Escape" => 27,
        "Delete" => 46,
        "ArrowLeft" => 37,
        "ArrowUp" => 38,
        "ArrowRight" => 39,
        "ArrowDown" => 40,
        "Home" => 36,
        "End" => 35,
        "PageUp" => 33,
        "PageDown" => 34,
        " " => 32,
        "Shift" => 16,
        "Control" => 17,
        "Alt" => 18,
        "Meta" => 91,
        "F5" => 116,
        other if other.chars().count() == 1 => {
            let c = other.chars().next()?.to_ascii_uppercase();
            if c.is_ascii_alphanumeric() {
                c as u32
            } else {
                return None;
            }
        }
        _ => return None,
    })
}

/// Pointer, wheel and keyboard input forwarded from the Browser tab.
/// Coordinates are percentages of the page (the UI scales the frame).
#[tauri::command]
pub async fn browser_input(id: String, event: Value) -> Result<(), String> {
    let ws = tab_ws(&id)?;
    let kind = event.get("kind").and_then(|k| k.as_str()).unwrap_or("");
    let x = event.get("x").and_then(|v| v.as_f64()).unwrap_or(50.0);
    let y = event.get("y").and_then(|v| v.as_f64()).unwrap_or(50.0);
    let (px, py) = percent_to_px(x, y);
    let modifiers = event.get("modifiers").and_then(|v| v.as_u64()).unwrap_or(0);
    let button = event
        .get("button")
        .and_then(|b| b.as_str())
        .unwrap_or("left")
        .to_string();
    let clicks = event.get("clicks").and_then(|c| c.as_u64()).unwrap_or(1);
    match kind {
        "move" => {
            cdp::call(
                &ws,
                "Input.dispatchMouseEvent",
                json!({ "type": "mouseMoved", "x": px, "y": py, "modifiers": modifiers }),
            )
            .await?;
        }
        "down" | "up" => {
            let ty = if kind == "down" { "mousePressed" } else { "mouseReleased" };
            cdp::call(
                &ws,
                "Input.dispatchMouseEvent",
                json!({
                    "type": ty,
                    "x": px,
                    "y": py,
                    "button": button,
                    "clickCount": clicks,
                    "modifiers": modifiers
                }),
            )
            .await?;
        }
        "click" => {
            cdp::call_all(
                &ws,
                vec![
                    ("Input.dispatchMouseEvent", json!({ "type": "mouseMoved", "x": px, "y": py })),
                    (
                        "Input.dispatchMouseEvent",
                        json!({ "type": "mousePressed", "x": px, "y": py, "button": button, "clickCount": clicks, "modifiers": modifiers }),
                    ),
                    (
                        "Input.dispatchMouseEvent",
                        json!({ "type": "mouseReleased", "x": px, "y": py, "button": button, "clickCount": clicks, "modifiers": modifiers }),
                    ),
                ],
            )
            .await?;
        }
        "wheel" => {
            let dx = event.get("dx").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let dy = event.get("dy").and_then(|v| v.as_f64()).unwrap_or(0.0);
            cdp::call(
                &ws,
                "Input.dispatchMouseEvent",
                json!({ "type": "mouseWheel", "x": px, "y": py, "deltaX": dx, "deltaY": dy, "modifiers": modifiers }),
            )
            .await?;
        }
        "text" => {
            let text = event.get("text").and_then(|t| t.as_str()).unwrap_or("");
            if !text.is_empty() {
                cdp::call(&ws, "Input.insertText", json!({ "text": text })).await?;
            }
        }
        "key" => {
            let key = event.get("key").and_then(|k| k.as_str()).unwrap_or("");
            let code = event.get("code").and_then(|c| c.as_str()).unwrap_or("");
            let ty = event.get("type").and_then(|t| t.as_str()).unwrap_or("keyDown");
            let mut params = json!({
                "type": ty,
                "key": key,
                "code": code,
                "modifiers": modifiers
            });
            if let Some(vk) = key_code_for(key) {
                params["windowsVirtualKeyCode"] = json!(vk);
                params["nativeVirtualKeyCode"] = json!(vk);
            }
            if ty == "keyDown" && key == "Enter" {
                params["text"] = json!("\r");
                params["unmodifiedText"] = json!("\r");
            }
            // Ctrl / Cmd editing shortcuts need explicit editor commands in headless.
            if ty == "keyDown" && (modifiers & 2 != 0 || modifiers & 4 != 0) {
                let command = match key.to_ascii_lowercase().as_str() {
                    "a" => Some("selectAll"),
                    "c" => Some("copy"),
                    "x" => Some("cut"),
                    "z" if modifiers & 8 != 0 => Some("redo"),
                    "z" => Some("undo"),
                    "y" => Some("redo"),
                    _ => None,
                };
                if let Some(command) = command {
                    params["commands"] = json!([command]);
                }
            }
            cdp::call(&ws, "Input.dispatchKeyEvent", params).await?;
        }
        other => return Err(format!("Unknown input kind '{other}'.")),
    }
    Ok(())
}

const PICK_JS: &str = r##"(function(x, y, commit){
  var el = document.elementFromPoint(x, y);
  if (!el || el === document.documentElement || el === document.body) return "";
  var r = el.getBoundingClientRect();
  var W = window.innerWidth || 1, H = window.innerHeight || 1;
  function short(e) {
    var tag = e.tagName.toLowerCase();
    if (e.id) return tag + "#" + e.id;
    var cls = (typeof e.className === "string" ? e.className : "").trim().split(/\s+/).filter(function(c){ return c && c.length < 32 && !/[\[\]:]/.test(c); }).slice(0, 2);
    return cls.length ? tag + "." + cls.join(".") : tag;
  }
  function selector(e) {
    var parts = [];
    var cur = e;
    while (cur && cur.nodeType === 1 && parts.length < 4) {
      var part = short(cur);
      if (cur.id) { parts.unshift(part); break; }
      var parent = cur.parentElement;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function(c){ return c.tagName === cur.tagName; });
        if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(cur) + 1) + ")";
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(" > ");
  }
  var out = {
    tag: el.tagName.toLowerCase(),
    label: short(el),
    selector: selector(el),
    rect: { x: r.left / W * 100, y: r.top / H * 100, w: r.width / W * 100, h: r.height / H * 100 }
  };
  if (commit) {
    out.text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("alt") || "").replace(/\s+/g, " ").trim().slice(0, 400);
    var html = el.outerHTML || "";
    out.html = html.length > 2400 ? html.slice(0, 2400) + "…" : html;
    var cs = getComputedStyle(el);
    out.styles = {
      color: cs.color, background: cs.backgroundColor, font: cs.fontSize + " " + cs.fontWeight + " " + cs.fontFamily.split(",")[0],
      padding: cs.padding, margin: cs.margin, radius: cs.borderRadius, display: cs.display
    };
    out.size = { w: Math.round(r.width), h: Math.round(r.height) };
    out.url = location.href;
    out.title = document.title || "";
  }
  return JSON.stringify(out);
})"##;

/// Element under a point. `commit` adds text, HTML and computed styles.
#[tauri::command]
pub async fn browser_pick(id: String, x: f64, y: f64, commit: Option<bool>) -> Result<Value, String> {
    let ws = tab_ws(&id)?;
    let (px, py) = percent_to_px(x, y);
    let expr = format!("{PICK_JS}({px}, {py}, {})", commit.unwrap_or(false));
    let raw = cdp::eval(&ws, &expr).await?;
    if raw.is_empty() {
        return Ok(Value::Null);
    }
    Ok(serde_json::from_str(&raw).unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn browser_screenshot(id: String) -> Result<String, String> {
    let ws = tab_ws(&id)?;
    let png = cdp::screenshot_png(&ws).await?;
    let bytes = base64_decode(&png)?;
    let mut dir = dirs::download_dir()
        .or_else(dirs::picture_dir)
        .or_else(dirs::home_dir)
        .ok_or_else(|| "No folder to save into.".to_string())?;
    let stamp = chrono_like_stamp();
    dir.push(format!("Shape screenshot {stamp}.png"));
    std::fs::write(&dir, bytes).map_err(|e| format!("Could not save screenshot: {e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

fn chrono_like_stamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Civil date from days since epoch (Howard Hinnant's algorithm).
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}-{m:02}-{d:02} {:02}.{:02}.{:02}",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    fn val(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a') as u32 + 26),
            b'0'..=b'9' => Some((c - b'0') as u32 + 52),
            b'+' | b'-' => Some(62),
            b'/' | b'_' => Some(63),
            _ => None,
        }
    }
    let bytes: Vec<u8> = input.bytes().filter(|b| !b.is_ascii_whitespace() && *b != b'=').collect();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    let mut buf = 0u32;
    let mut bits = 0u32;
    for b in bytes {
        let v = val(b).ok_or_else(|| "Bad screenshot data".to_string())?;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buf >> bits) & 0xFF) as u8);
        }
    }
    Ok(out)
}

/// Clear browsing data. `kind` is history, cookies or cache.
#[tauri::command]
pub async fn browser_clear(kind: String) -> Result<(), String> {
    match kind.as_str() {
        "history" => {
            save_history(Vec::new());
            Ok(())
        }
        "cookies" | "cache" => {
            let ws = lock_tabs().first().map(|t| t.ws.clone());
            let Some(ws) = ws else {
                return Ok(());
            };
            let method = if kind == "cookies" {
                "Network.clearBrowserCookies"
            } else {
                "Network.clearBrowserCache"
            };
            cdp::call_all(&ws, vec![("Network.enable", json!({})), (method, json!({}))])
                .await
                .map(|_| ())
        }
        other => Err(format!("Unknown data kind '{other}'.")),
    }
}

/// History entries matching the typed text, most useful first.
#[tauri::command]
pub fn browser_history(query: Option<String>, limit: Option<usize>) -> Vec<HistoryEntry> {
    let q = query.unwrap_or_default().trim().to_ascii_lowercase();
    let mut list = load_history();
    if !q.is_empty() {
        list.retain(|e| {
            e.url.to_ascii_lowercase().contains(&q) || e.title.to_ascii_lowercase().contains(&q)
        });
    }
    list.sort_by(|a, b| {
        let a_prefix = q.is_empty() || short_host(&a.url).to_ascii_lowercase().starts_with(&q);
        let b_prefix = q.is_empty() || short_host(&b.url).to_ascii_lowercase().starts_with(&q);
        b_prefix
            .cmp(&a_prefix)
            .then(b.visits.cmp(&a.visits))
            .then(b.last.cmp(&a.last))
    });
    list.truncate(limit.unwrap_or(8).clamp(1, 50));
    list
}

#[tauri::command]
pub fn browser_shutdown() {
    shutdown();
}
