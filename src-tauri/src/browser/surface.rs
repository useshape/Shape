//! The Browser tab the user drives is an iframe in the main webview, not a
//! second window. WebView2's `AdditionalAllowedFrameAncestors` lets that named
//! frame load sites that send `X-Frame-Options` or a tight `frame-ancestors`.
//! The agent's browser is a separate headless process and does not come through here.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

const FRAME_NAME: &str = "shape-browser";
const TOOLS_NAME: &str = "shape-devtools";

/// Origins that may frame the page. The live document origin is prepended when
/// the frame is created. No wildcard: a framed site must be inside Shape.
const ANCESTORS: &str = "http://localhost:48921 http://127.0.0.1:48921 http://tauri.localhost https://tauri.localhost http://asset.localhost https://asset.localhost";

const HOST_SCRIPT: &str = r##"
(function () {
  if (window.name !== "shape-browser") return;
  if (window.__shapeBrowser) return;
  window.__shapeBrowser = true;
  var mode = "__SHAPE_SCHEME__";
  var nativeMatch = window.matchMedia.bind(window);
  var realMatches = Object.getOwnPropertyDescriptor(window.MediaQueryList.prototype, "matches");
  var tracked = [];
  function forced(query) {
    if (mode !== "light" && mode !== "dark") return null;
    var text = String(query);
    if (text.indexOf("prefers-color-scheme") < 0) return null;
    if (text.indexOf("dark") >= 0) return mode === "dark";
    if (text.indexOf("light") >= 0) return mode === "light";
    return null;
  }
  window.matchMedia = function (query) {
    var list = nativeMatch(query);
    if (forced(query) == null || !realMatches || typeof realMatches.get !== "function") return list;
    try {
      Object.defineProperty(list, "matches", {
        configurable: true,
        get: function () {
          var next = forced(query);
          return next == null ? realMatches.get.call(list) : next;
        }
      });
    } catch (err) {
      return list;
    }
    tracked.push(list);
    return list;
  };
  function retarget() {
    tracked.forEach(function (list) {
      var event;
      try {
        event = new MediaQueryListEvent("change", { matches: list.matches, media: list.media });
      } catch (err) {
        event = new Event("change");
      }
      try { list.dispatchEvent(event); } catch (err) {}
    });
  }
  window.__shapePick = false;
  function send(payload) {
    try { parent.postMessage(payload, "*"); } catch (e) {}
  }
  function pageTitle() {
    var title = String(document.title || "").trim();
    if (!title) return "";
    if (title === location.href) return "";
    try {
      var parsed = new URL(title);
      if (parsed.hostname === location.hostname) return "";
    } catch (err) {}
    return title;
  }
  function faviconHref() {
    var nodes = document.querySelectorAll("link[rel]");
    var best = "";
    var score = -1;
    for (var i = 0; i < nodes.length; i++) {
      var rel = String(nodes[i].getAttribute("rel") || "").toLowerCase();
      if (rel.indexOf("icon") < 0) continue;
      var href = nodes[i].href || "";
      if (!href || href.indexOf("data:") === 0) continue;
      var rank = rel.indexOf("apple") >= 0 ? 1 : 3;
      var sizes = String(nodes[i].getAttribute("sizes") || "");
      if (sizes.indexOf("32") >= 0 || sizes.indexOf("48") >= 0) rank += 2;
      if (rank >= score) { score = rank; best = href; }
    }
    if (!best) return "";
    return best;
  }
  function describe(el, type) {
    var r = el.getBoundingClientRect();
    var vw = window.innerWidth || 1;
    var vh = window.innerHeight || 1;
    var text = "";
    try { text = String(el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 400); } catch (err) {}
    return {
      type: type,
      tag: String(el.tagName || "").toLowerCase(),
      label: el.id ? "#" + el.id : String(el.tagName || "").toLowerCase(),
      selector: el.id ? "#" + el.id : String(el.tagName || "").toLowerCase(),
      rect: { x: (r.left / vw) * 100, y: (r.top / vh) * 100, w: (r.width / vw) * 100, h: (r.height / vh) * 100 },
      text: text,
      url: String(location.href || ""),
      title: String(document.title || "")
    };
  }
  var reportTimer = 0;
  function report(travel) {
    var payload = {
      type: "shape-browser-page",
      url: String(location.href || ""),
      title: pageTitle(),
      favicon: faviconHref(),
      travel: !!travel
    };
    send(payload);
    try { window.chrome.webview.postMessage(payload); } catch (e) {}
  }
  function scheduleReport() {
    if (reportTimer) return;
    reportTimer = setTimeout(function () { reportTimer = 0; report(false); }, 60);
  }
  function applyPick(on) {
    window.__shapePick = !!on;
    var root = document.documentElement;
    if (root) root.style.cursor = on ? "crosshair" : "";
    if (!on) send({ type: "shape-browser-hover" });
  }
  var lastHover = 0;
  window.addEventListener("message", function (e) {
    var data = e.data;
    if (!data || data.type !== "shape-browser-host") return;
    if (data.pick != null) applyPick(data.pick);
    if (data.scheme === "light" || data.scheme === "dark" || data.scheme === "system") {
      mode = data.scheme;
      retarget();
    }
    if (data.reload) {
      try { location.reload(); } catch (err) {}
    }
    if (data.history === "back" || data.history === "forward") {
      var before = location.href;
      try { data.history === "back" ? history.back() : history.forward(); } catch (err) {}
      setTimeout(function () {
        if (location.href === before && data.goto && data.goto !== before) location.href = data.goto;
      }, 200);
    }
  });
  function watchMeta() {
    var head = document.head || document.documentElement;
    if (!head || head.__shapeWatch) return;
    head.__shapeWatch = true;
    var obs = new MutationObserver(function () { scheduleReport(); });
    obs.observe(head, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["href", "rel"] });
  }
  var pushState = history.pushState;
  history.pushState = function () {
    var result = pushState.apply(this, arguments);
    scheduleReport();
    return result;
  };
  var replaceState = history.replaceState;
  history.replaceState = function () {
    var result = replaceState.apply(this, arguments);
    scheduleReport();
    return result;
  };
  window.addEventListener("popstate", function () { report(true); });
  window.addEventListener("hashchange", function () { scheduleReport(); });
  document.addEventListener("DOMContentLoaded", function () { watchMeta(); scheduleReport(); });
  window.addEventListener("load", function () { watchMeta(); scheduleReport(); });
  document.addEventListener("mousemove", function (e) {
    if (!window.__shapePick) return;
    var now = Date.now();
    if (now - lastHover < 40) return;
    lastHover = now;
    var el = e.target;
    if (!el || !el.tagName) return;
    send(describe(el, "shape-browser-hover"));
  }, true);
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    send({ type: "shape-browser-menu", x: e.clientX, y: e.clientY });
  }, true);
  document.addEventListener("click", function (e) {
    if (!window.__shapePick) return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (!el || !el.tagName) return;
    send(describe(el, "shape-browser-pick"));
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FrameNav {
    url: String,
    ok: bool,
    error: String,
}

static APP: Mutex<Option<AppHandle>> = Mutex::new(None);
static FRAME_URL: Mutex<String> = Mutex::new(String::new());
static SCHEME: Mutex<String> = Mutex::new(String::new());
static SCRIPT_IDS: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn script_source() -> String {
    let scheme = SCHEME.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let mode = if scheme == "light" || scheme == "dark" {
        scheme
    } else {
        "system".to_string()
    };
    HOST_SCRIPT.replace("__SHAPE_SCHEME__", &mode)
}

fn emit_frame(url: &str, ok: bool, error: &str) {
    let Some(app) = APP.lock().unwrap_or_else(|p| p.into_inner()).clone() else {
        return;
    };
    let _ = app.emit(
        "browser-frame",
        FrameNav {
            url: url.to_string(),
            ok,
            error: error.to_string(),
        },
    );
}

fn error_sentence(code: i32) -> &'static str {
    if code == 13 {
        "This site's address couldn't be found."
    } else if code == 12 || code == 6 {
        "Nothing is listening at this address."
    } else if code == 7 {
        "The site took too long to respond."
    } else if code == 11 {
        "You're offline."
    } else if code == 9 {
        "The connection was closed before the page loaded."
    } else if (1..=5).contains(&code) {
        "This site's security certificate isn't valid."
    } else {
        "This page can't be shown in the app."
    }
}

pub fn install(app: &AppHandle) {
    *APP.lock().unwrap_or_else(|p| p.into_inner()) = Some(app.clone());
    #[cfg(windows)]
    hook_main(app);
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
fn origin_of(url: &str) -> Option<String> {
    let (scheme, rest) = url.split_once("://")?;
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty() {
        return None;
    }
    Some(format!("{scheme}://{host}"))
}

#[cfg(windows)]
fn ancestors_for(core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2) -> String {
    unsafe {
        let mut ptr = windows_core::PWSTR::null();
        if core.Source(&mut ptr).is_err() {
            return ANCESTORS.to_string();
        }
        let src = read_pwstr(ptr);
        match origin_of(&src) {
            Some(origin) => format!("{origin} {ANCESTORS}"),
            None => ANCESTORS.to_string(),
        }
    }
}

#[cfg(windows)]
fn install_script(core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2) {
    use webview2_com::AddScriptToExecuteOnDocumentCreatedCompletedHandler;
    use windows_core::PCWSTR;

    let source = script_source();
    let wide: Vec<u16> = source.encode_utf16().chain(std::iter::once(0)).collect();
    let done = AddScriptToExecuteOnDocumentCreatedCompletedHandler::create(Box::new(|hr, id| {
        if hr.is_ok() {
            let text = id.to_string();
            if !text.is_empty() {
                SCRIPT_IDS.lock().unwrap_or_else(|p| p.into_inner()).push(text);
            }
        }
        Ok(())
    }));
    unsafe {
        if core
            .AddScriptToExecuteOnDocumentCreated(PCWSTR(wide.as_ptr()), &done)
            .is_err()
        {
            log::warn!("browser frame script was not installed");
        }
    }
    std::mem::forget(done);
}

#[cfg(windows)]
fn refresh_script(app: &AppHandle) {
    use windows_core::PCWSTR;

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            return;
        };
        let ids = std::mem::take(&mut *SCRIPT_IDS.lock().unwrap_or_else(|p| p.into_inner()));
        for id in ids {
            let wide: Vec<u16> = id.encode_utf16().chain(std::iter::once(0)).collect();
            let _ = core.RemoveScriptToExecuteOnDocumentCreated(PCWSTR(wide.as_ptr()));
        }
        install_script(&core);
    });
}

#[cfg(windows)]
fn frame_name(frame: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Frame) -> String {
    unsafe {
        let mut ptr = windows_core::PWSTR::null();
        if frame.Name(&mut ptr).is_err() {
            return String::new();
        }
        read_pwstr(ptr)
    }
}

#[cfg(windows)]
fn hook_main(app: &AppHandle) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_4;
    use webview2_com::{FrameCreatedEventHandler, WebMessageReceivedEventHandler};
    use windows_core::Interface;

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            return;
        };
        install_script(&core);

        let messages = WebMessageReceivedEventHandler::create(Box::new(|_sender, args| {
            let Some(args) = args else {
                return Ok(());
            };
            let mut ptr = windows_core::PWSTR::null();
            if args.WebMessageAsJson(&mut ptr).is_err() {
                return Ok(());
            }
            let raw = read_pwstr(ptr);
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
                return Ok(());
            };
            if value.get("type").and_then(|t| t.as_str()) != Some("shape-browser-page") {
                return Ok(());
            }
            let url = value.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let title = value.get("title").and_then(|v| v.as_str()).unwrap_or("");
            if url.starts_with("http://") || url.starts_with("https://") {
                crate::browser::record_history(url, title);
            }
            Ok(())
        }));
        let mut msg_token = 0i64;
        let _ = core.add_WebMessageReceived(&messages, &mut msg_token);
        std::mem::forget(messages);

        let Ok(core4) = core.cast::<ICoreWebView2_4>() else {
            log::warn!("browser frame host needs a newer WebView2");
            return;
        };
        let created = FrameCreatedEventHandler::create(Box::new(|sender, args| {
            let Some(args) = args else {
                return Ok(());
            };
            let frame = args.Frame()?;
            let ancestors = sender.as_ref().map(ancestors_for).unwrap_or_else(|| ANCESTORS.to_string());
            watch_frame(frame, ancestors);
            Ok(())
        }));
        let mut token = 0i64;
        if core4.add_FrameCreated(&created, &mut token).is_err() {
            log::warn!("browser frame host was not installed");
        }
        std::mem::forget(created);
    });

    fn watch_frame(
        frame: webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Frame,
        ancestors: String,
    ) {
        use webview2_com::FrameNameChangedEventHandler;

        let name = frame_name(&frame);
        if name == FRAME_NAME || name == TOOLS_NAME {
            attach_nav(&frame, ancestors, name == FRAME_NAME);
            return;
        }
        let renamed = FrameNameChangedEventHandler::create(Box::new(move |sender, _| {
            let Some(frame) = sender else {
                return Ok(());
            };
            let name = frame_name(&frame);
            if name == FRAME_NAME || name == TOOLS_NAME {
                attach_nav(&frame, ancestors.clone(), name == FRAME_NAME);
            }
            Ok(())
        }));
        let mut token = 0i64;
        unsafe {
            let _ = frame.add_NameChanged(&renamed, &mut token);
        }
        std::mem::forget(renamed);
    }

    fn attach_nav(
        frame: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Frame,
        ancestors: String,
        track: bool,
    ) {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2Frame2, ICoreWebView2NavigationStartingEventArgs2,
            COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED,
        };
        use webview2_com::{FrameNavigationCompletedEventHandler, FrameNavigationStartingEventHandler};
        use windows_core::{Interface, PCWSTR};

        let Ok(frame2) = frame.cast::<ICoreWebView2Frame2>() else {
            return;
        };
        let ancestors_nav = ancestors;
        let starting = FrameNavigationStartingEventHandler::create(Box::new(move |_frame, args| {
            let Some(args) = args else {
                return Ok(());
            };
            if let Ok(args2) = args.cast::<ICoreWebView2NavigationStartingEventArgs2>() {
                let wide: Vec<u16> = ancestors_nav.encode_utf16().chain(std::iter::once(0)).collect();
                unsafe {
                    let _ = args2.SetAdditionalAllowedFrameAncestors(PCWSTR(wide.as_ptr()));
                }
            }
            unsafe {
                let mut uri = windows_core::PWSTR::null();
                if args.Uri(&mut uri).is_ok() {
                    let url = read_pwstr(uri);
                    if track && (url.starts_with("http://") || url.starts_with("https://")) {
                        *FRAME_URL.lock().unwrap_or_else(|p| p.into_inner()) = url.clone();
                        emit_frame(&url, true, "");
                        let mode = SCHEME.lock().unwrap_or_else(|p| p.into_inner()).clone();
                        let page = url;
                        tauri::async_runtime::spawn(async move {
                            let _ = emulate_scheme(&page, &mode).await;
                        });
                    }
                }
            }
            Ok(())
        }));
        let completed = FrameNavigationCompletedEventHandler::create(Box::new(move |_frame, args| {
            if !track {
                return Ok(());
            }
            let Some(args) = args else {
                return Ok(());
            };
            let mut success = windows_core::BOOL(0);
            unsafe { args.IsSuccess(&mut success)? };
            let url = FRAME_URL.lock().unwrap_or_else(|p| p.into_inner()).clone();
            if success.as_bool() {
                if url.starts_with("http://") || url.starts_with("https://") {
                    crate::browser::record_history(&url, "");
                }
                return Ok(());
            }
            let mut status = Default::default();
            unsafe { args.WebErrorStatus(&mut status)? };
            if status == COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED {
                return Ok(());
            }
            emit_frame(&url, false, error_sentence(status.0));
            Ok(())
        }));
        let mut start_token = 0i64;
        let mut done_token = 0i64;
        unsafe {
            let _ = frame2.add_NavigationStarting(&starting, &mut start_token);
            let _ = frame2.add_NavigationCompleted(&completed, &mut done_token);
        }
        std::mem::forget(starting);
        std::mem::forget(completed);
    }
}

#[tauri::command]
pub async fn browser_surface_open(_app: AppHandle, url: Option<String>) -> Result<SurfaceState, String> {
    Ok(SurfaceState {
        id: "frame".into(),
        url: url.unwrap_or_default(),
        title: String::new(),
        can_back: false,
        can_forward: false,
    })
}

#[tauri::command]
pub async fn browser_surface_close(_app: AppHandle, _id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn browser_surface_activate(_app: AppHandle, _id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn browser_surface_navigate(_app: AppHandle, _id: String, _url: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn browser_surface_back(_app: AppHandle, _id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn browser_surface_forward(_app: AppHandle, _id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn browser_surface_reload(_app: AppHandle, _id: String, _hard: Option<bool>) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn browser_surface_bounds(
    _app: AppHandle,
    _x: f64,
    _y: f64,
    _w: f64,
    _h: f64,
    _shown: bool,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn browser_surface_hide(_app: AppHandle) -> Result<(), String> {
    Ok(())
}

fn host_key(url: &str) -> Option<String> {
    let (_, rest) = url.split_once("://")?;
    let host = rest.split(['/', '?', '#']).next()?.trim();
    if host.is_empty() {
        return None;
    }
    Some(host.trim_start_matches("www.").to_ascii_lowercase())
}

pub(crate) fn is_app_page(url: &str) -> bool {
    url.contains("localhost:48921")
        || url.contains("127.0.0.1:48921")
        || url.contains("tauri.localhost")
        || url.contains("asset.localhost")
}

pub(crate) fn score_target(page_url: &str, want: &str, kind: &str) -> i32 {
    if page_url.is_empty() || is_app_page(page_url) {
        return -1;
    }
    let (Some(page_host), Some(want_host)) = (host_key(page_url), host_key(want)) else {
        return -1;
    };
    if page_host != want_host {
        return -1;
    }
    let mut score = match kind {
        "iframe" => 20,
        "page" | "other" => 12,
        "browser" | "service_worker" | "shared_worker" | "worker" => return -1,
        _ => 8,
    };
    let page_trim = page_url.trim_end_matches('/');
    let want_trim = want.trim_end_matches('/');
    if page_trim == want_trim {
        score += 40;
    } else if page_url.starts_with(want) || want.starts_with(page_trim) {
        score += 15;
    }
    score
}

pub(crate) fn inspector_url(item: &serde_json::Value) -> String {
    let id = item
        .get("id")
        .or_else(|| item.get("targetId"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if !id.is_empty() {
        let base = crate::browser::webview_debug::base_url();
        let host = base.trim_start_matches("http://");
        return format!("{base}/devtools/inspector.html?ws={host}/devtools/page/{id}");
    }
    item.get("devtoolsFrontendUrl")
        .and_then(|v| v.as_str())
        .filter(|front| front.starts_with("http"))
        .unwrap_or("")
        .to_string()
}

pub(crate) fn best_target(list: &[serde_json::Value], want: &str) -> Option<serde_json::Value> {
    list.iter()
        .filter_map(|item| {
            let page_url = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let kind = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let score = score_target(page_url, want, kind);
            (score >= 0).then_some((score, item.clone()))
        })
        .max_by_key(|(score, _)| *score)
        .map(|(_, item)| item)
}

async fn iframe_targets() -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;
    let list = client
        .get(format!("{}/json/list", crate::browser::webview_debug::base_url()))
        .send()
        .await
        .map_err(|_| "Restart Shape, then open developer tools for this page.".to_string())?
        .json::<Vec<serde_json::Value>>()
        .await
        .map_err(|e| e.to_string())?;
    if list.iter().any(|item| {
        let url = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
        !is_app_page(url)
    }) {
        return Ok(list);
    }
    let version = client
        .get(format!("{}/json/version", crate::browser::webview_debug::base_url()))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;
    let ws = version
        .get("webSocketDebuggerUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if ws.is_empty() {
        return Ok(list);
    }
    let (mut socket, _) = tokio_tungstenite::connect_async(&ws)
        .await
        .map_err(|e| e.to_string())?;
    use futures::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message;
    socket
        .send(Message::Text(r#"{"id":1,"method":"Target.getTargets"}"#.into()))
        .await
        .map_err(|e| e.to_string())?;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
    while tokio::time::Instant::now() < deadline {
        let next = tokio::time::timeout(std::time::Duration::from_secs(2), socket.next())
            .await
            .map_err(|_| "Developer tools didn't answer.".to_string())?;
        let Some(msg) = next else { break };
        let text = match msg.map_err(|e| e.to_string())? {
            Message::Text(text) => text,
            _ => continue,
        };
        let value: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);
        if value.get("id").and_then(|v| v.as_i64()) != Some(1) {
            continue;
        }
        let infos = value
            .pointer("/result/targetInfos")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        return Ok(infos
            .into_iter()
            .map(|info| {
                serde_json::json!({
                    "url": info.get("url").cloned().unwrap_or(serde_json::Value::Null),
                    "type": info.get("type").cloned().unwrap_or(serde_json::Value::Null),
                    "id": info.get("targetId").cloned().unwrap_or(serde_json::Value::Null),
                })
            })
            .collect());
    }
    Ok(list)
}

#[cfg(windows)]
async fn emulate_scheme(page_url: &str, mode: &str) -> Result<(), String> {
    let mut last = String::from("This page doesn't have a color scheme yet.");
    for _ in 0..6 {
        match emulate_scheme_once(page_url, mode).await {
            Ok(()) => return Ok(()),
            Err(err) => last = err,
        }
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
    }
    Err(last)
}

#[cfg(windows)]
async fn emulate_scheme_once(page_url: &str, mode: &str) -> Result<(), String> {
    let list = iframe_targets().await?;
    let page = best_target(&list, page_url).ok_or_else(|| "This page doesn't have a color scheme yet.".to_string())?;
    let id = page
        .get("id")
        .or_else(|| page.get("targetId"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if id.is_empty() {
        return Err("This page doesn't have a color scheme yet.".into());
    }
    let params = if mode == "light" || mode == "dark" {
        format!(r#"{{"media":"","features":[{{"name":"prefers-color-scheme","value":"{mode}"}}]}}"#)
    } else {
        r#"{"media":"","features":[]}"#.to_string()
    };
    session_call(id, "Emulation.setEmulatedMedia", &params).await
}

#[cfg(windows)]
async fn session_call(target_id: &str, method: &str, params: &str) -> Result<(), String> {
    use futures::SinkExt;
    use tokio_tungstenite::tungstenite::Message;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;
    let version = client
        .get(format!("{}/json/version", crate::browser::webview_debug::base_url()))
        .send()
        .await
        .map_err(|_| "Restart Shape, then try again.".to_string())?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;
    let ws = version
        .get("webSocketDebuggerUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if ws.is_empty() {
        return Err("Restart Shape, then try again.".into());
    }
    let (mut socket, _) = tokio_tungstenite::connect_async(&ws)
        .await
        .map_err(|e| e.to_string())?;
    let attach = format!(
        r#"{{"id":1,"method":"Target.attachToTarget","params":{{"targetId":"{target_id}","flatten":true}}}}"#
    );
    socket
        .send(Message::Text(attach.into()))
        .await
        .map_err(|e| e.to_string())?;
    let attached = next_cdp(&mut socket, 1).await?;
    let session = attached
        .pointer("/result/sessionId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if session.is_empty() {
        return Err("This page doesn't have developer tools yet.".into());
    }
    let call = format!(r#"{{"id":2,"sessionId":"{session}","method":"{method}","params":{params}}}"#);
    socket
        .send(Message::Text(call.into()))
        .await
        .map_err(|e| e.to_string())?;
    let done = next_cdp(&mut socket, 2).await?;
    if done.get("error").is_some() {
        return Err("This page doesn't have developer tools yet.".into());
    }
    Ok(())
}

#[cfg(windows)]
async fn next_cdp(
    socket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    id: i64,
) -> Result<serde_json::Value, String> {
    use futures::StreamExt;
    use tokio_tungstenite::tungstenite::Message;

    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
    while tokio::time::Instant::now() < deadline {
        let next = tokio::time::timeout(std::time::Duration::from_secs(2), socket.next())
            .await
            .map_err(|_| "Developer tools didn't answer.".to_string())?;
        let Some(msg) = next else {
            break;
        };
        let text = match msg.map_err(|e| e.to_string())? {
            Message::Text(text) => text,
            _ => continue,
        };
        let value: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);
        if value.get("id").and_then(|v| v.as_i64()) == Some(id) {
            return Ok(value);
        }
    }
    Err("Developer tools didn't answer.".into())
}

#[tauri::command]
pub async fn browser_surface_devtools(_app: AppHandle, url: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        return crate::browser::devtools_dock::inspector_for(url.trim()).await;
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        Err("Developer tools for the page are only available on Windows.".into())
    }
}

#[tauri::command]
pub async fn browser_surface_scheme(app: AppHandle, scheme: String) {
    let mode = if scheme == "light" || scheme == "dark" {
        scheme
    } else {
        "system".to_string()
    };
    *SCHEME.lock().unwrap_or_else(|p| p.into_inner()) = mode.clone();
    #[cfg(windows)]
    {
        refresh_script(&app);
        let url = FRAME_URL.lock().unwrap_or_else(|p| p.into_inner()).clone();
        if url.starts_with("http://") || url.starts_with("https://") {
            let _ = emulate_scheme(&url, &mode).await;
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, mode);
    }
}

#[tauri::command]
pub async fn browser_surface_pick(_app: AppHandle, _id: String, _on: bool) -> Result<(), String> {
    Ok(())
}

pub fn on_menu(_app: &AppHandle, _id: &str) {}
