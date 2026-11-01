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

async fn wait_for_page(conn: &mut PageConn, previous: &str, stop: &dyn Fn() -> bool) {
    let start = Instant::now();
    let limit = if previous.is_empty() {
        Duration::from_secs(8)
    } else {
        Duration::from_millis(3000)
    };
    while start.elapsed() < limit {
        if stop() {
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

async fn click_at(conn: &mut PageConn, x: f64, y: f64, stop: &dyn Fn() -> bool) -> Result<(), String> {
    let (px, py) = percent_to_px(x, y);
    click_px(conn, px, py, stop).await
}

async fn click_px(conn: &mut PageConn, px: f64, py: f64, stop: &dyn Fn() -> bool) -> Result<(), String> {
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

async fn capture_jpeg(conn: &mut PageConn, stop: &dyn Fn() -> bool) -> Result<String, String> {
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

async fn css_report(conn: &mut PageConn, step: &Value, stop: &dyn Fn() -> bool) -> String {
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

async fn js_report(conn: &mut PageConn, step: &Value, stop: &dyn Fn() -> bool) -> Result<String, String> {
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

async fn perf_report(conn: &mut PageConn, stop: &dyn Fn() -> bool) -> String {
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
