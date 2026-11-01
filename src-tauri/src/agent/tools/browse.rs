//! In-app browser control. Launches a headless Chromium the user never sees as a
//! desktop window. Shape shows the screenshot and cursor in chat and in the
//! Browser tab. This does not drive the rest of the desktop.

#![allow(dead_code, unused_imports)]

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU32, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::{Emitter, Manager};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

use super::dispatch::{SideEffect, ToolCtx, ToolOutcome};
use super::runtime_inspect::{fetch_page_ws, find_chromium, free_port};
use crate::browser::cdp::PageConn;

const VIEW_W: f64 = 1280.0;
const VIEW_H: f64 = 720.0;

static STOP: AtomicBool = AtomicBool::new(false);
static SHOW_FRAMES: AtomicBool = AtomicBool::new(false);
static CAST_SEEN: AtomicBool = AtomicBool::new(false);
static WATCH_GEN: AtomicU64 = AtomicU64::new(0);
static TRACE_GEN: AtomicU64 = AtomicU64::new(0);
static LIVE_PORT: AtomicU16 = AtomicU16::new(0);
static TRACE_PORT: AtomicU16 = AtomicU16::new(0);
static FRAME_KEY: AtomicU64 = AtomicU64::new(0);
static PAGE_WS: Mutex<Option<(u16, String)>> = Mutex::new(None);
static LAST_FRAME: Mutex<Option<String>> = Mutex::new(None);
static LAST_SNAP: Mutex<Option<Value>> = Mutex::new(None);
static TRACE: Mutex<Option<Trace>> = Mutex::new(None);
static SHOTS_IN_FLIGHT: AtomicU32 = AtomicU32::new(0);

struct Trace {
    console: Vec<String>,
    network: Vec<String>,
    inflight: u32,
    quiet: bool,
    last_net: Instant,
    requests: HashMap<String, String>,
}

fn fresh_trace() -> Trace {
    Trace {
        console: Vec::new(),
        network: Vec::new(),
        inflight: 0,
        quiet: false,
        last_net: Instant::now(),
        requests: HashMap::new(),
    }
}

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

/// Absolute paths of wallpaper images the preview can show.
/// Drop files in `public/wallpapers` while developing, or in the app-data
/// `wallpapers` folder at runtime. No images are fetched or generated.
#[tauri::command]
pub fn list_browse_wallpapers(app: tauri::AppHandle) -> Vec<String> {
    let mut found: Vec<PathBuf> = Vec::new();
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public/wallpapers");
    if bundled.is_dir() {
        collect_wallpapers(&bundled, &mut found);
    }
    if let Ok(data) = app.path().app_data_dir() {
        let user = data.join("wallpapers");
        let _ = std::fs::create_dir_all(&user);
        if let Ok(resource) = app.path().resource_dir() {
            copy_missing_wallpapers(&resource.join("wallpapers"), &user);
        }
        collect_wallpapers(&user, &mut found);
    }
    let mut named: Vec<(String, String)> = found
        .into_iter()
        .filter_map(|path| {
            let name = path.file_name()?.to_string_lossy().to_lowercase();
            Some((name, path.to_string_lossy().to_string()))
        })
        .collect();
    named.sort_by(|a, b| a.0.cmp(&b.0));
    named.dedup_by(|a, b| a.0 == b.0);
    named.truncate(24);
    named.into_iter().map(|(_, path)| path).collect()
}

pub fn stop_session() {
    STOP.store(true, Ordering::SeqCst);
    SHOW_FRAMES.store(false, Ordering::SeqCst);
    CAST_SEEN.store(false, Ordering::SeqCst);
    LIVE_PORT.store(0, Ordering::SeqCst);
    TRACE_PORT.store(0, Ordering::SeqCst);
    FRAME_KEY.store(0, Ordering::SeqCst);
    crate::browser::clear_live_port();
    if let Ok(mut guard) = PAGE_WS.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = LAST_SNAP.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = TRACE.lock() {
        *guard = None;
    }
    WATCH_GEN.fetch_add(1, Ordering::SeqCst);
    TRACE_GEN.fetch_add(1, Ordering::SeqCst);
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

enum StepStop {
    Page { url: String, message: String },
    Msg(String),
}

pub async fn tool_browse(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let top_action = args
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("open")
        .trim()
        .to_ascii_lowercase();
    if stopped() && top_action != "open" && args.get("steps").is_none() {
        return fail("The user stopped browser control. Call browse with action open if they ask you to continue.");
    }
    if ctx.cancel.is_cancelled() {
        return fail("Stopped.");
    }

    let steps = match planned_steps(args) {
        Ok(steps) => steps,
        Err(err) => return fail(&err),
    };
    let opens = steps.iter().any(|step| step_action(step) == "open");
    if stopped() && !opens {
        return fail("The user stopped browser control. Call browse with action open if they ask you to continue.");
    }
    if steps.len() == 1 && step_action(&steps[0]) == "stop" {
        stop_session();
        let _ = ctx.app_handle.emit(
            "agent-browse",
            json!({"id": "live", "status": "stopped"}),
        );
        return ok(
            "Browser control stopped.",
            browse_tag("stopped", "", "Browser"),
            None,
        );
    }

    if let Err(err) = ensure_session().await {
        return fail(&err);
    }
    if stopped() && !opens {
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
    start_monitors(ctx.app_handle.clone(), port);
    SHOW_FRAMES.store(true, Ordering::SeqCst);

    let mut conn = match PageConn::connect(&ws).await {
        Ok(conn) => conn,
        Err(err) => return fail(&format!("DevTools is not ready: {err}")),
    };
    let _ = conn.call("Page.enable", json!({}), stopped).await;
    let _ = conn.eval(CONSOLE_HOOK, stopped).await;

    let mut cursor_x = args.get("x").and_then(|v| v.as_f64()).unwrap_or(50.0).clamp(0.0, 100.0);
    let mut cursor_y = args.get("y").and_then(|v| v.as_f64()).unwrap_or(50.0).clamp(0.0, 100.0);
    let mut notes = Vec::new();
    let mut actions = Vec::new();
    let mut check_failed = false;
    for step in &steps {
        if stopped() || ctx.cancel.is_cancelled() {
            notes.push("FAILED: Stopped.".to_string());
            break;
        }
        let action = step_action(step);
        actions.push(action.clone());
        match run_step(ctx, &mut conn, step, &mut cursor_x, &mut cursor_y, stopped).await {
            Ok(note) => {
                if note.starts_with("FAIL") {
                    check_failed = true;
                }
                notes.push(note);
            }
            Err(StepStop::Page { url, message }) => return page_error(ctx, &url, &message),
            Err(StepStop::Msg(message)) => {
                notes.push(format!("FAILED: {message}"));
                break;
            }
        }
    }

    let snap = conn
        .eval(SNAPSHOT_JS, stopped)
        .await
        .unwrap_or_else(|_| "{}".into());
    let snap_v: Value = serde_json::from_str(&snap).unwrap_or(json!({}));
    let title = snap_v.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let href = snap_v.get("href").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let failed = snap_v.get("failed").and_then(|v| v.as_bool()).unwrap_or(false);
    if failed || page_failed(&href, &title) {
        let url = if href.is_empty() {
            steps
                .iter()
                .find_map(|step| step.get("url").and_then(|v| v.as_str()))
                .unwrap_or("")
        } else {
            href.as_str()
        };
        return page_error(ctx, url, "This site can't be reached.");
    }

    let previous = LAST_SNAP.lock().ok().and_then(|guard| guard.clone());
    let fresh = opens || previous.is_none();
    let (dom_changed, dom_text) = describe_dom(if fresh { None } else { previous.as_ref() }, &snap_v);
    if let Ok(mut guard) = LAST_SNAP.lock() {
        *guard = Some(snap_v.clone());
    }

    let console = merged_console(&snap_v, 8);
    let _ = ctx.app_handle.emit(
        "agent-browse",
        json!({
            "id": "live",
            "status": "controlling",
            "url": href,
            "title": title,
            "x": cursor_x,
            "y": cursor_y,
            "console": console,
        }),
    );

    let capture = should_capture(&actions, dom_changed, check_failed);
    let mut shot_note = if capture {
        "\nScreenshot of this view is attached. Read it with the element list."
    } else if !dom_changed {
        "\nScreenshot skipped. The DOM did not change."
    } else {
        "\nScreenshot skipped."
    };
    let mut side = None;
    if capture {
        match capture_jpeg(&mut conn, stopped).await {
            Ok(jpeg) => {
                let image = format!("data:image/jpeg;base64,{jpeg}");
                publish_still(&ctx.app_handle, &image);
                let tag = super::page_shot::attached_image_tag("browse.jpg", "image/jpeg", &image);
                side = Some(SideEffect::PageScreenshot { tag });
            }
            Err(err) => {
                shot_note = "\nScreenshot failed. Use the element list.";
                notes.push(format!("Screenshot: {err}"));
            }
        }
    }

    let summary = notes.join("\n");
    let problems = if console.is_empty() {
        String::new()
    } else {
        format!("\nConsole:\n{}", console.join("\n"))
    };
    let ui = browse_tag("controlling", &href, &title);
    let tool_result = format!(
        "{summary}\nPage: {title}\nURL: {href}\n{dom_text}{problems}{shot_note}"
    );
    ok(&tool_result, ui, side)
}

async fn run_step(
    ctx: &ToolCtx<'_>,
    conn: &mut PageConn,
    step: &Value,
    cursor_x: &mut f64,
    cursor_y: &mut f64,
    stop: fn() -> bool,
) -> Result<String, StepStop> {
    let action = step_action(step);
    let href_before = conn
        .eval(r#"(function(){return location.href||""})()"#, stop)
        .await
        .unwrap_or_default();
    if let Some(x) = step.get("x").and_then(|v| v.as_f64()) {
        *cursor_x = x.clamp(0.0, 100.0);
    }
    if let Some(y) = step.get("y").and_then(|v| v.as_f64()) {
        *cursor_y = y.clamp(0.0, 100.0);
    }

    let summary = match action.as_str() {
        "open" => {
            let url = match step.get("url").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
                Some(u) => match crate::agent::security::urls::validate_outbound_url(u) {
                    Ok(url) => url,
                    Err(err) => return Err(StepStop::Msg(err)),
                },
                None => return Err(StepStop::Msg("browse open requires url.".into())),
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
            mark_navigation();
            match conn.call("Page.navigate", json!({ "url": url }), stop).await {
                Ok(v) => match v.get("errorText").and_then(|e| e.as_str()).filter(|s| !s.is_empty()) {
                    Some(err) => Err(StepStop::Page {
                        url,
                        message: friendly_nav_error(err),
                    }),
                    None => Ok(format!("Opened {url}")),
                },
                Err(e) => Err(StepStop::Page {
                    url,
                    message: friendly_nav_error(&e),
                }),
            }
        }
        "click" => {
            emit_cursor(&ctx.app_handle, *cursor_x, *cursor_y);
            click_at(conn, *cursor_x, *cursor_y, stop)
                .await
                .map(|_| format!("Clicked at {cursor_x:.0}%, {cursor_y:.0}%"))
                .map_err(StepStop::Msg)
        }
        "type" => {
            let text = step.get("text").and_then(|v| v.as_str()).unwrap_or("");
            if text.is_empty() {
                Err(StepStop::Msg("browse type requires text.".into()))
            } else {
                conn.call("Input.insertText", json!({ "text": text }), stop)
                    .await
                    .map(|_| format!("Typed {} characters", text.chars().count()))
                    .map_err(StepStop::Msg)
            }
        }
        "scroll" => {
            emit_cursor(&ctx.app_handle, *cursor_x, *cursor_y);
            let dy = step.get("dy").and_then(|v| v.as_f64()).unwrap_or(400.0);
            let (px, py) = percent_to_px(*cursor_x, *cursor_y);
            conn.call(
                "Input.dispatchMouseEvent",
                json!({
                    "type": "mouseWheel",
                    "x": px,
                    "y": py,
                    "deltaX": 0,
                    "deltaY": dy
                }),
                stop,
            )
            .await
            .map(|_| format!("Scrolled {dy:.0}px"))
            .map_err(StepStop::Msg)
        }
        "script" => {
            let script = step.get("script").and_then(|v| v.as_str()).unwrap_or("");
            if script.is_empty() {
                Err(StepStop::Msg("browse script requires script.".into()))
            } else {
                conn.eval(script, stop)
                    .await
                    .map(|v| format!("Script result:\n{}", truncate(&v, 4000)))
                    .map_err(StepStop::Msg)
            }
        }
        "devtools" => devtools_step(conn, step, stop).await.map_err(StepStop::Msg),
        "check" => {
            let expect = step.get("expect").and_then(|v| v.as_str()).unwrap_or("").trim();
            let absent = step.get("absent").and_then(|v| v.as_str()).unwrap_or("").trim();
            if expect.is_empty() && absent.is_empty() {
                return Err(StepStop::Msg("browse check requires expect or absent.".into()));
            }
            let raw = conn
                .eval(
                    r#"(function(){var t=(document.body&&document.body.innerText)||"";return t.replace(/\s+/g," ").slice(0,16000)})()"#,
                    stop,
                )
                .await
                .unwrap_or_default();
            let (passed, note) = judge_check(&raw, expect, absent);
            if !passed && !note.starts_with("FAIL") && !note.starts_with("check ") {
                return Err(StepStop::Msg(note));
            }
            let console = recent_console(5);
            if console.is_empty() {
                Ok(note)
            } else {
                Ok(format!("{note}\nConsole:\n{}", console.join("\n")))
            }
        }
        "shot" => Ok("Captured the page.".into()),
        "observe" => Ok("Listed the page.".into()),
        "act" => act_on_target(&ctx.app_handle, conn, step, cursor_x, cursor_y, stop)
            .await
            .map_err(StepStop::Msg),
        "batch" => Err(StepStop::Msg(
            "Pass steps for a batch. Each step needs its own action.".into(),
        )),
        other => Err(StepStop::Msg(format!(
            "Unknown browse action '{other}'. Use open, act, click, type, scroll, script, devtools, check, shot, or stop."
        ))),
    }?;

    match action.as_str() {
        "open" => wait_for_page(conn, "", stop, &ctx.cancel).await,
        "act" | "click" | "scroll" => wait_for_page(conn, &href_before, stop, &ctx.cancel).await,
        _ => {}
    }
    Ok(summary)
}

async fn devtools_step(
    conn: &mut PageConn,
    step: &Value,
    stop: fn() -> bool,
) -> Result<String, String> {
    let scope = step
        .get("scope")
        .and_then(|v| v.as_str())
        .unwrap_or("all")
        .trim()
        .to_ascii_lowercase();
    let mut parts = Vec::new();
    if scope == "all" || scope == "console" {
        let lines = recent_console(20);
        parts.push(if lines.is_empty() {
            "Console: no errors or warnings.".into()
        } else {
            format!("Console:\n{}", lines.join("\n"))
        });
    }
    if scope == "all" || scope == "network" {
        let lines = recent_network(20);
        parts.push(if lines.is_empty() {
            "Network: no requests recorded yet.".into()
        } else {
            format!("Network:\n{}", lines.join("\n"))
        });
    }
    if scope == "all" || scope == "css" {
        parts.push(css_report(conn, step, stop).await);
    }
    if scope == "all" || scope == "js" {
        parts.push(js_report(conn, step, stop).await?);
    }
    if scope == "all" || scope == "performance" {
        parts.push(perf_report(conn, stop).await);
    }
    if parts.is_empty() {
        return Err("devtools scope must be console, network, css, js, performance, or all.".into());
    }
    Ok(parts.join("\n"))
}

pub(crate) const SNAPSHOT_JS: &str = r#"(function(){
  var sel = 'a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[contenteditable="true"]';
  var nodes = Array.prototype.slice.call(document.querySelectorAll(sel));
  if (!window.__shapeTargets) window.__shapeTargets = {};
  if (!window.__shapeKeyIds) window.__shapeKeyIds = {};
  if (!window.__shapeNextId) window.__shapeNextId = 1;
  var counts = {};
  var out = [];
  var live = {};
  var added = [];
  var prev = window.__shapeLiveKeys || {};
  var hadPrev = false;
  for (var pk in prev) { hadPrev = true; break; }
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
    var style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    var name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.getAttribute("name") || "").replace(/\s+/g, " ").trim().slice(0, 60);
    var href = "";
    if (el.tagName === "A" && el.href) href = String(el.href).slice(0, 160);
    var base = el.tagName.toLowerCase() + "|" + name + "|" + href;
    counts[base] = (counts[base] || 0) + 1;
    var key = base + "|" + counts[base];
    var id = window.__shapeKeyIds[key];
    if (!id) {
      id = window.__shapeNextId++;
      window.__shapeKeyIds[key] = id;
      if (hadPrev) added.push(key);
    } else if (!prev[key]) {
      added.push(key);
    }
    window.__shapeTargets[id] = el;
    var w = window.innerWidth || 1;
    var h = window.innerHeight || 1;
    var item = {
      id: id,
      key: key,
      tag: el.tagName.toLowerCase(),
      name: name,
      x: Math.round((r.left + r.width / 2) / w * 100),
      y: Math.round((r.top + r.height / 2) / h * 100)
    };
    if (href) item.href = href;
    if ("value" in el && el.tagName !== "BUTTON" && el.tagName !== "A") {
      var val = String(el.value || "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (val) item.value = val;
    }
    out.push(item);
    live[key] = 1;
    if (out.length >= 40) break;
  }
  var removed = [];
  for (var rk in prev) if (!live[rk]) removed.push(rk);
  window.__shapeLiveKeys = live;
  var pageHref = location.href || "";
  var failed = pageHref.indexOf("chrome-error") === 0 || pageHref.indexOf("edge-error") === 0 || !!document.getElementById("main-frame-error");
  var sig = out.map(function(it){ return it.key + ":" + (it.value || ""); }).join("\n");
  var logs = (window.__shapeLogs || []).filter(function(line){
    return line.indexOf("error:") === 0 || line.indexOf("warn:") === 0;
  }).slice(-8);
  return JSON.stringify({ title: document.title || "", href: pageHref, failed: failed, elements: out, added: added, removed: removed, sig: sig, logs: logs });
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
    let _ = crate::browser::cdp::eval(
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
    conn: &mut PageConn,
    args: &Value,
    cursor_x: &mut f64,
    cursor_y: &mut f64,
    stop: fn() -> bool,
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
        .ok_or_else(|| "browse act requires target, an element id from the last snapshot.".to_string())?;
    let method = args.get("method").and_then(|v| v.as_str()).unwrap_or("click");
    let located = conn
        .eval(
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
            stop,
        )
        .await?;
    let v: Value = serde_json::from_str(&located).unwrap_or(json!({"ok": false}));
    if v.get("ok").and_then(|b| b.as_bool()) != Some(true) {
        return Err(format!("Element {id} is not on the page. Take another browse snapshot."));
    }
    let x = v.get("x").and_then(|n| n.as_f64()).unwrap_or(0.0);
    let y = v.get("y").and_then(|n| n.as_f64()).unwrap_or(0.0);
    let w = v.get("w").and_then(|n| n.as_f64()).unwrap_or(VIEW_W).max(1.0);
    let h = v.get("h").and_then(|n| n.as_f64()).unwrap_or(VIEW_H).max(1.0);
    *cursor_x = (x / w * 100.0).clamp(0.0, 100.0);
    *cursor_y = (y / h * 100.0).clamp(0.0, 100.0);
    let name = v.get("name").and_then(|n| n.as_str()).unwrap_or("");
    emit_cursor(app, *cursor_x, *cursor_y);
    if method == "type" {
        let text = args.get("text").and_then(|v| v.as_str()).unwrap_or("");
        if text.is_empty() {
            return Err("browse act method type requires text.".into());
        }
        let _ = conn
            .eval(
                &format!(r#"(function(){{ var el = window.__shapeTargets && window.__shapeTargets[{id}]; if (el) {{ el.focus(); if ("value" in el) el.value = ""; }} return "ok"; }})()"#),
                stop,
            )
            .await;
        conn.call("Input.insertText", json!({ "text": text }), stop).await?;
        return Ok(format!("Typed into [{id}] {name}"));
    }
    let link = v.get("href").and_then(|n| n.as_str()).unwrap_or("");
    let current_href = conn
        .eval(r#"(function(){return location.href||""})()"#, stop)
        .await
        .unwrap_or_default();
    if link.starts_with("http://") || link.starts_with("https://") {
        if is_same_document_nav(&current_href, link) {
            click_px(conn, x, y, stop).await?;
            tokio::time::sleep(Duration::from_millis(80)).await;
            let _ = conn
                .eval(
                    r#"(function(){ var step = Math.max(360, (window.innerHeight || 720) * 0.7); window.scrollBy({ top: step, left: 0, behavior: "auto" }); return "ok"; })()"#,
                    stop,
                )
                .await;
            return Ok(format!("Clicked [{id}] {name} (scrolled past in-page link)"));
        }
        mark_navigation();
        conn.call("Page.navigate", json!({ "url": link }), stop).await?;
        return Ok(format!("Opened {link}"));
    }
    click_px(conn, x, y, stop).await?;
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

fn start_monitors(app: tauri::AppHandle, port: u16) {
    start_live_view(app, port);
    start_trace(port);
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
            "quality": 64,
            "maxWidth": 1024,
            "maxHeight": 576,
            "everyNthFrame": 1
        }
    });
    ws.send(Message::Text(start.to_string().into()))
        .await
        .map_err(|e| e.to_string())?;
    let mut ack_id: u64 = 10;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut pending: Option<(u64, String)> = None;
    while WATCH_GEN.load(Ordering::SeqCst) == gen && !stopped() {
        let wait = if pending.is_some() {
            Duration::from_millis(90)
        } else {
            Duration::from_secs(2)
        };
        match timeout(wait, ws.next()).await {
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
                let Some(data) = v.pointer("/params/data").and_then(|d| d.as_str()) else {
                    continue;
                };
                if data.is_empty() {
                    continue;
                }
                let key = jpeg_key(data);
                if key != FRAME_KEY.load(Ordering::Relaxed) {
                    pending = Some((key, data.to_string()));
                }
            }
            Ok(Some(Ok(_))) => {}
            Ok(Some(Err(_))) | Ok(None) => return Err("Screencast socket closed.".into()),
            Err(_) => {}
        }
        let due = pending.as_ref().is_some_and(|(key, _)| {
            *key != FRAME_KEY.load(Ordering::Relaxed) && last_emit.elapsed() >= Duration::from_millis(80)
        });
        if !due {
            continue;
        }
        let Some((key, data)) = pending.take() else {
            continue;
        };
        last_emit = Instant::now();
        FRAME_KEY.store(key, Ordering::Relaxed);
        CAST_SEEN.store(true, Ordering::SeqCst);
        let image = format!("data:image/jpeg;base64,{data}");
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
                let _ = crate::browser::cdp::call(&ws, "Page.enable", json!({})).await;
                let _ = crate::browser::cdp::call(
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
fn start_trace(port: u16) {
    if TRACE_PORT.load(Ordering::SeqCst) == port && !stopped() {
        return;
    }
    TRACE_PORT.store(port, Ordering::SeqCst);
    let gen = TRACE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        while TRACE_GEN.load(Ordering::SeqCst) == gen && !stopped() {
            match run_trace(port, gen).await {
                Ok(()) => break,
                Err(_) => tokio::time::sleep(Duration::from_millis(300)).await,
            }
        }
    });
}

async fn run_trace(port: u16, gen: u64) -> Result<(), String> {
    let ws_url = fetch_page_ws(port).await?;
    let (mut ws, _) = timeout(Duration::from_secs(8), tokio_tungstenite::connect_async(&ws_url))
        .await
        .map_err(|_| "DevTools websocket timed out".to_string())?
        .map_err(|e| format!("DevTools websocket: {e}"))?;
    for (index, (method, params)) in [
        ("Network.enable", json!({})),
        ("Runtime.enable", json!({})),
        ("Console.enable", json!({})),
        ("Page.enable", json!({})),
        ("Page.setLifecycleEventsEnabled", json!({ "enabled": true })),
    ]
    .into_iter()
    .enumerate()
    {
        let body = json!({ "id": index + 1, "method": method, "params": params }).to_string();
        ws.send(Message::Text(body.into()))
            .await
            .map_err(|e| e.to_string())?;
    }
    while TRACE_GEN.load(Ordering::SeqCst) == gen && !stopped() {
        match timeout(Duration::from_secs(2), ws.next()).await {
            Ok(Some(Ok(Message::Text(text)))) => {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    if v.get("method").is_some() {
                        ingest_trace(&v);
                    }
                }
            }
            Ok(Some(Ok(_))) => {}
            Ok(Some(Err(_))) | Ok(None) => return Err("DevTools trace closed.".into()),
            Err(_) => {}
        }
    }
    Ok(())
}

fn mark_navigation() {
    let mut guard = TRACE.lock().unwrap_or_else(|p| p.into_inner());
    if guard.is_none() {
        *guard = Some(fresh_trace());
    }
    if let Some(trace) = guard.as_mut() {
        trace.quiet = false;
        trace.inflight = 0;
        trace.last_net = Instant::now();
    }
}

fn trace_is_quiet() -> bool {
    let guard = TRACE.lock().unwrap_or_else(|p| p.into_inner());
    let Some(trace) = guard.as_ref() else {
        return false;
    };
    trace.quiet && trace.inflight == 0 && trace.last_net.elapsed() > Duration::from_millis(140)
}

fn recent_console(limit: usize) -> Vec<String> {
    let guard = TRACE.lock().unwrap_or_else(|p| p.into_inner());
    let Some(trace) = guard.as_ref() else {
        return Vec::new();
    };
    let skip = trace.console.len().saturating_sub(limit);
    trace.console.iter().skip(skip).cloned().collect()
}

fn recent_network(limit: usize) -> Vec<String> {
    let guard = TRACE.lock().unwrap_or_else(|p| p.into_inner());
    let Some(trace) = guard.as_ref() else {
        return Vec::new();
    };
    let skip = trace.network.len().saturating_sub(limit);
    trace.network.iter().skip(skip).cloned().collect()
}

fn push_capped(buf: &mut Vec<String>, line: String, cap: usize) {
    if buf.last().is_some_and(|item| item == &line) {
        return;
    }
    buf.push(line);
    if buf.len() > cap {
        let extra = buf.len() - cap;
        buf.drain(0..extra);
    }
}

fn ingest_trace(v: &Value) {
    let Some(method) = v.get("method").and_then(|m| m.as_str()) else {
        return;
    };
    let mut guard = TRACE.lock().unwrap_or_else(|p| p.into_inner());
    if guard.is_none() {
        *guard = Some(fresh_trace());
    }
    let Some(trace) = guard.as_mut() else {
        return;
    };
    match method {
        "Page.frameNavigated" => {
            let parent = v.pointer("/params/frame/parentId");
            if parent.is_none() || parent == Some(&Value::Null) {
                trace.quiet = false;
                trace.inflight = 0;
                trace.network.clear();
                trace.requests.clear();
                trace.last_net = Instant::now();
            }
        }
        "Page.lifecycleEvent" => {
            let name = v.pointer("/params/name").and_then(|n| n.as_str()).unwrap_or("");
            if name == "networkIdle" || name == "networkAlmostIdle" {
                trace.quiet = true;
            }
        }
        "Page.loadEventFired" => {
            if trace.inflight == 0 {
                trace.quiet = true;
            }
        }
        "Network.requestWillBeSent" => {
            let id = v
                .pointer("/params/requestId")
                .and_then(|s| s.as_str())
                .unwrap_or("")
                .to_string();
            let url = v
                .pointer("/params/request/url")
                .and_then(|s| s.as_str())
                .unwrap_or("");
            if !id.is_empty() {
                if trace.requests.len() > 300 {
                    trace.requests.clear();
                }
                trace.requests.insert(id, short_url(url));
            }
            trace.inflight = trace.inflight.saturating_add(1);
            trace.quiet = false;
            trace.last_net = Instant::now();
        }
        "Network.loadingFinished" => {
            trace.inflight = trace.inflight.saturating_sub(1);
            trace.last_net = Instant::now();
            if trace.inflight == 0 {
                trace.quiet = true;
            }
        }
        "Network.loadingFailed" => {
            trace.inflight = trace.inflight.saturating_sub(1);
            trace.last_net = Instant::now();
            let id = v.pointer("/params/requestId").and_then(|s| s.as_str()).unwrap_or("");
            let url = trace
                .requests
                .get(id)
                .cloned()
                .unwrap_or_else(|| "request".into());
            let err = v
                .pointer("/params/errorText")
                .and_then(|s| s.as_str())
                .unwrap_or("failed");
            push_capped(&mut trace.network, format!("FAILED {err} {url}"), 30);
            if trace.inflight == 0 {
                trace.quiet = true;
            }
        }
        "Network.responseReceived" => {
            let id = v.pointer("/params/requestId").and_then(|s| s.as_str()).unwrap_or("");
            let resp = v.pointer("/params/response");
            let status = resp.and_then(|r| r.get("status")).and_then(|s| s.as_u64()).unwrap_or(0);
            let url = resp
                .and_then(|r| r.get("url"))
                .and_then(|s| s.as_str())
                .map(short_url)
                .or_else(|| trace.requests.get(id).cloned())
                .unwrap_or_default();
            let mime = resp
                .and_then(|r| r.get("mimeType"))
                .and_then(|s| s.as_str())
                .unwrap_or("");
            if status >= 400 || status == 0 || trace.network.len() < 12 {
                push_capped(&mut trace.network, format!("{status} {mime} {url}"), 30);
            }
            trace.last_net = Instant::now();
        }
        "Runtime.exceptionThrown" => {
            if let Some(text) = v.pointer("/params/exceptionDetails/text").and_then(|t| t.as_str()) {
                push_capped(&mut trace.console, format!("exception: {text}"), 40);
            }
        }
        "Runtime.consoleAPICalled" => {
            let kind = v.pointer("/params/type").and_then(|t| t.as_str()).unwrap_or("");
            if kind == "error" || kind == "warning" {
                let text = v
                    .pointer("/params/args")
                    .and_then(|a| a.as_array())
                    .map(|args| {
                        args.iter()
                            .filter_map(|arg| {
                                arg.get("value")
                                    .map(|value| match value {
                                        Value::String(s) => s.clone(),
                                        other => other.to_string(),
                                    })
                                    .or_else(|| {
                                        arg.get("description").and_then(|d| d.as_str()).map(|s| s.to_string())
                                    })
                            })
                            .collect::<Vec<_>>()
                            .join(" ")
                    })
                    .unwrap_or_default();
                if !text.is_empty() {
                    push_capped(&mut trace.console, format!("{kind}: {text}"), 40);
                }
            }
        }
        "Console.messageAdded" => {
            let level = v.pointer("/params/message/level").and_then(|l| l.as_str()).unwrap_or("");
            if level == "error" || level == "warning" {
                let text = v.pointer("/params/message/text").and_then(|t| t.as_str()).unwrap_or("");
                if !text.is_empty() {
                    push_capped(&mut trace.console, format!("{level}: {text}"), 40);
                }
            }
        }
        _ => {}
    }
}

fn short_url(url: &str) -> String {
    let bare = url.split('?').next().unwrap_or(url);
    if bare.chars().count() <= 140 {
        bare.to_string()
    } else {
        let head: String = bare.chars().take(140).collect();
        format!("{head}…")
    }
}

async fn wait_for_page(
    conn: &mut PageConn,
    previous: &str,
    stop: fn() -> bool,
    cancel: &tokio_util::sync::CancellationToken,
) {
    let start = Instant::now();
    let limit = if previous.is_empty() {
        Duration::from_secs(8)
    } else {
        Duration::from_millis(3000)
    };
    while start.elapsed() < limit {
        if stop() || cancel.is_cancelled() {
            return;
        }
        let raw = conn
            .eval(
                r#"(function(){return JSON.stringify({ready:document.readyState,href:location.href||""})})()"#,
                stop,
            )
            .await
            .unwrap_or_default();
        let v: Value = serde_json::from_str(&raw).unwrap_or(json!({}));
        let href = v.get("href").and_then(|h| h.as_str()).unwrap_or("");
        let ready = v.get("ready").and_then(|h| h.as_str()).unwrap_or("");
        let blank = href.is_empty() || href.starts_with("about:");
        let settled = trace_is_quiet();
        if previous.is_empty() {
            if ready == "complete" && !blank && (settled || start.elapsed() > Duration::from_millis(1400)) {
                return;
            }
        } else if href != previous
            && (ready == "complete" || ready == "interactive")
            && (settled || start.elapsed() > Duration::from_millis(700))
        {
            return;
        } else if href == previous
            && (ready == "complete" || ready == "interactive")
            && start.elapsed() > Duration::from_millis(140)
            && (settled || start.elapsed() > Duration::from_millis(420))
        {
            return;
        }
        tokio::time::sleep(Duration::from_millis(70)).await;
    }
}

async fn click_at(conn: &mut PageConn, x: f64, y: f64, stop: fn() -> bool) -> Result<(), String> {
    let (px, py) = percent_to_px(x, y);
    click_px(conn, px, py, stop).await
}

async fn click_px(conn: &mut PageConn, px: f64, py: f64, stop: fn() -> bool) -> Result<(), String> {
    conn.call_all(
        vec![
            ("Input.dispatchMouseEvent", json!({ "type": "mouseMoved", "x": px, "y": py })),
            (
                "Input.dispatchMouseEvent",
                json!({ "type": "mousePressed", "x": px, "y": py, "button": "left", "clickCount": 1 }),
            ),
            (
                "Input.dispatchMouseEvent",
                json!({ "type": "mouseReleased", "x": px, "y": py, "button": "left", "clickCount": 1 }),
            ),
        ],
        stop,
    )
    .await
    .map(|_| ())
}

async fn capture_jpeg(conn: &mut PageConn, stop: fn() -> bool) -> Result<String, String> {
    let v = conn
        .call(
            "Page.captureScreenshot",
            json!({
                "format": "jpeg",
                "quality": 58,
                "clip": { "x": 0, "y": 0, "width": VIEW_W, "height": VIEW_H, "scale": 0.75 }
            }),
            stop,
        )
        .await?;
    v.get("data")
        .and_then(|d| d.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| "Screenshot was empty.".into())
}

fn publish_still(app: &tauri::AppHandle, image: &str) {
    if CAST_SEEN.load(Ordering::SeqCst) {
        return;
    }
    if let Ok(mut guard) = LAST_FRAME.lock() {
        *guard = Some(image.to_string());
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

fn emit_cursor(app: &tauri::AppHandle, x: f64, y: f64) {
    let _ = app.emit(
        "agent-browse",
        json!({ "id": "live", "status": "controlling", "x": x, "y": y }),
    );
}

fn step_action(step: &Value) -> String {
    step.get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("open")
        .trim()
        .to_ascii_lowercase()
}

fn planned_steps(args: &Value) -> Result<Vec<Value>, String> {
    let Some(raw) = args.get("steps") else {
        return Ok(vec![args.clone()]);
    };
    let steps = if let Some(arr) = raw.as_array() {
        arr.clone()
    } else if let Some(text) = raw.as_str() {
        serde_json::from_str::<Vec<Value>>(text).map_err(|_| "steps must be a list of actions.".to_string())?
    } else {
        return Err("steps must be a list of actions.".into());
    };
    if steps.is_empty() {
        return Err("steps is empty.".into());
    }
    Ok(steps.into_iter().take(8).collect())
}

fn should_capture(actions: &[String], dom_changed: bool, check_failed: bool) -> bool {
    if check_failed {
        return true;
    }
    for action in actions {
        match action.as_str() {
            "open" | "click" | "act" | "scroll" | "shot" => return true,
            "type" | "script" if dom_changed => return true,
            _ => {}
        }
    }
    false
}

fn describe_dom(previous: Option<&Value>, snap: &Value) -> (bool, String) {
    let sig = snap.get("sig").and_then(|s| s.as_str()).unwrap_or("");
    let prev_sig = previous.and_then(|p| p.get("sig")).and_then(|s| s.as_str()).unwrap_or("");
    let href = snap.get("href").and_then(|s| s.as_str()).unwrap_or("");
    let prev_href = previous.and_then(|p| p.get("href")).and_then(|s| s.as_str()).unwrap_or("");
    let changed = previous.is_none() || sig != prev_sig || href != prev_href;
    let elements = format_elements(snap.get("elements"));
    if !changed {
        return (
            false,
            format!("DOM unchanged. Element ids are still valid.\n{elements}"),
        );
    }
    if previous.is_none() || href != prev_href {
        return (true, format!("Elements (act on an id):\n{elements}"));
    }
    let delta = format_delta(snap);
    (true, format!("{delta}Elements (act on an id):\n{elements}"))
}

fn format_elements(elements: Option<&Value>) -> String {
    let Some(arr) = elements.and_then(|v| v.as_array()) else {
        return "(none)".into();
    };
    if arr.is_empty() {
        return "(none)".into();
    }
    arr.iter()
        .map(|el| {
            let id = el.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
            let tag = el.get("tag").and_then(|v| v.as_str()).unwrap_or("");
            let name = el.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let href = el.get("href").and_then(|v| v.as_str()).unwrap_or("");
            let value = el.get("value").and_then(|v| v.as_str()).unwrap_or("");
            let x = el.get("x").and_then(|v| v.as_i64()).unwrap_or(0);
            let y = el.get("y").and_then(|v| v.as_i64()).unwrap_or(0);
            let mut line = format!("[{id}] {tag}");
            if !name.is_empty() {
                line.push_str(&format!(" \"{name}\""));
            }
            if !href.is_empty() {
                line.push_str(&format!(" href={href}"));
            }
            if !value.is_empty() {
                line.push_str(&format!(" value={value}"));
            }
            line.push_str(&format!(" @{x},{y}"));
            line
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn format_delta(snap: &Value) -> String {
    let added = key_labels(snap.get("added"));
    let removed = key_labels(snap.get("removed"));
    if added.is_empty() && removed.is_empty() {
        return "DOM values changed.\n".into();
    }
    let mut lines = Vec::new();
    for item in added {
        lines.push(format!("+ {item}"));
    }
    for item in removed {
        lines.push(format!("- {item}"));
    }
    format!("DOM changes:\n{}\n", lines.join("\n"))
}

fn key_labels(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(|v| v.as_array())
        .map(|items| items.iter().filter_map(|v| v.as_str().map(label_key)).take(12).collect())
        .unwrap_or_default()
}

fn label_key(key: &str) -> String {
    let mut parts = key.split('|');
    let tag = parts.next().unwrap_or("");
    let name = parts.next().unwrap_or("");
    if name.is_empty() {
        tag.to_string()
    } else {
        format!("{tag} \"{name}\"")
    }
}

fn merged_console(snap: &Value, limit: usize) -> Vec<String> {
    let mut out = recent_console(limit);
    if let Some(logs) = snap.get("logs").and_then(|v| v.as_array()) {
        for line in logs {
            let Some(text) = line.as_str() else { continue };
            if !out.iter().any(|item| item == text) {
                out.push(text.to_string());
            }
        }
    }
    if out.len() > limit {
        out.split_off(out.len() - limit)
    } else {
        out
    }
}

fn judge_check(haystack: &str, expect: &str, absent: &str) -> (bool, String) {
    let hay = haystack.to_lowercase();
    let mut bad = Vec::new();
    let mut good = Vec::new();
    if !expect.is_empty() {
        if hay.contains(&expect.to_lowercase()) {
            good.push(format!("found \"{expect}\""));
        } else {
            bad.push(format!("missing \"{expect}\""));
        }
    }
    if !absent.is_empty() {
        if hay.contains(&absent.to_lowercase()) {
            bad.push(format!("still shows \"{absent}\""));
        } else {
            good.push(format!("\"{absent}\" is gone"));
        }
    }
    if bad.is_empty() {
        (true, format!("PASS {}", good.join("; ")))
    } else {
        (false, format!("FAIL {}", bad.join("; ")))
    }
}

async fn css_report(conn: &mut PageConn, step: &Value, stop: fn() -> bool) -> String {
    let Some(id) = element_id(step) else {
        return "CSS: pass target, an element id, to read computed style.".into();
    };
    let raw = conn
        .eval(
            &format!(
                r#"(function(){{
  var el = window.__shapeTargets && window.__shapeTargets[{id}];
  if (!el) return JSON.stringify({{ok:false}});
  var s = getComputedStyle(el);
  return JSON.stringify({{ok:true,tag:el.tagName,color:s.color,background:s.backgroundColor,font:s.font,display:s.display,position:s.position,width:s.width,height:s.height,margin:s.margin,padding:s.padding,opacity:s.opacity}});
}})()"#
            ),
            stop,
        )
        .await
        .unwrap_or_else(|err| json!({ "ok": false, "error": err }).to_string());
    let v: Value = serde_json::from_str(&raw).unwrap_or(json!({ "ok": false }));
    if v.get("ok").and_then(|b| b.as_bool()) != Some(true) {
        return format!("CSS: element {id} is not on the page.");
    }
    format!(
        "CSS [{id}] {tag} color={color} background={background} font={font} display={display} {width}×{height} margin={margin} padding={padding}",
        tag = v.get("tag").and_then(|s| s.as_str()).unwrap_or(""),
        color = v.get("color").and_then(|s| s.as_str()).unwrap_or(""),
        background = v.get("background").and_then(|s| s.as_str()).unwrap_or(""),
        font = v.get("font").and_then(|s| s.as_str()).unwrap_or(""),
        display = v.get("display").and_then(|s| s.as_str()).unwrap_or(""),
        width = v.get("width").and_then(|s| s.as_str()).unwrap_or(""),
        height = v.get("height").and_then(|s| s.as_str()).unwrap_or(""),
        margin = v.get("margin").and_then(|s| s.as_str()).unwrap_or(""),
        padding = v.get("padding").and_then(|s| s.as_str()).unwrap_or(""),
    )
}

async fn js_report(conn: &mut PageConn, step: &Value, stop: fn() -> bool) -> Result<String, String> {
    let script = step.get("script").and_then(|v| v.as_str()).unwrap_or("").trim();
    if !script.is_empty() {
        let value = conn.eval(script, stop).await?;
        return Ok(format!("JavaScript:\n{}", truncate(&value, 3000)));
    }
    let lines = recent_console(12);
    if lines.is_empty() {
        Ok("JavaScript: no exceptions.".into())
    } else {
        Ok(format!("JavaScript:\n{}", lines.join("\n")))
    }
}

async fn perf_report(conn: &mut PageConn, stop: fn() -> bool) -> String {
    let raw = conn
        .eval(
            r#"(function(){
  var nav = performance.getEntriesByType("navigation")[0];
  var slow = performance.getEntriesByType("resource").filter(function(e){ return e.duration > 300; }).slice(0, 8).map(function(e){
    return Math.round(e.duration) + "ms " + e.initiatorType + " " + String(e.name).split("?")[0].slice(0, 120);
  });
  if (!nav) return JSON.stringify({ slow: slow });
  return JSON.stringify({
    dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
    ttfb: Math.round(nav.responseStart - nav.requestStart),
    dom: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
    load: Math.round(nav.loadEventEnd - nav.startTime),
    transfer: nav.transferSize || 0,
    slow: slow
  });
})()"#,
            stop,
        )
        .await
        .unwrap_or_else(|err| err);
    let _ = conn.call("Performance.enable", json!({}), stop).await;
    let metrics = conn.call("Performance.getMetrics", json!({}), stop).await.ok();
    let extra = metrics.as_ref().map(format_metrics).unwrap_or_default();
    if extra.is_empty() {
        format!("Performance:\n{raw}")
    } else {
        format!("Performance:\n{raw}\n{extra}")
    }
}

fn format_metrics(v: &Value) -> String {
    let Some(arr) = v.get("metrics").and_then(|m| m.as_array()) else {
        return String::new();
    };
    let keep = ["ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "JSHeapUsedSize", "TaskDuration"];
    let mut parts = Vec::new();
    for name in keep {
        let Some(metric) = arr.iter().find(|item| item.get("name").and_then(|n| n.as_str()) == Some(name)) else {
            continue;
        };
        let value = metric.get("value").and_then(|n| n.as_f64()).unwrap_or(0.0);
        if name == "JSHeapUsedSize" {
            parts.push(format!("{name}={}kb", (value / 1024.0).round() as u64));
        } else {
            parts.push(format!("{name}={value:.1}"));
        }
    }
    parts.join(" ")
}

fn element_id(step: &Value) -> Option<u64> {
    step.get("target")
        .and_then(|v| v.as_u64())
        .or_else(|| step.get("target").and_then(|v| v.as_i64()).map(|n| n as u64))
        .or_else(|| {
            step.get("target")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<u64>().ok())
        })
}

fn jpeg_key(data: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    hash ^= data.len() as u64;
    hash = hash.wrapping_mul(0x100000001b3);
    let bytes = data.as_bytes();
    let sample = if bytes.len() > 96 {
        let mid = bytes.len() / 2;
        &bytes[mid..mid + 64]
    } else {
        bytes
    };
    for byte in sample {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn is_wallpaper(path: &std::path::Path) -> bool {
    let ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "avif" | "gif")
}

fn collect_wallpapers(dir: &std::path::Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && is_wallpaper(&path) {
            out.push(path);
        }
    }
}

fn copy_missing_wallpapers(from: &std::path::Path, to: &std::path::Path) {
    let mut bundled = Vec::new();
    collect_wallpapers(from, &mut bundled);
    for source in bundled {
        let Some(name) = source.file_name() else { continue };
        let dest = to.join(name);
        if !dest.exists() {
            let _ = std::fs::copy(&source, dest);
        }
    }
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

    #[test]
    fn steps_batch_is_capped_and_single_action_stays_one() {
        let single = json!({ "action": "shot" });
        assert_eq!(planned_steps(&single).unwrap().len(), 1);
        let batch = json!({
            "action": "batch",
            "steps": [
                { "action": "click", "target": "1" },
                { "action": "check", "expect": "Saved" }
            ]
        });
        let steps = planned_steps(&batch).unwrap();
        assert_eq!(steps.len(), 2);
        assert_eq!(step_action(&steps[1]), "check");
    }

    #[test]
    fn dom_diff_skips_when_the_signature_matches() {
        let snap = json!({
            "href": "https://example.com",
            "sig": "button|Save||1:",
            "elements": [{ "id": 1, "tag": "button", "name": "Save", "x": 10, "y": 20 }],
            "added": [],
            "removed": []
        });
        let (changed, text) = describe_dom(Some(&snap), &snap);
        assert!(!changed);
        assert!(text.contains("DOM unchanged"));
        assert!(text.contains("[1] button \"Save\""));
    }

    #[test]
    fn dom_diff_lists_added_controls() {
        let previous = json!({ "href": "https://example.com", "sig": "a" });
        let snap = json!({
            "href": "https://example.com",
            "sig": "b",
            "elements": [{ "id": 4, "tag": "button", "name": "Save", "x": 1, "y": 2 }],
            "added": ["button|Save||1"],
            "removed": ["a|Pricing|https://example.com/pricing|1"]
        });
        let (changed, text) = describe_dom(Some(&previous), &snap);
        assert!(changed);
        assert!(text.contains("+ button \"Save\""));
        assert!(text.contains("- a \"Pricing\""));
    }

    #[test]
    fn screenshot_follows_clicks_and_skips_devtools() {
        assert!(should_capture(&["click".into()], false, false));
        assert!(!should_capture(&["devtools".into()], true, false));
        assert!(should_capture(&["type".into()], true, false));
        assert!(!should_capture(&["type".into()], false, false));
        assert!(should_capture(&["check".into()], false, true));
    }

    #[test]
    fn check_judges_visible_text() {
        let (ok, note) = judge_check("Settings saved", "saved", "");
        assert!(ok);
        assert!(note.starts_with("PASS"));
        let (bad, note) = judge_check("Settings saved", "", "saved");
        assert!(!bad);
        assert!(note.contains("still shows"));
    }

    #[test]
    fn jpeg_key_ignores_identical_frames() {
        assert_eq!(jpeg_key("abc"), jpeg_key("abc"));
        assert_ne!(jpeg_key("abc"), jpeg_key("abd"));
    }

    #[test]
    fn wallpaper_filter_accepts_images_only() {
        assert!(is_wallpaper(std::path::Path::new("desk.PNG")));
        assert!(is_wallpaper(std::path::Path::new("paper.webp")));
        assert!(!is_wallpaper(std::path::Path::new(".gitkeep")));
        assert!(!is_wallpaper(std::path::Path::new("notes.txt")));
    }
}
