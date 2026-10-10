//! Optional RAM instrumentation. Off unless `SHAPE_RAM_DEBUG=1`.
//! File: `%LOCALAPPDATA%\shape\ram-debug.log` (Windows).

use serde_json::Value;
use std::collections::HashMap;
use std::fs::{create_dir_all, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

static STARTED: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
static LOG_PATH: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
static FILE: Mutex<Option<File>> = Mutex::new(None);
static SEQ: AtomicU64 = AtomicU64::new(0);
pub static WATCH_EVENTS: AtomicU64 = AtomicU64::new(0);
pub static WATCH_DIRS: AtomicU64 = AtomicU64::new(0);
pub static WATCH_PENDING: AtomicU64 = AtomicU64::new(0);

pub fn enabled() -> bool {
    static ON: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ON.get_or_init(|| {
        std::env::var("SHAPE_RAM_DEBUG")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true") || v.eq_ignore_ascii_case("yes"))
            .unwrap_or(false)
    })
}

fn elapsed_s() -> f64 {
    STARTED
        .get_or_init(Instant::now)
        .elapsed()
        .as_secs_f64()
}

fn mb(bytes: u64) -> f64 {
    bytes as f64 / (1024.0 * 1024.0)
}

#[cfg(windows)]
mod win {
    use super::mb;
    use std::ffi::c_void;

    #[repr(C)]
    struct ProcessMemoryCountersEx {
        cb: u32,
        page_fault_count: u32,
        peak_working_set_size: usize,
        working_set_size: usize,
        quota_peak_paged_pool_usage: usize,
        quota_paged_pool_usage: usize,
        quota_peak_non_paged_pool_usage: usize,
        quota_non_paged_pool_usage: usize,
        pagefile_usage: usize,
        peak_pagefile_usage: usize,
        private_usage: usize,
    }

    #[repr(C)]
    struct MemoryStatusEx {
        length: u32,
        memory_load: u32,
        total_phys: u64,
        avail_phys: u64,
        total_page_file: u64,
        avail_page_file: u64,
        total_virtual: u64,
        avail_virtual: u64,
        avail_extended_virtual: u64,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> *mut c_void;
        fn GlobalMemoryStatusEx(status: *mut MemoryStatusEx) -> i32;
    }

    #[link(name = "psapi")]
    extern "system" {
        fn GetProcessMemoryInfo(
            process: *mut c_void,
            counters: *mut ProcessMemoryCountersEx,
            cb: u32,
        ) -> i32;
    }

    pub fn process_line() -> String {
        unsafe {
            let mut counters = std::mem::zeroed::<ProcessMemoryCountersEx>();
            counters.cb = std::mem::size_of::<ProcessMemoryCountersEx>() as u32;
            let ok = GetProcessMemoryInfo(
                GetCurrentProcess(),
                &mut counters,
                counters.cb,
            );
            let mut sys = std::mem::zeroed::<MemoryStatusEx>();
            sys.length = std::mem::size_of::<MemoryStatusEx>() as u32;
            let sys_ok = GlobalMemoryStatusEx(&mut sys);
            if ok == 0 {
                return "ws=? private=?".into();
            }
            let mut line = format!(
                "ws_mb={:.1} peak_ws_mb={:.1} private_mb={:.1} pagefile_mb={:.1} peak_pagefile_mb={:.1} faults={}",
                mb(counters.working_set_size as u64),
                mb(counters.peak_working_set_size as u64),
                mb(counters.private_usage as u64),
                mb(counters.pagefile_usage as u64),
                mb(counters.peak_pagefile_usage as u64),
                counters.page_fault_count,
            );
            if sys_ok != 0 {
                line.push_str(&format!(
                    " sys_load={} sys_used_mb={:.0}/{:.0} commit_used_mb={:.0}/{:.0} virt_used_mb={:.0}/{:.0}",
                    sys.memory_load,
                    mb(sys.total_phys.saturating_sub(sys.avail_phys)),
                    mb(sys.total_phys),
                    mb(sys.total_page_file.saturating_sub(sys.avail_page_file)),
                    mb(sys.total_page_file),
                    mb(sys.total_virtual.saturating_sub(sys.avail_virtual)),
                    mb(sys.total_virtual),
                ));
            }
            line
        }
    }
}

#[cfg(not(windows))]
mod win {
    pub fn process_line() -> String {
        "ws=? (non-windows)".into()
    }
}

fn log_path() -> PathBuf {
    LOG_PATH
        .get_or_init(|| {
            let dir = dirs::data_local_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("shape");
            let _ = create_dir_all(&dir);
            dir.join("ram-debug.log")
        })
        .clone()
}

pub fn init() {
    if !enabled() {
        return;
    }
    STARTED.get_or_init(Instant::now);
    let path = log_path();
    match File::create(&path) {
        Ok(file) => {
            if let Ok(mut guard) = FILE.lock() {
                *guard = Some(file);
            }
        }
        Err(err) => eprintln!("[ram] FAILED to open log file {}: {err}", path.display()),
    }
    snapshot(
        "init",
        &format!(
            "pid={} log={}",
            std::process::id(),
            path.display()
        ),
    );
    eprintln!(
        "[ram] DETAILED RAM LOG FILE (paste this file after the agent lags):\n{}",
        path.display()
    );
}

fn write_line(line: &str) {
    eprintln!("{line}");
    if let Ok(mut guard) = FILE.lock() {
        if let Some(file) = guard.as_mut() {
            let _ = writeln!(file, "{line}");
            let _ = file.flush();
        }
    }
}

pub fn snapshot(where_: &str, extra: &str) {
    if !enabled() {
        return;
    }
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let line = format!(
        "[ram] seq={seq} t={:.1}s {mem} watch_dirs={} watch_events={} watch_pending={} | {where_} | {extra}",
        elapsed_s(),
        WATCH_DIRS.load(Ordering::Relaxed),
        WATCH_EVENTS.load(Ordering::Relaxed),
        WATCH_PENDING.load(Ordering::Relaxed),
        mem = win::process_line(),
    );
    write_line(&line);
}

pub fn tool(name: &str, id: &str, result_bytes: usize, args_preview: &str) {
    if !enabled() {
        return;
    }
    let preview: String = args_preview.chars().take(180).collect();
    snapshot(
        "tool",
        &format!(
            "name={name} id={id} result_bytes={result_bytes} result_mb={:.2} args={preview}",
            mb(result_bytes as u64)
        ),
    );
}

pub fn digest_messages(msgs: &[Value]) -> String {
    let mut by_role: HashMap<String, (usize, usize)> = HashMap::new();
    let mut biggest_len = 0usize;
    let mut biggest = String::from("-");
    let mut json_bytes = 0usize;
    for msg in msgs {
        let role = msg
            .get("role")
            .and_then(|v| v.as_str())
            .unwrap_or("?")
            .to_string();
        let name = msg.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let bytes = value_bytes(msg);
        json_bytes += bytes;
        let entry = by_role.entry(role.clone()).or_insert((0, 0));
        entry.0 += 1;
        entry.1 += bytes;
        if bytes > biggest_len {
            biggest_len = bytes;
            biggest = if name.is_empty() {
                format!("{role}:{bytes}B")
            } else {
                format!("{role}/{name}:{bytes}B")
            };
        }
    }
    let roles = by_role
        .into_iter()
        .map(|(role, (count, bytes))| format!("{role}:{count}/{bytes}B"))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "msgs={} json_bytes={json_bytes} json_mb={:.2} roles={{{roles}}} biggest={biggest}",
        msgs.len(),
        mb(json_bytes as u64)
    )
}

pub fn digest_file_cache(cache: &HashMap<String, String>) -> String {
    let total: usize = cache.values().map(|s| s.len()).sum();
    let mut sizes: Vec<(&String, usize)> = cache.iter().map(|(k, v)| (k, v.len())).collect();
    sizes.sort_by_key(|(_, n)| std::cmp::Reverse(*n));
    let top = sizes
        .iter()
        .take(8)
        .map(|(path, n)| format!("{path}={n}"))
        .collect::<Vec<_>>()
        .join("; ");
    format!(
        "file_cache_entries={} file_cache_bytes={total} file_cache_mb={:.2} top=[{top}]",
        cache.len(),
        mb(total as u64)
    )
}

fn value_bytes(value: &Value) -> usize {
    match value {
        Value::String(s) => s.len(),
        Value::Array(items) => items.iter().map(value_bytes).sum(),
        Value::Object(map) => map.values().map(value_bytes).sum(),
        other => other.to_string().len(),
    }
}

pub fn note_watch_dirs(n: usize) {
    WATCH_DIRS.store(n as u64, Ordering::Relaxed);
    snapshot("fs_watch", &format!("watching_dirs={n}"));
}

pub fn note_watch_event(pending: usize) {
    let n = WATCH_EVENTS.fetch_add(1, Ordering::Relaxed) + 1;
    WATCH_PENDING.store(pending as u64, Ordering::Relaxed);
    if n == 1 || n % 50 == 0 {
        snapshot("fs_watch_event", &format!("event_n={n} pending_paths={pending}"));
    }
}

/// Truncate the log file at process start; keep appending after that.
#[allow(dead_code)]
pub fn append_raw(line: &str) {
    write_line(line);
}

#[allow(dead_code)]
pub fn reopen_append() {
    let path = log_path();
    if let Ok(file) = OpenOptions::new().create(true).append(true).open(&path) {
        if let Ok(mut guard) = FILE.lock() {
            *guard = Some(file);
        }
    }
}
