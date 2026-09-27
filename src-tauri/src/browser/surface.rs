//! The Browser tab the user drives. Each tab is a child webview inside the main
//! window (Tauri multi-webview). Shape draws the toolbar; the webview draws the
//! page. Built-in error pages and the WebView2 context menu are turned off.
//!
//! The agent's browser is a separate headless process and does not come through here.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl};

const HOST_SCRIPT: &str = r##"
(function () {
  if (window.__shapeBrowser) return;
  window.__shapeBrowser = true;
  window.__shapePick = false;
  function send(payload) {
    try { window.chrome.webview.postMessage(payload); } catch (e) {}
  }
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    send({ type: "menu", x: e.clientX, y: e.clientY });
  }, true);
  document.addEventListener("click", function (e) {
    if (!window.__shapePick) return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (!el || !el.tagName) return;
    var r = el.getBoundingClientRect();
    var vw = window.innerWidth || 1;
    var vh = window.innerHeight || 1;
    var text = "";
    try { text = String(el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 400); } catch (err) {}
    send({
      type: "pick",
      tag: String(el.tagName || "").toLowerCase(),
      label: (el.id ? "#" + el.id : String(el.tagName || "").toLowerCase()),
      selector: el.id ? "#" + el.id : String(el.tagName || "").toLowerCase(),
      rect: { x: (r.left / vw) * 100, y: (r.top / vh) * 100, w: (r.width / vw) * 100, h: (r.height / vh) * 100 },
      text: text,
      url: String(location.href || ""),
      title: String(document.title || "")
    });
  }, true);
})();
"##;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceState {
    id: String,
    url: String,
    title: String,
    can_back: bool,
    can_forward: bool,
}

struct Bounds {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    shown: bool,
}

static SEQ: AtomicU64 = AtomicU64::new(1);
static TABS: Mutex<Vec<String>> = Mutex::new(Vec::new());
static ACTIVE: Mutex<Option<String>> = Mutex::new(None);
static BOUNDS: Mutex<Bounds> = Mutex::new(Bounds { x: 0.0, y: 0.0, w: 0.0, h: 0.0, shown: false });
/// URL to keep in the address bar after we replace a failed load with our own page.
static FAILED: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());

fn tabs() -> std::sync::MutexGuard<'static, Vec<String>> {
    TABS.lock().unwrap_or_else(|p| p.into_inner())
}

fn active_id() -> Option<String> {
    ACTIVE.lock().unwrap_or_else(|p| p.into_inner()).clone()
}

fn set_active(id: Option<String>) {
    *ACTIVE.lock().unwrap_or_else(|p| p.into_inner()) = id;
}

fn remember_failure(id: &str, url: &str) {
    let mut list = FAILED.lock().unwrap_or_else(|p| p.into_inner());
    list.retain(|(k, _)| k != id);
    list.push((id.to_string(), url.to_string()));
}

fn take_failure(id: &str) -> Option<String> {
    let mut list = FAILED.lock().unwrap_or_else(|p| p.into_inner());
    let url = list.iter().find(|(k, _)| k == id).map(|(_, u)| u.clone());
    list.retain(|(k, _)| k != id);
    url
}

fn peek_failure(id: &str) -> Option<String> {
    FAILED
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .iter()
        .find(|(k, _)| k == id)
        .map(|(_, u)| u.clone())
}

fn error_sentence(code: i32) -> &'static str {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    let status = COREWEBVIEW2_WEB_ERROR_STATUS(code);
    if status == COREWEBVIEW2_WEB_ERROR_STATUS_HOST_NAME_NOT_RESOLVED {
        "This site's address couldn't be found."
    } else if status == COREWEBVIEW2_WEB_ERROR_STATUS_CANNOT_CONNECT
        || status == COREWEBVIEW2_WEB_ERROR_STATUS_SERVER_UNREACHABLE
    {
        "Nothing is listening at this address."
    } else if status == COREWEBVIEW2_WEB_ERROR_STATUS_TIMEOUT {
        "The site took too long to respond."
    } else if status == COREWEBVIEW2_WEB_ERROR_STATUS_DISCONNECTED {
        "You're offline."
    } else if status == COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_ABORTED {
        "The connection was closed before the page loaded."
    } else if (1..=5).contains(&code) {
        "This site's security certificate isn't valid."
    } else {
        "This site can't be reached."
    }
}

fn error_html(message: &str, url: &str) -> String {
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><title>Can't reach</title>
<style>
html,body{{margin:0;height:100%;background:#141414;color:#ececec;font:14px/1.4 "Segoe UI",sans-serif;}}
main{{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:24px;}}
p{{margin:0;color:#a3a3a3;max-width:420px;}}
small{{color:#737373;word-break:break-all;}}
</style></head><body><main>
<strong>This site can't be reached</strong>
<p>{message}</p>
<small>{url}</small>
</main></body></html>"#,
        message = html_escape(message),
        url = html_escape(url),
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn emit_state(app: &AppHandle, state: SurfaceState) {
    let _ = app.emit("browser-surface", state);
}

#[cfg(windows)]
fn read_pwstr(mut ptr: windows_core::PWSTR) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let s = unsafe { ptr.to_string() }.unwrap_or_default();
    unsafe { windows_core::imp::CoTaskMemFree(ptr.as_ptr() as *const _) };
    let _ = &mut ptr;
    s
}

#[cfg(windows)]
fn read_state(core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2, id: &str) -> SurfaceState {
    unsafe {
        let mut url_ptr = windows_core::PWSTR::null();
        let url = if core.Source(&mut url_ptr).is_ok() { read_pwstr(url_ptr) } else { String::new() };
        let mut title_ptr = windows_core::PWSTR::null();
        let title = if core.DocumentTitle(&mut title_ptr).is_ok() { read_pwstr(title_ptr) } else { String::new() };
        let mut back = windows_core::BOOL(0);
        let mut forward = windows_core::BOOL(0);
        let _ = core.CanGoBack(&mut back);
        let _ = core.CanGoForward(&mut forward);
        let shown = if url.is_empty() || url == "about:blank" || title == "Can't reach" {
            peek_failure(id).unwrap_or(url)
        } else {
            let _ = take_failure(id);
            url
        };
        SurfaceState {
            id: id.to_string(),
            url: shown,
            title,
            can_back: back.as_bool(),
            can_forward: forward.as_bool(),
        }
    }
}

#[cfg(windows)]
fn install_host(app: AppHandle, label: String) {
    use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED;
    use webview2_com::{NavigationCompletedEventHandler, WebMessageReceivedEventHandler};

    let Some(webview) = app.get_webview(&label) else { return };
    let app_nav = app.clone();
    let app_msg = app.clone();
    let label_nav = label.clone();
    let label_msg = label.clone();
    let _ = webview.with_webview(move |platform| unsafe {
        let Ok(core) = platform.controller().CoreWebView2() else { return };
        if let Ok(settings) = core.Settings() {
            let _ = settings.SetAreDefaultContextMenusEnabled(false);
            let _ = settings.SetIsBuiltInErrorPageEnabled(false);
            let _ = settings.SetAreDevToolsEnabled(true);
            let _ = settings.SetIsStatusBarEnabled(false);
        }
        let mut token = 0i64;
        let nav = NavigationCompletedEventHandler::create(Box::new(move |sender, args| {
            let (Some(sender), Some(args)) = (sender, args) else { return Ok(()) };
            let mut success = windows_core::BOOL(0);
            args.IsSuccess(&mut success)?;
            if !success.as_bool() {
                let mut status = Default::default();
                args.WebErrorStatus(&mut status)?;
                if status == COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED {
                    return Ok(());
                }
                let mut url_ptr = windows_core::PWSTR::null();
                let url = if sender.Source(&mut url_ptr).is_ok() { read_pwstr(url_ptr) } else { String::new() };
                remember_failure(&label_nav, &url);
                let html = error_html(error_sentence(status.0), &url);
                let wide: Vec<u16> = html.encode_utf16().chain(std::iter::once(0)).collect();
                let _ = sender.NavigateToString(windows_core::PCWSTR(wide.as_ptr()));
                emit_state(&app_nav, SurfaceState {
                    id: label_nav.clone(),
                    url,
                    title: "Can't reach".into(),
                    can_back: false,
                    can_forward: false,
                });
                return Ok(());
            }
            let state = read_state(&sender, &label_nav);
            if state.url.starts_with("http") && state.title != "Can't reach" {
                crate::browser::record_history(&state.url, &state.title);
            }
            emit_state(&app_nav, state);
            Ok(())
        }));
        let _ = core.add_NavigationCompleted(&nav, &mut token);
        std::mem::forget(nav);

        let mut msg_token = 0i64;
        let msg = WebMessageReceivedEventHandler::create(Box::new(move |_sender, args| {
            let Some(args) = args else { return Ok(()) };
            let mut ptr = windows_core::PWSTR::null();
            if args.WebMessageAsJson(&mut ptr).is_err() {
                return Ok(());
            }
            let raw = read_pwstr(ptr);
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else { return Ok(()) };
            match value.get("type").and_then(|t| t.as_str()) {
                Some("menu") => {
                    let x = value.get("x").and_then(|n| n.as_f64()).unwrap_or(0.0);
                    let y = value.get("y").and_then(|n| n.as_f64()).unwrap_or(0.0);
                    show_menu(&app_msg, &label_msg, x, y);
                }
                Some("pick") => {
                    let _ = app_msg.emit("browser-surface-pick", value);
                }
                _ => {}
            }
            Ok(())
        }));
        let _ = core.add_WebMessageReceived(&msg, &mut msg_token);
        std::mem::forget(msg);
    });
}

#[cfg(windows)]
fn show_menu(app: &AppHandle, id: &str, x: f64, y: f64) {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::Wry;
    let _ = id;
    let bounds = BOUNDS.lock().unwrap_or_else(|p| p.into_inner());
    let pos = tauri::LogicalPosition::new(bounds.x + x, bounds.y + y);
    drop(bounds);
    let Ok(back) = MenuItem::with_id(app, "shape-browser-back", "Back", true, None::<&str>) else { return };
    let Ok(forward) = MenuItem::with_id(app, "shape-browser-forward", "Forward", true, None::<&str>) else { return };
    let Ok(reload) = MenuItem::with_id(app, "shape-browser-reload", "Reload", true, None::<&str>) else { return };
    let Ok(sep) = PredefinedMenuItem::separator(app) else { return };
    let Ok(pick) = MenuItem::with_id(app, "shape-browser-pick", "Select Element", true, None::<&str>) else { return };
    let Ok(copy) = MenuItem::with_id(app, "shape-browser-copy", "Copy Current URL", true, None::<&str>) else { return };
    let Ok(open) = MenuItem::with_id(app, "shape-browser-external", "Open Externally", true, None::<&str>) else { return };
    let items: [&dyn tauri::menu::IsMenuItem<Wry>; 7] = [&back, &forward, &reload, &sep, &pick, &copy, &open];
    let Ok(menu) = Menu::with_items(app, &items) else { return };
    if let Some(window) = app.get_window("main") {
        let _ = window.popup_menu_at(&menu, pos);
    }
}

#[cfg(windows)]
fn place(app: &AppHandle) {
    let bounds = BOUNDS.lock().unwrap_or_else(|p| p.into_inner());
    let active = active_id();
    let labels = tabs().clone();
    drop(bounds);
    let bounds = BOUNDS.lock().unwrap_or_else(|p| p.into_inner());
    for label in labels {
        let Some(webview) = app.get_webview(&label) else { continue };
        let visible = bounds.shown && bounds.w > 1.0 && bounds.h > 1.0 && active.as_deref() == Some(label.as_str());
        if visible {
            let _ = webview.set_position(LogicalPosition::new(bounds.x, bounds.y));
            let _ = webview.set_size(LogicalSize::new(bounds.w, bounds.h));
            let _ = webview.show();
        } else {
            let _ = webview.hide();
        }
    }
}

#[cfg(not(windows))]
fn place(_app: &AppHandle) {}

fn webview_of(app: &AppHandle, id: &str) -> Result<tauri::Webview, String> {
    app.get_webview(id).ok_or_else(|| "That tab is closed.".to_string())
}

#[tauri::command]
pub async fn browser_surface_open(app: AppHandle, url: Option<String>) -> Result<SurfaceState, String> {
    #[cfg(not(windows))]
    {
        let _ = (app, url);
        return Err("The in-app browser is only available on Windows.".into());
    }
    #[cfg(windows)]
    {
        let id = format!("shape-browser-{}", SEQ.fetch_add(1, Ordering::Relaxed));
        let start = url.unwrap_or_default();
        let parsed = if start.trim().is_empty() {
            "about:blank".parse().map_err(|e: url::ParseError| e.to_string())?
        } else {
            start.parse().map_err(|e: url::ParseError| e.to_string())?
        };
        let window = app.get_window("main").ok_or_else(|| "The main window is not open.".to_string())?;
        let builder = tauri::webview::WebviewBuilder::new(&id, WebviewUrl::External(parsed))
            .initialization_script(HOST_SCRIPT)
            .focused(false)
            .on_document_title_changed({
                let app = app.clone();
                let id = id.clone();
                move |webview, _title| {
                    let app = app.clone();
                    let id = id.clone();
                    let _ = webview.with_webview(move |platform| unsafe {
                        if let Ok(core) = platform.controller().CoreWebView2() {
                            emit_state(&app, read_state(&core, &id));
                        }
                    });
                }
            });
        window
            .add_child(builder, LogicalPosition::new(0.0, 0.0), LogicalSize::new(1.0, 1.0))
            .map_err(|e| e.to_string())?;
        tabs().push(id.clone());
        set_active(Some(id.clone()));
        install_host(app.clone(), id.clone());
        place(&app);
        Ok(SurfaceState { id, url: start, title: String::new(), can_back: false, can_forward: false })
    }
}

#[tauri::command]
pub async fn browser_surface_close(app: AppHandle, id: String) -> Result<(), String> {
    tabs().retain(|t| t != &id);
    if active_id().as_deref() == Some(id.as_str()) {
        set_active(tabs().last().cloned());
    }
    if let Some(webview) = app.get_webview(&id) {
        let _ = webview.close();
    }
    place(&app);
    Ok(())
}

#[tauri::command]
pub async fn browser_surface_activate(app: AppHandle, id: String) -> Result<(), String> {
    if !tabs().iter().any(|t| t == &id) {
        return Err("That tab is closed.".into());
    }
    set_active(Some(id));
    place(&app);
    Ok(())
}

#[tauri::command]
pub async fn browser_surface_navigate(app: AppHandle, id: String, url: String) -> Result<(), String> {
    let _ = take_failure(&id);
    let parsed = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    webview_of(&app, &id)?.navigate(parsed).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_surface_back(app: AppHandle, id: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let webview = webview_of(&app, &id)?;
        webview.with_webview(|platform| unsafe {
            if let Ok(core) = platform.controller().CoreWebView2() {
                let _ = core.GoBack();
            }
        }).map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, id);
        Err("The in-app browser is only available on Windows.".into())
    }
}

#[tauri::command]
pub async fn browser_surface_forward(app: AppHandle, id: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let webview = webview_of(&app, &id)?;
        webview.with_webview(|platform| unsafe {
            if let Ok(core) = platform.controller().CoreWebView2() {
                let _ = core.GoForward();
            }
        }).map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, id);
        Err("The in-app browser is only available on Windows.".into())
    }
}

#[tauri::command]
pub async fn browser_surface_reload(app: AppHandle, id: String, hard: Option<bool>) -> Result<(), String> {
    let webview = webview_of(&app, &id)?;
    if hard.unwrap_or(false) {
        let _ = webview.eval("location.reload()");
    }
    webview.reload().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_surface_bounds(app: AppHandle, x: f64, y: f64, w: f64, h: f64, shown: bool) -> Result<(), String> {
    *BOUNDS.lock().unwrap_or_else(|p| p.into_inner()) = Bounds { x, y, w, h, shown };
    place(&app);
    Ok(())
}

#[tauri::command]
pub async fn browser_surface_hide(app: AppHandle) -> Result<(), String> {
    BOUNDS.lock().unwrap_or_else(|p| p.into_inner()).shown = false;
    place(&app);
    Ok(())
}

#[tauri::command]
pub async fn browser_surface_pick(app: AppHandle, id: String, on: bool) -> Result<(), String> {
    let webview = webview_of(&app, &id)?;
    webview
        .eval(format!("window.__shapePick = {on}"))
        .map_err(|e| e.to_string())
}

pub fn on_menu(app: &AppHandle, id: &str) {
    let Some(tab) = active_id() else { return };
    match id {
        "shape-browser-back" => {
            let app = app.clone();
            let tab = tab.clone();
            tauri::async_runtime::spawn(async move { let _ = browser_surface_back(app, tab).await; });
        }
        "shape-browser-forward" => {
            let app = app.clone();
            let tab = tab.clone();
            tauri::async_runtime::spawn(async move { let _ = browser_surface_forward(app, tab).await; });
        }
        "shape-browser-reload" => {
            let app = app.clone();
            let tab = tab.clone();
            tauri::async_runtime::spawn(async move { let _ = browser_surface_reload(app, tab, Some(false)).await; });
        }
        "shape-browser-pick" => {
            let _ = app.emit("browser-surface-action", "pick");
        }
        "shape-browser-copy" => {
            let _ = app.emit("browser-surface-action", "copy");
        }
        "shape-browser-external" => {
            let _ = app.emit("browser-surface-action", "external");
        }
        _ => {}
    }
}
