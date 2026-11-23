//! Local freeze detection and a silent resource check.
//!
//! The Windows report dialog runs whenever the UI stops answering or Rust panics.
//! Sending that report waits for the person to choose Yes.
//!
//! The silent path only runs when usage telemetry is on. It reads memory figures
//! this process already sampled, and it contacts Sentry once after the figures
//! stay too high. Nothing here polls a Shape API.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::json;
use tauri::Manager;

const HEARTBEAT_STALE_MS: u64 = 20_000;
const RESOURCE_EVERY_MS: u64 = 30_000;
const RESOURCE_STRIKES: u32 = 3;
const RESOURCE_COOLDOWN_MS: u64 = 6 * 60 * 60 * 1000;
const SUPPRESS_AFTER_RELOAD_MS: u64 = 45_000;
const SUPPRESS_AFTER_WAIT_MS: u64 = 60_000;

static TELEMETRY: AtomicBool = AtomicBool::new(false);
static LAST_BEAT_MS: AtomicU64 = AtomicU64::new(0);
static SUPPRESS_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
static LAST_RESOURCE_CHECK_MS: AtomicU64 = AtomicU64::new(0);
static RESOURCE_STRIKE: AtomicU32 = AtomicU32::new(0);
static LAST_RESOURCE_REPORT_MS: AtomicU64 = AtomicU64::new(0);
static DIALOG_OPEN: AtomicBool = AtomicBool::new(false);
static DSN: Mutex<String> = Mutex::new(String::new());
static LOGS: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Usage {
    pub ws_mb: u64,
    pub private_mb: u64,
    pub gdi: u32,
    pub children_ws_mb: u64,
    pub children_gdi: u32,
}

pub fn install(app: tauri::AppHandle) {
    let _ = APP.set(app.clone());
    if let Ok(dir) = app.path().app_config_dir() {
        if let Some(enabled) = telemetry_from_settings(&dir.join("settings.json")) {
            TELEMETRY.store(enabled, Ordering::Relaxed);
        }
    }
    std::thread::Builder::new()
        .name("shape-diagnostics".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_secs(5));
            tick(&app);
        })
        .ok();
}

pub fn beat(telemetry_enabled: bool, sentry_dsn: &str) {
    TELEMETRY.store(telemetry_enabled, Ordering::Relaxed);
    LAST_BEAT_MS.store(now_ms(), Ordering::Relaxed);
    if !sentry_dsn.is_empty() {
        if let Ok(mut slot) = DSN.lock() {
            if slot.as_str() != sentry_dsn {
                *slot = sentry_dsn.to_string();
            }
        }
    }
}

pub fn note_log(source: &str, message: &str) {
    let line = format!("{source}: {}", redact(message, 300));
    if let Ok(mut logs) = LOGS.lock() {
        if logs.len() >= 60 {
            logs.pop_front();
        }
        logs.push_back(line);
    }
}

pub fn on_panic(details: &str) {
    if DIALOG_OPEN.swap(true, Ordering::SeqCst) {
        return;
    }
    let send = ask_panic_report();
    DIALOG_OPEN.store(false, Ordering::SeqCst);
    if send {
        deliver("panic", "Shape crashed", details);
    }
}

fn tick(app: &tauri::AppHandle) {
    let now = now_ms();
    if TELEMETRY.load(Ordering::Relaxed) {
        let last = LAST_RESOURCE_CHECK_MS.load(Ordering::Relaxed);
        if now.saturating_sub(last) >= RESOURCE_EVERY_MS {
            LAST_RESOURCE_CHECK_MS.store(now, Ordering::Relaxed);
            observe_resources(now);
        }
    } else {
        RESOURCE_STRIKE.store(0, Ordering::Relaxed);
    }
    consider_freeze(app, now);
}

fn observe_resources(now: u64) {
    let usage = current_usage();
    let strikes = RESOURCE_STRIKE.load(Ordering::Relaxed);
    let (next, reason) = judge_resources(true, strikes, usage);
    RESOURCE_STRIKE.store(next, Ordering::Relaxed);
    let Some(reason) = reason else {
        return;
    };
    let previous = LAST_RESOURCE_REPORT_MS.load(Ordering::Relaxed);
    if !cooled_down(previous, now) {
        return;
    }
    LAST_RESOURCE_REPORT_MS.store(now, Ordering::Relaxed);
    let body = format!("{reason}\n{}", recent_context());
    deliver("resource", reason, &body);
}

fn consider_freeze(app: &tauri::AppHandle, now: u64) {
    if now < SUPPRESS_UNTIL_MS.load(Ordering::Relaxed) {
        return;
    }
    if DIALOG_OPEN.load(Ordering::SeqCst) {
        return;
    }
    let last = LAST_BEAT_MS.load(Ordering::Relaxed);
    if last > 0 && now.saturating_sub(last) >= 5 * 60 * 1000 {
        LAST_BEAT_MS.store(now, Ordering::Relaxed);
        return;
    }
    if !heartbeat_stale(now, last, HEARTBEAT_STALE_MS) {
        return;
    }
    if !window_visible(app) {
        return;
    }
    if !DIALOG_OPEN.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
        return;
    }
    let choice = ask_freeze_report();
    match choice {
        ReportChoice::Send => {
            deliver("freeze", "Shape stopped responding", &recent_context());
            reload_main(app);
            LAST_BEAT_MS.store(now_ms(), Ordering::Relaxed);
            SUPPRESS_UNTIL_MS.store(now_ms() + SUPPRESS_AFTER_RELOAD_MS, Ordering::Relaxed);
        }
        ReportChoice::Reload => {
            reload_main(app);
            LAST_BEAT_MS.store(now_ms(), Ordering::Relaxed);
            SUPPRESS_UNTIL_MS.store(now_ms() + SUPPRESS_AFTER_RELOAD_MS, Ordering::Relaxed);
        }
        ReportChoice::Wait => {
            SUPPRESS_UNTIL_MS.store(now_ms() + SUPPRESS_AFTER_WAIT_MS, Ordering::Relaxed);
        }
    }
    DIALOG_OPEN.store(false, Ordering::SeqCst);
}

fn current_usage() -> Usage {
    let sample = crate::core::ram_debug::latest_usage();
    Usage {
        ws_mb: sample.ws_mb,
        private_mb: sample.private_mb,
        gdi: sample.gdi,
        children_ws_mb: sample.children_ws_mb,
        children_gdi: sample.children_gdi,
    }
}

pub fn judge_resources(telemetry: bool, strikes: u32, usage: Usage) -> (u32, Option<&'static str>) {
    if !telemetry {
        return (0, None);
    }
    let Some(reason) = resource_reason(usage) else {
        return (0, None);
    };
    let next = strikes.saturating_add(1);
    if next >= RESOURCE_STRIKES {
        (0, Some(reason))
    } else {
        (next, None)
    }
}

pub fn resource_reason(usage: Usage) -> Option<&'static str> {
    if usage.private_mb >= 2048 || usage.ws_mb >= 2560 {
        return Some("Shape is using too much memory");
    }
    if usage.children_ws_mb >= 3072 {
        return Some("Shape's windows are using too much memory");
    }
    if usage.gdi >= 8000 || usage.children_gdi >= 8000 {
        return Some("Shape is leaking window resources");
    }
    None
}

pub fn heartbeat_stale(now_ms: u64, last_beat_ms: u64, grace_ms: u64) -> bool {
    last_beat_ms > 0 && now_ms.saturating_sub(last_beat_ms) >= grace_ms
}

pub fn cooled_down(last_report_ms: u64, now_ms: u64) -> bool {
    last_report_ms == 0 || now_ms.saturating_sub(last_report_ms) >= RESOURCE_COOLDOWN_MS
}

pub fn redact(input: &str, max: usize) -> String {
    let mut out = String::new();
    let text = input;
    let mut i = 0;
    let bytes = text.as_bytes();
    while i < bytes.len() && out.len() < max {
        if looks_like_secret(&text[i..]) {
            out.push_str("[redacted]");
            i += secret_len(&text[i..]);
            continue;
        }
        if let Some(skip) = home_prefix(text, i) {
            out.push('~');
            i += skip;
            continue;
        }
        let ch = text[i..].chars().next().unwrap_or(' ');
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn looks_like_secret(rest: &str) -> bool {
    let lower = rest.to_ascii_lowercase();
    lower.starts_with("bearer ")
        || lower.starts_with("sk-")
        || lower.starts_with("sk_live")
        || lower.starts_with("sk_test")
}

fn secret_len(rest: &str) -> usize {
    let end = rest.find(char::is_whitespace).unwrap_or(rest.len().min(80));
    end.max(1)
}

fn home_prefix(text: &str, i: usize) -> Option<usize> {
    let rest = &text[i..];
    for prefix in ["C:\\Users\\", "c:\\Users\\", "/Users/", "/home/"] {
        if rest.starts_with(prefix) {
            let after = &rest[prefix.len()..];
            let name = after.find(['\\', '/']).unwrap_or(after.len());
            return Some(prefix.len() + name);
        }
    }
    None
}

pub fn telemetry_from_settings(path: &Path) -> Option<bool> {
    let text = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    value
        .get("settings")?
        .get("privacy")?
        .get("telemetryEnabled")?
        .as_bool()
}

pub fn envelope_endpoint(dsn: &str) -> Option<(String, String)> {
    let dsn = dsn.trim();
    let rest = dsn.strip_prefix("https://").or_else(|| dsn.strip_prefix("http://"))?;
    let (key, host_path) = rest.split_once('@')?;
    if key.is_empty() || key.contains(' ') {
        return None;
    }
    let (host, project) = host_path.split_once('/')?;
    let project = project.trim_end_matches('/');
    if host.is_empty() || project.is_empty() || project.contains('/') {
        return None;
    }
    let scheme = if dsn.starts_with("http://") { "http" } else { "https" };
    Some((format!("{scheme}://{host}/api/{project}/envelope/"), key.to_string()))
}

fn deliver(kind: &str, title: &str, details: &str) {
    let details = redact(details, 12_000);
    write_local_report(kind, title, &details);
    let dsn = std::env::var("NEXT_PUBLIC_SENTRY_DSN")
        .or_else(|_| std::env::var("SENTRY_DSN"))
        .unwrap_or_default();
    let dsn = if dsn.trim().is_empty() {
        DSN.lock().map(|slot| slot.clone()).unwrap_or_default()
    } else {
        dsn
    };
    let Some((url, key)) = envelope_endpoint(&dsn) else {
        return;
    };
    let event_id = uuid::Uuid::new_v4().simple().to_string();
    let payload = json!({
        "event_id": event_id,
        "timestamp": now_ms() / 1000,
        "platform": "native",
        "level": "error",
        "logger": "shape.desktop",
        "message": { "formatted": title },
        "tags": { "source": "desktop", "kind": kind },
        "extra": { "details": details },
        "release": format!("shape-desktop@{}", env!("CARGO_PKG_VERSION")),
    });
    let envelope = format!(
        "{}\n{{\"type\":\"event\"}}\n{}\n",
        json!({ "event_id": event_id, "dsn": dsn }).to_string(),
        payload
    );
    let header = format!("Sentry sentry_version=7, sentry_client=shape-desktop/1, sentry_key={key}");
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
    {
        Ok(client) => client,
        Err(_) => return,
    };
    let _ = client
        .post(url)
        .header("Content-Type", "application/x-sentry-envelope")
        .header("X-Sentry-Auth", header)
        .body(envelope)
        .send();
}

fn recent_context() -> String {
    let mut parts = Vec::new();
    if let Ok(logs) = LOGS.lock() {
        if !logs.is_empty() {
            parts.push(logs.iter().cloned().collect::<Vec<_>>().join("\n"));
        }
    }
    let dir = crate::core::ram_debug::shape_log_dir();
    parts.push(tail_file(&dir.join("ram-debug.log"), 4000));
    parts.push(tail_file(&dir.join("panic.log"), 4000));
    parts.retain(|part| !part.is_empty());
    parts.join("\n---\n")
}

fn tail_file(path: &Path, max: usize) -> String {
    let Ok(text) = std::fs::read_to_string(path) else {
        return String::new();
    };
    let start = text.len().saturating_sub(max);
    let start = text.ceil_char_boundary_or(start);
    text[start..].to_string()
}

trait CeilChar {
    fn ceil_char_boundary_or(&self, index: usize) -> usize;
}

impl CeilChar for str {
    fn ceil_char_boundary_or(&self, index: usize) -> usize {
        if index >= self.len() {
            return self.len();
        }
        if self.is_char_boundary(index) {
            return index;
        }
        (index + 1..self.len())
            .find(|i| self.is_char_boundary(*i))
            .unwrap_or(self.len())
    }
}

fn write_local_report(kind: &str, title: &str, details: &str) {
    let path: PathBuf = crate::core::ram_debug::shape_log_dir().join("diagnostics.log");
    let line = format!(
        "[{}] {kind} {title}\n{}\n",
        now_ms() / 1000,
        details.chars().take(4000).collect::<String>()
    );
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        use std::io::Write;
        let _ = file.write_all(line.as_bytes());
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn window_visible(app: &tauri::AppHandle) -> bool {
    use tauri::Manager;
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    window.is_visible().unwrap_or(false)
}

#[derive(Clone, Copy)]
enum ReportChoice {
    Send,
    Reload,
    Wait,
}

fn ask_freeze_report() -> ReportChoice {
    #[cfg(windows)]
    {
        return windows_choice(
            "Shape isn't responding.\n\nSend a crash report? Shape reloads either way.\n\nYes sends the report. No reloads without sending. Cancel keeps waiting.",
            true,
        );
    }
    #[cfg(not(windows))]
    ReportChoice::Wait
}

fn ask_panic_report() -> bool {
    #[cfg(windows)]
    {
        return matches!(
            windows_choice("Shape hit a crash.\n\nSend a crash report?", false),
            ReportChoice::Send
        );
    }
    #[cfg(not(windows))]
    false
}

#[cfg(windows)]
fn windows_choice(text: &str, allow_cancel: bool) -> ReportChoice {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, IDCANCEL, IDNO, IDYES, MB_ICONWARNING, MB_SETFOREGROUND, MB_SYSTEMMODAL,
        MB_TOPMOST, MB_YESNO, MB_YESNOCANCEL,
    };

    fn wide(value: &str) -> Vec<u16> {
        OsStr::new(value).encode_wide().chain(Some(0)).collect()
    }

    let flags = MB_ICONWARNING | MB_SETFOREGROUND | MB_TOPMOST | MB_SYSTEMMODAL
        | if allow_cancel { MB_YESNOCANCEL } else { MB_YESNO };
    let answer = unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            wide(text).as_ptr(),
            wide("Shape").as_ptr(),
            flags,
        )
    };
    match answer {
        IDYES => ReportChoice::Send,
        IDNO => {
            if allow_cancel {
                ReportChoice::Reload
            } else {
                ReportChoice::Wait
            }
        }
        IDCANCEL => ReportChoice::Wait,
        _ => ReportChoice::Wait,
    }
}

fn reload_main(app: &tauri::AppHandle) {
    use tauri::Manager;
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    #[cfg(windows)]
    {
        let reloaded = std::sync::Arc::new(AtomicBool::new(false));
        let flag = reloaded.clone();
        let _ = window.with_webview(move |webview| unsafe {
            if let Ok(core) = webview.controller().CoreWebView2() {
                if core.Reload().is_ok() {
                    flag.store(true, Ordering::Relaxed);
                }
            }
        });
        if reloaded.load(Ordering::Relaxed) {
            return;
        }
    }
    let _ = window.eval("window.location.reload()");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn quiet() -> Usage {
        Usage { ws_mb: 200, private_mb: 180, gdi: 40, children_ws_mb: 400, children_gdi: 80 }
    }

    #[test]
    fn telemetry_off_never_reports_resources() {
        let heavy = Usage { private_mb: 4000, ..quiet() };
        assert_eq!(judge_resources(false, 5, heavy), (0, None));
    }

    #[test]
    fn resources_need_three_high_samples() {
        let heavy = Usage { children_ws_mb: 4000, ..quiet() };
        let (strikes, reason) = judge_resources(true, 0, heavy);
        assert_eq!((strikes, reason), (1, None));
        let (strikes, reason) = judge_resources(true, strikes, heavy);
        assert_eq!((strikes, reason), (2, None));
        let (strikes, reason) = judge_resources(true, strikes, heavy);
        assert_eq!(strikes, 0);
        assert_eq!(reason, Some("Shape's windows are using too much memory"));
    }

    #[test]
    fn a_normal_sample_clears_strikes() {
        assert_eq!(judge_resources(true, 2, quiet()), (0, None));
    }

    #[test]
    fn gdi_and_private_memory_have_their_own_reasons() {
        assert_eq!(
            resource_reason(Usage { gdi: 8000, ..quiet() }),
            Some("Shape is leaking window resources")
        );
        assert_eq!(
            resource_reason(Usage { private_mb: 2048, ..quiet() }),
            Some("Shape is using too much memory")
        );
    }

    #[test]
    fn heartbeat_waits_until_the_ui_has_started() {
        assert!(!heartbeat_stale(10_000, 0, 20_000));
        assert!(!heartbeat_stale(30_000, 20_000, 20_000));
        assert!(heartbeat_stale(40_000, 20_000, 20_000));
    }

    #[test]
    fn resource_reports_cool_down_for_hours() {
        assert!(cooled_down(0, 1_000));
        assert!(!cooled_down(1_000, 1_000 + 60_000));
        assert!(cooled_down(1_000, 1_000 + RESOURCE_COOLDOWN_MS));
    }

    #[test]
    fn redact_strips_home_and_secrets() {
        let text = redact("open C:\\Users\\Ada\\proj token sk-live-secretvalue please", 200);
        assert!(!text.contains("Ada"));
        assert!(!text.contains("sk-live"));
        assert!(text.contains('~'));
        assert!(text.contains("[redacted]"));
    }

    #[test]
    fn sentry_dsn_becomes_an_envelope_url() {
        let (url, key) = envelope_endpoint("https://abc123@o1.ingest.sentry.io/42").unwrap();
        assert_eq!(url, "https://o1.ingest.sentry.io/api/42/envelope/");
        assert_eq!(key, "abc123");
        assert!(envelope_endpoint("not a dsn").is_none());
    }

    #[test]
    fn settings_file_opts_in() {
        let dir = std::env::temp_dir().join(format!("shape-diag-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        std::fs::write(
            &path,
            r#"{"settings":{"privacy":{"telemetryEnabled":true}}}"#,
        )
        .unwrap();
        assert_eq!(telemetry_from_settings(&path), Some(true));
        let _ = std::fs::remove_dir_all(dir);
    }
}
