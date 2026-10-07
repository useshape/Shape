//! In-app browser control. Launches a headless Chromium the user never sees as a
//! desktop window. Shape shows the screenshot and cursor in chat and in the
//! Browser tab. This does not drive the rest of the desktop.

#![allow(dead_code, unused_imports)]

use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::Emitter;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

use super::dispatch::{ToolCtx, ToolOutcome, SideEffect};
use super::runtime_inspect::{fetch_page_ws, find_chromium, free_port};

const VIEW_W: f64 = 1280.0;
const VIEW_H: f64 = 720.0;

static STOP: AtomicBool = AtomicBool::new(false);
static SHOW_FRAMES: AtomicBool = AtomicBool::new(false);
static WATCH_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static LIVE_PORT: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(0);
static PAGE_WS: Mutex<Option<(u16, String)>> = Mutex::new(None);
static LAST_FRAME: Mutex<Option<String>> = Mutex::new(None);
static SHOTS_IN_FLIGHT: AtomicU32 = AtomicU32::new(0);

struct Session {
    child: Child,
    port: u16,
    data_dir: std::path::PathBuf,
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

#[tauri::command]
pub fn agent_browse_stop(app: tauri::AppHandle) {
    stop_session();
    let _ = app.emit(
        "agent-browse",
        json!({"id": "live", "status": "stopped"}),
    );
}

/// Click or move inside the same page the user is looking at. Coordinates are
/// percentages of the 1280×720 layout, which the UI scales to fit.
#[tauri::command]
pub async fn agent_browse_pointer(app: tauri::AppHandle, kind: String, x: f64, y: f64) -> Result<(), String> {
    if stopped() {
        return Err("Browser control is stopped.".into());
    }
    let x = x.clamp(0.0, 100.0);
    let y = y.clamp(0.0, 100.0);
    let port = {
        let guard = SESSION.lock().unwrap_or_else(|p| p.into_inner());
        let port = guard.as_ref().map(|s| s.port).ok_or_else(|| "Browser is not running.".to_string())?;
        crate::browser::note_live_port(port);
        port
    };
    let ws = fetch_page_ws(port).await?;
    let _ = app.emit(
        "agent-browse",
        json!({"id": "live", "status": "controlling", "x": x, "y": y}),
    );
    if kind == "click" {
        click_at(&ws, x, y).await?;
        if let Ok(jpeg) = capture_jpeg(&ws).await {
            let _ = app.emit(
                "agent-browse",
                json!({
                    "id": "live",
                    "status": "controlling",
                    "x": x,
                    "y": y,
                    "image": format!("data:image/jpeg;base64,{jpeg}")
                }),
            );
        }
    }
    Ok(())
}

pub fn stop_session() {
    STOP.store(true, Ordering::SeqCst);
    SHOW_FRAMES.store(false, Ordering::SeqCst);
    LIVE_PORT.store(0, Ordering::SeqCst);
    crate::browser::clear_live_port();
    if let Ok(mut guard) = PAGE_WS.lock() {
        *guard = None;
    }
    WATCH_GEN.fetch_add(1, Ordering::SeqCst);
    let mut guard = match SESSION.lock() {
        Ok(g) => g,
        Err(poison) => poison.into_inner(),
    };
    if let Some(mut session) = guard.take() {
        kill_child(&mut session.child);
        let _ = std::fs::remove_dir_all(&session.data_dir);
    }
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

fn stopped() -> bool {
    STOP.load(Ordering::SeqCst)
}

pub async fn tool_browse(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if stopped() && args.get("action").and_then(|v| v.as_str()) != Some("open") {
        return fail("The user stopped browser control. Call browse with action open if they ask you to continue.");
    }
    if ctx.cancel.is_cancelled() {
        return fail("Stopped.");
    }

    let action = args
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("open")
        .trim()
        .to_ascii_lowercase();

    if action == "stop" {
        stop_session();
        let _ = ctx.app_handle.emit(
            "agent-browse",
            json!({"id": "live", "status": "stopped"}),
        );
        return ok(
            "Browser control stopped. The user has the tab back.",
            browse_tag("stopped", "", "Browser"),
            None,
        );
    }

    if let Err(err) = ensure_session().await {
        return fail(&err);
    }
    if stopped() {
        return fail("The user stopped browser control.");
    }

    let port = {
        let guard = SESSION.lock().unwrap_or_else(|p| p.into_inner());
        match guard.as_ref() {
            Some(s) => s.port,
            None => return fail("Browser is not running."),
        }
    };
    let ws = match page_ws(port).await {
        Ok(ws) => ws,
        Err(err) => return fail(&format!("DevTools is not ready: {err}")),
    };

    let mut cursor_x = args.get("x").and_then(|v| v.as_f64()).unwrap_or(50.0).clamp(0.0, 100.0);
    let mut cursor_y = args.get("y").and_then(|v| v.as_f64()).unwrap_or(50.0).clamp(0.0, 100.0);
    let href_before = eval_script(&ws, r#"(function(){return location.href||""})()"#)
        .await
        .unwrap_or_default();

    let act_result = match action.as_str() {
        "open" => {
            let url = match args.get("url").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
                Some(u) => match crate::agent::security::urls::validate_outbound_url(u) {
                    Ok(url) => url,
                    Err(err) => return fail(&err),
                },
                None => return fail("browse open requires url."),
            };
            STOP.store(false, Ordering::SeqCst);
            let _ = ctx.app_handle.emit(
                "agent-browse",
                json!({
                    "id": "live",
                    "status": "loading",
                    "url": url,
                    "title": "Opening",
                    "image": ""
                }),
            );
            match drive(&ws, "Page.navigate", json!({ "url": url })).await {
                Ok(v) => match v.get("errorText").and_then(|e| e.as_str()).filter(|s| !s.is_empty()) {
                    Some(err) => Err(err.to_string()),
                    None => Ok(format!("Opened {url}")),
                },
                Err(e) => Err(e),
            }
        }
        "click" => {
            let _ = ctx.app_handle.emit(
                "agent-browse",
                json!({
                    "id": "live",
                    "status": "controlling",
                    "x": cursor_x,
                    "y": cursor_y
                }),
            );
            click_at(&ws, cursor_x, cursor_y)
                .await
                .map(|_| format!("Clicked at {cursor_x:.0}%, {cursor_y:.0}%"))
        }
        "type" => {
            let text = args.get("text").and_then(|v| v.as_str()).unwrap_or("");
            if text.is_empty() {
                Err("browse type requires text.".into())
            } else {
                drive(&ws, "Input.insertText", json!({ "text": text }))
                    .await
                    .map(|_| format!("Typed {} characters", text.chars().count()))
            }
        }
        "scroll" => {
            let _ = ctx.app_handle.emit(
                "agent-browse",
                json!({ "id": "live", "status": "controlling", "x": cursor_x, "y": cursor_y }),
            );
            let dy = args.get("dy").and_then(|v| v.as_f64()).unwrap_or(400.0);
            let (px, py) = percent_to_px(cursor_x, cursor_y);
            drive(
                &ws,
                "Input.dispatchMouseEvent",
                json!({
                    "type": "mouseWheel",
                    "x": px,
                    "y": py,
                    "deltaX": 0,
                    "deltaY": dy
                }),
            )
            .await
            .map(|_| format!("Scrolled {dy:.0}px"))
        }
        "script" => {
            let script = args.get("script").and_then(|v| v.as_str()).unwrap_or("");
            if script.is_empty() {
                Err("browse script requires script.".into())
            } else {
                eval_script(&ws, script).await.map(|v| truncate(&v, 4000))
            }
        }
        "devtools" | "shot" => Ok("Captured the page.".into()),
        "observe" => Ok("Listed the page.".into()),
        "act" => act_on_target(&ctx.app_handle, &ws, args, &mut cursor_x, &mut cursor_y).await,
        other => Err(format!(
            "Unknown browse action '{other}'. Use open, observe, act, click, type, scroll, script, devtools, shot, or stop."
        )),
    };

    let summary = match act_result {
        Ok(summary) => summary,
        Err(err) => {
            if action == "open" {
                let url = args.get("url").and_then(|v| v.as_str()).unwrap_or("");
                let message = friendly_nav_error(&err);
                return page_error(ctx, url, &message);
            }
            return fail(&err);
        }
    };

    if action == "open" {
        let _ = eval_script(&ws, CONSOLE_HOOK).await;
        wait_for_page(&ws, "").await;
    } else if action == "act" || action == "click" {
        wait_for_page(&ws, &href_before).await;
    }

    let snap = eval_script(&ws, SNAPSHOT_JS).await.unwrap_or_else(|_| "{}".into());
    let snap_v: Value = serde_json::from_str(&snap).unwrap_or(json!({}));
    let title = snap_v.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let href = snap_v.get("href").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let failed = snap_v.get("failed").and_then(|v| v.as_bool()).unwrap_or(false);
    if failed || page_failed(&href, &title) {
        return page_error(ctx, if href.is_empty() { args.get("url").and_then(|v| v.as_str()).unwrap_or("") } else { href.as_str() }, "This site can't be reached.");
    }
    let elements = snap_v
        .get("elements")
        .map(|v| v.to_string())
        .unwrap_or_else(|| "[]".into());

    SHOW_FRAMES.store(true, Ordering::SeqCst);
    let ui = browse_tag("controlling", &href, &title);
    let _ = ctx.app_handle.emit(
        "agent-browse",
        json!({
            "id": "live",
            "status": "controlling",
            "url": href,
            "title": title,
            "x": cursor_x,
            "y": cursor_y,
        }),
    );
    let app = ctx.app_handle.clone();
    let shot_ws = ws.clone();
    SHOTS_IN_FLIGHT.fetch_add(1, Ordering::SeqCst);
    tauri::async_runtime::spawn(async move {
        if let Ok(jpeg) = capture_jpeg(&shot_ws).await {
            let image = format!("data:image/jpeg;base64,{jpeg}");
            if let Ok(mut guard) = LAST_FRAME.lock() {
                *guard = Some(image.clone());
            }
            let _ = app.emit(
                "agent-browse",
                json!({
                    "id": "live",
                    "status": "controlling",
                    "image": image
                }),
            );
        }
        SHOTS_IN_FLIGHT.fetch_sub(1, Ordering::SeqCst);
    });

    let script_note = if action == "script" {
        format!("\nScript result:\n{summary}")
    } else {
        String::new()
    };
    let tool_result = format!(
        "{summary}\nPage: {title}\nURL: {href}\nElements (act on an id, no separate observe call):\n{elements}{script_note}"
    );
    ok(&tool_result, ui, None)
}

pub(crate) const SNAPSHOT_JS: &str = r#"(function(){
  var stale = document.querySelectorAll("[data-shape-id]");
  for (var s = 0; s < stale.length; s++) stale[s].removeAttribute("data-shape-id");
  window.__shapeTargets = {};
  var sel = 'a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[contenteditable="true"]';
  var nodes = Array.prototype.slice.call(document.querySelectorAll(sel));
  var out = [];
  var id = 1;
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
    var style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    window.__shapeTargets[id] = el;
    var name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.getAttribute("name") || "").replace(/\s+/g, " ").trim().slice(0, 60);
    var item = { id: id, tag: el.tagName.toLowerCase(), name: name };
    if (el.tagName === "A" && el.href) item.href = String(el.href).slice(0, 160);
    out.push(item);
    id += 1;
    if (out.length >= 40) break;
  }
  var href = location.href || "";
  var failed = href.indexOf("chrome-error") === 0 || href.indexOf("edge-error") === 0 || !!document.getElementById("main-frame-error");
  return JSON.stringify({ title: document.title || "", href: href, failed: failed, elements: out });
})()"#;

pub fn url_without_fragment(url: &str) -> &str {
    url.split('#').next().unwrap_or(url)
}

pub fn is_same_document_nav(current: &str, target: &str) -> bool {
    !current.is_empty()
        && !target.is_empty()
        && url_without_fragment(current) == url_without_fragment(target)
        && current != target
}

pub async fn scroll_past_in_page_anchor(ws: &str) {
    let _ = eval_script(
        ws,
        r#"(function(){
  var step = Math.max(360, (window.innerHeight || 720) * 0.7);
  window.scrollBy({ top: step, left: 0, behavior: "auto" });
  return "ok";
})()"#,
    )
    .await;
}

async fn act_on_target(
    app: &tauri::AppHandle,
    ws: &str,
    args: &Value,
    cursor_x: &mut f64,
    cursor_y: &mut f64,
) -> Result<String, String> {
    let id = args
        .get("target")
        .and_then(|v| v.as_u64())
        .or_else(|| args.get("target").and_then(|v| v.as_i64()).map(|n| n as u64))
        .or_else(|| {
            args.get("target")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<u64>().ok())
        })
        .ok_or_else(|| "browse act requires target, an element id from observe.".to_string())?;
    let method = args.get("method").and_then(|v| v.as_str()).unwrap_or("click");
    let located = eval_script(
        ws,
        &format!(
            r#"(function(){{
  var el = window.__shapeTargets && window.__shapeTargets[{id}];
  if (!el) return JSON.stringify({{ok:false}});
  el.scrollIntoView({{block:"center",inline:"center"}});
  var r = el.getBoundingClientRect();
  var name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 80);
  var link = el.closest ? el.closest("a") : null;
  var href = link && link.href ? String(link.href) : "";
  return JSON.stringify({{ok:true,x:r.left+r.width/2,y:r.top+r.height/2,w:window.innerWidth,h:window.innerHeight,name:name,href:href}});
}})()"#
        ),
    )
    .await?;
    let v: Value = serde_json::from_str(&located).unwrap_or(json!({"ok": false}));
    if v.get("ok").and_then(|b| b.as_bool()) != Some(true) {
        return Err(format!("Element {id} is not on the page. Call observe again."));
    }
    let x = v.get("x").and_then(|n| n.as_f64()).unwrap_or(0.0);
    let y = v.get("y").and_then(|n| n.as_f64()).unwrap_or(0.0);
    let w = v.get("w").and_then(|n| n.as_f64()).unwrap_or(VIEW_W).max(1.0);
    let h = v.get("h").and_then(|n| n.as_f64()).unwrap_or(VIEW_H).max(1.0);
    *cursor_x = (x / w * 100.0).clamp(0.0, 100.0);
    *cursor_y = (y / h * 100.0).clamp(0.0, 100.0);
    let name = v.get("name").and_then(|n| n.as_str()).unwrap_or("");
    let _ = app.emit(
        "agent-browse",
        json!({ "id": "live", "status": "controlling", "x": *cursor_x, "y": *cursor_y }),
    );
    if method == "type" {
        let text = args.get("text").and_then(|v| v.as_str()).unwrap_or("");
        if text.is_empty() {
            return Err("browse act method type requires text.".into());
        }
        let _ = eval_script(ws, &format!(r#"(function(){{ var el = window.__shapeTargets && window.__shapeTargets[{id}]; if (el) el.focus(); return "ok"; }})()"#)).await;
        drive(ws, "Input.insertText", json!({ "text": text })).await?;
        return Ok(format!("Typed into [{id}] {name}"));
    }
    let link = v.get("href").and_then(|n| n.as_str()).unwrap_or("");
    let current_href = eval_script(ws, r#"(function(){return location.href||""})()"#)
        .await
        .unwrap_or_default();
    if link.starts_with("http://") || link.starts_with("https://") {
        if is_same_document_nav(&current_href, link) {
            click_px(ws, x, y).await?;
            tokio::time::sleep(Duration::from_millis(120)).await;
            scroll_past_in_page_anchor(ws).await;
            return Ok(format!("Clicked [{id}] {name} (scrolled past in-page link)"));
        }
        drive(ws, "Page.navigate", json!({ "url": link })).await?;
        tokio::time::sleep(Duration::from_millis(120)).await;
        return Ok(format!("Opened {link}"));
    }
    click_px(ws, x, y).await?;
    Ok(format!("Clicked [{id}] {name}"))
}

const CONSOLE_HOOK: &str = r#"(function(){
  if (window.__shapeHook) return "hooked";
  window.__shapeLogs = [];
  window.__shapeHook = true;
  ["log","warn","error","info"].forEach(function(k){
    var orig = console[k];
    console[k] = function(){
      try {
        var parts = Array.prototype.slice.call(arguments).map(function(a){
          try { return typeof a === "string" ? a : JSON.stringify(a); } catch (e) { return String(a); }
        });
        window.__shapeLogs.push(k + ": " + parts.join(" "));
        if (window.__shapeLogs.length > 80) window.__shapeLogs.shift();
      } catch (e) {}
      return orig.apply(console, arguments);
    };
  });
  return "hooked";
})()"#;

pub async fn finish_browse_markup(content: String) -> String {
    let start = Instant::now();
    while SHOTS_IN_FLIGHT.load(Ordering::SeqCst) > 0 && start.elapsed() < Duration::from_secs(2) {
        tokio::time::sleep(Duration::from_millis(40)).await;
    }
    if !content.contains("<browse_session") {
        return content;
    }
    seal_browse_markup(&content)
}

/// Put the last screenshot into the saved card and mark the session finished.
pub fn seal_browse_markup(content: &str) -> String {
    let Some(start) = content.rfind("<browse_session") else {
        return content.to_string();
    };
    let Some(rel_end) = content[start..].find("</browse_session>") else {
        return content.to_string();
    };
    let end = start + rel_end + "</browse_session>".len();
    let block = &content[start..end];
    let url = xml_attr(block, "url");
    let title = xml_attr(block, "title");
    let image = LAST_FRAME.lock().ok().and_then(|guard| guard.clone()).unwrap_or_default();
    let body = if image.is_empty() {
        String::new()
    } else {
        json!({ "image": image }).to_string()
    };
    let mut out = String::with_capacity(content.len() + body.len());
    out.push_str(&content[..start]);
    out.push_str(&format!(
        "<browse_session id=\"live\" status=\"stopped\" url=\"{url}\" title=\"{title}\">{body}</browse_session>"
    ));
    out.push_str(&content[end..]);
    out
}

fn xml_attr(block: &str, name: &str) -> String {
    let key = format!("{name}=\"");
    let Some(at) = block.find(&key) else {
        return String::new();
    };
    let rest = &block[at + key.len()..];
    rest.split('"').next().unwrap_or("").to_string()
}

fn browse_tag(status: &str, url: &str, title: &str) -> String {
    format!(
        "\n<browse_session id=\"live\" status=\"{}\" url=\"{}\" title=\"{}\"></browse_session>\n",
        escape_attr(status),
        escape_attr(url),
        escape_attr(title),
    )
}

fn escape_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('\n', " ")
}

fn start_live_view(app: tauri::AppHandle, port: u16) {
    if LIVE_PORT.load(Ordering::SeqCst) == port && !stopped() {
        return;
    }
    LIVE_PORT.store(port, Ordering::SeqCst);
    let gen = WATCH_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        while WATCH_GEN.load(Ordering::SeqCst) == gen && !stopped() {
            match run_screencast(&app, gen).await {
                Ok(()) => break,
                Err(_) => tokio::time::sleep(Duration::from_millis(300)).await,
            }
        }
    });
}

/// One Chrome session, streamed into the Browser tab. Same idea as a Browserbase
/// live view: the agent drives the page, and the pane shows that page, not a new
/// screenshot card for every click.
async fn run_screencast(app: &tauri::AppHandle, gen: u64) -> Result<(), String> {
    let port = {
        let guard = SESSION.lock().unwrap_or_else(|p| p.into_inner());
        guard.as_ref().map(|s| s.port).ok_or_else(|| "Browser is not running.".to_string())?
    };
    let ws_url = fetch_page_ws(port).await?;
    let (mut ws, _) = timeout(Duration::from_secs(8), tokio_tungstenite::connect_async(&ws_url))
        .await
        .map_err(|_| "DevTools websocket timed out".to_string())?
        .map_err(|e| format!("DevTools websocket: {e}"))?;
    let start = json!({
        "id": 1,
        "method": "Page.startScreencast",
        "params": {
            "format": "jpeg",
            "quality": 55,
            "maxWidth": VIEW_W as u32,
            "maxHeight": VIEW_H as u32,
            "everyNthFrame": 2
        }
    });
    ws.send(Message::Text(start.to_string().into()))
        .await
        .map_err(|e| e.to_string())?;
    let mut ack_id: u64 = 10;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    while WATCH_GEN.load(Ordering::SeqCst) == gen && !stopped() {
        match timeout(Duration::from_secs(2), ws.next()).await {
            Ok(Some(Ok(Message::Text(text)))) => {
                let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
                let method = v.get("method").and_then(|m| m.as_str()).unwrap_or("");
                if method != "Page.screencastFrame" {
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
                if !SHOW_FRAMES.load(Ordering::SeqCst) {
                    continue;
                }
                if last_emit.elapsed() < Duration::from_millis(120) {
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
                    "agent-browse",
                    json!({
                        "id": "live",
                        "status": "controlling",
                        "image": format!("data:image/jpeg;base64,{data}")
                    }),
                );
            }
            Ok(Some(Ok(_))) => {}
            Ok(Some(Err(_))) | Ok(None) => return Err("Screencast socket closed.".into()),
            Err(_) => {
                if WATCH_GEN.load(Ordering::SeqCst) != gen || stopped() {
                    break;
                }
            }
        }
    }
    Ok(())
}

async fn ensure_session() -> Result<(), String> {
    {
        let guard = SESSION.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(session) = guard.as_ref() {
            if session_alive(session.port) {
                crate::browser::note_live_port(session.port);
                return Ok(());
            }
        }
    }
    stop_session();
    STOP.store(false, Ordering::SeqCst);
    let browser = find_chromium().ok_or_else(|| {
        "No Chrome or Edge found. Install one so the agent can open a page inside Shape.".to_string()
    })?;
    let port = free_port().ok_or_else(|| "Could not find a free debug port.".to_string())?;
    let data_dir = std::env::temp_dir().join(format!("shape-browse-{port}"));
    let _ = std::fs::create_dir_all(&data_dir);
    let mut cmd = Command::new(&browser);
    cmd.args([
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--disable-extensions",
        "--disable-background-networking",
        "--hide-scrollbars",
        &format!("--window-size={0},{1}", VIEW_W as u32, VIEW_H as u32),
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
    {
        let mut guard = SESSION.lock().unwrap_or_else(|p| p.into_inner());
        *guard = Some(Session { child, port, data_dir });
    }
    let deadline = Instant::now() + Duration::from_secs(8);
    while Instant::now() < deadline {
        if stopped() {
            return Err("The user stopped browser control.".into());
        }
        if fetch_page_ws(port).await.is_ok() {
            crate::browser::note_live_port(port);
            if let Ok(ws) = fetch_page_ws(port).await {
                let _ = drive(&ws, "Page.enable", json!({})).await;
                let _ = drive(
                    &ws,
                    "Emulation.setDeviceMetricsOverride",
                    json!({
                        "width": VIEW_W as u32,
                        "height": VIEW_H as u32,
                        "deviceScaleFactor": 1,
                        "mobile": false,
                        "scale": 1
                    }),
                )
                .await;
            }
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(120)).await;
    }
    stop_session();
    Err("The browser started but DevTools never came up.".into())
}

async fn page_ws(port: u16) -> Result<String, String> {
    if let Ok(guard) = PAGE_WS.lock() {
        if let Some((cached_port, url)) = guard.as_ref() {
            if *cached_port == port {
                return Ok(url.clone());
            }
        }
    }
    let url = fetch_page_ws(port).await?;
    if let Ok(mut guard) = PAGE_WS.lock() {
        *guard = Some((port, url.clone()));
    }
    Ok(url)
}

fn session_alive(port: u16) -> bool {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok()
}

async fn wait_ready(ws: &str) {
    for _ in 0..12 {
        if stopped() {
            return;
        }
        if let Ok(state) = eval_script(ws, "document.readyState").await {
            if state.contains("complete") || state.contains("interactive") {
                return;
            }
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

async fn eval_script(ws: &str, expression: &str) -> Result<String, String> {
    let v = drive(
        ws,
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
    let result = v.pointer("/result/value");
    match result {
        Some(Value::String(s)) => Ok(s.clone()),
        Some(other) => Ok(other.to_string()),
        None => Ok(String::new()),
    }
}

async fn drive_all(ws_url: &str, calls: Vec<(&str, Value)>) -> Result<Vec<Value>, String> {
    if calls.is_empty() {
        return Ok(Vec::new());
    }
    let (mut ws, _) = timeout(Duration::from_secs(8), tokio_tungstenite::connect_async(ws_url))
        .await
        .map_err(|_| "DevTools websocket timed out".to_string())?
        .map_err(|e| format!("DevTools websocket: {e}"))?;
    let mut pending: std::collections::HashMap<u64, Value> = std::collections::HashMap::new();
    for (index, (method, params)) in calls.iter().enumerate() {
        let id = (index as u64) + 1;
        let body = json!({"id": id, "method": method, "params": params}).to_string();
        ws.send(Message::Text(body.into()))
            .await
            .map_err(|e| e.to_string())?;
    }
    let deadline = Instant::now() + Duration::from_secs(20);
    while pending.len() < calls.len() && Instant::now() < deadline {
        if stopped() {
            return Err("The user stopped browser control.".into());
        }
        match timeout(Duration::from_millis(400), ws.next()).await {
            Ok(Some(Ok(Message::Text(text)))) => {
                let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
                if let Some(id) = v.get("id").and_then(|id| id.as_u64()) {
                    if let Some(err) = v.get("error") {
                        return Err(err.to_string());
                    }
                    pending.insert(id, v.get("result").cloned().unwrap_or(Value::Null));
                }
            }
            Ok(Some(Ok(_))) => {}
            Ok(Some(Err(e))) => return Err(format!("DevTools socket: {e}")),
            Ok(None) => break,
            Err(_) => {}
        }
    }
    if pending.len() < calls.len() {
        return Err("DevTools timed out during input.".into());
    }
    Ok((1..=calls.len() as u64).filter_map(|id| pending.remove(&id)).collect())
}

async fn drive(ws_url: &str, method: &str, params: Value) -> Result<Value, String> {
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
        if stopped() {
            return Err("The user stopped browser control.".into());
        }
        match timeout(Duration::from_millis(400), ws.next()).await {
            Ok(Some(Ok(Message::Text(text)))) => {
                let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
                if v.get("id").and_then(|id| id.as_u64()) == Some(1) {
                    if let Some(err) = v.get("error") {
                        return Err(err.to_string());
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

fn page_error(ctx: &ToolCtx<'_>, url: &str, message: &str) -> ToolOutcome {
    SHOW_FRAMES.store(false, Ordering::SeqCst);
    let _ = ctx.app_handle.emit(
        "agent-browse",
        json!({
            "id": "live",
            "status": "error",
            "url": url,
            "title": "This site can't be reached",
            "error": message,
            "image": ""
        }),
    );
    ok(
        &format!("{message} URL: {url}. Do not click this page. Try another URL or tell the user it failed to load."),
        browse_tag("error", url, "This site can't be reached"),
        None,
    )
}

fn page_failed(href: &str, title: &str) -> bool {
    let href = href.to_ascii_lowercase();
    let title = title.to_ascii_lowercase();
    href.starts_with("chrome-error:")
        || href.starts_with("edge-error:")
        || href.starts_with("chrome://network-error")
        || title.contains("can't be reached")
        || title.contains("can’t be reached")
        || title.contains("this page isn’t working")
        || title.contains("this page isn't working")
}

fn friendly_nav_error(raw: &str) -> String {
    let text = raw.to_ascii_uppercase();
    if text.contains("NAME_NOT_RESOLVED") || text.contains("NAME_RESOLUTION") {
        "The address couldn't be found.".into()
    } else if text.contains("CONNECTION_REFUSED") {
        "The site refused the connection.".into()
    } else if text.contains("TIMED_OUT") || text.contains("CONNECTION_TIMED_OUT") {
        "The site took too long to respond.".into()
    } else if text.contains("INTERNET_DISCONNECTED") || text.contains("NETWORK_CHANGED") {
        "No internet connection.".into()
    } else if text.contains("CERT") || text.contains("SSL") {
        "The site's certificate could not be trusted.".into()
    } else {
        "This site can't be reached.".into()
    }
}

/// Wait until the document has actually moved, so a click is not snapshotted
/// on the previous page.
async fn wait_for_page(ws: &str, previous: &str) {
    let start = Instant::now();
    let limit = if previous.is_empty() {
        Duration::from_secs(6)
    } else {
        Duration::from_millis(2500)
    };
    while start.elapsed() < limit {
        if stopped() {
            return;
        }
        let raw = eval_script(
            ws,
            r#"(function(){return JSON.stringify({ready:document.readyState,href:location.href||""})})()"#,
        )
        .await
        .unwrap_or_default();
        let v: Value = serde_json::from_str(&raw).unwrap_or(json!({}));
        let href = v.get("href").and_then(|h| h.as_str()).unwrap_or("");
        let ready = v.get("ready").and_then(|h| h.as_str()).unwrap_or("");
        let blank = href.is_empty() || href.starts_with("about:");
        if previous.is_empty() {
            if ready == "complete" && !blank {
                return;
            }
        } else if href != previous && (ready == "complete" || ready == "interactive") {
            return;
        } else if href == previous && (ready == "complete" || ready == "interactive") && start.elapsed() > Duration::from_millis(160) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(120)).await;
    }
}

async fn click_at(ws: &str, x: f64, y: f64) -> Result<(), String> {
    let (px, py) = percent_to_px(x, y);
    click_px(ws, px, py).await
}

async fn click_px(ws: &str, px: f64, py: f64) -> Result<(), String> {
    drive_all(
        ws,
        vec![
            (
                "Input.dispatchMouseEvent",
                json!({"type": "mouseMoved", "x": px, "y": py}),
            ),
            (
                "Input.dispatchMouseEvent",
                json!({"type": "mousePressed", "x": px, "y": py, "button": "left", "clickCount": 1}),
            ),
            (
                "Input.dispatchMouseEvent",
                json!({"type": "mouseReleased", "x": px, "y": py, "button": "left", "clickCount": 1}),
            ),
        ],
    )
    .await
    .map(|_| ())
}

async fn capture_jpeg(ws: &str) -> Result<String, String> {
    let v = drive(
        ws,
        "Page.captureScreenshot",
        json!({ "format": "jpeg", "quality": 40, "fromSurface": true }),
    )
    .await?;
    v.get("data")
        .and_then(|d| d.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| "Screenshot was empty.".into())
}

fn percent_to_px(x: f64, y: f64) -> (f64, f64) {
    ((x.clamp(0.0, 100.0) / 100.0) * VIEW_W, (y.clamp(0.0, 100.0) / 100.0) * VIEW_H)
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let head: String = text.chars().take(max).collect();
    format!("{head}\n[truncated]")
}

fn ok(tool_result: &str, ui_chunk: String, side_effect: Option<SideEffect>) -> ToolOutcome {
    ToolOutcome {
        tool_result: tool_result.to_string(),
        ui_chunk,
        side_effect,
    }
}

fn fail(message: &str) -> ToolOutcome {
    ToolOutcome {
        tool_result: format!("BLOCKED: {message}"),
        ui_chunk: String::new(),
        side_effect: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_maps_into_the_viewport() {
        let (x, y) = percent_to_px(0.0, 100.0);
        assert_eq!(x, 0.0);
        assert_eq!(y, VIEW_H);
        let (x, y) = percent_to_px(50.0, 25.0);
        assert_eq!(x, VIEW_W / 2.0);
        assert_eq!(y, VIEW_H / 4.0);
    }
}
