//! Headless Chromium shared by the agent's browse session and review personas.
//! There is no user-driven tab strip.

pub mod cdp;
pub mod webview_debug;

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{json, Value};

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
/// Debug port of the agent's browse session, when that Chromium is already up.
static LIVE_PORT: AtomicU16 = AtomicU16::new(0);
static HOST_GATE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// A page opened for a review persona.
pub struct IsolatedPage {
    pub ws: String,
    pub target_id: String,
    pub context_id: String,
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

/// Kill the shared Chromium process.
pub fn shutdown() {
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
