//! Always-on memory log. One line every 10s while idle, plus agent-turn
//! snapshots. Covers this process and the WebView2 processes it owns.
//! File: `%LOCALAPPDATA%\shape\ram-debug.log` (Windows). Set
//! `SHAPE_RAM_DEBUG=0` to turn it off.

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
            .map(|v| !(v == "0" || v.eq_ignore_ascii_case("false") || v.eq_ignore_ascii_case("off")))
            .unwrap_or(true)
    })
}

/// Truncate the log once it passes this so idle sampling never fills a disk.
const MAX_LOG_BYTES: u64 = 8 * 1024 * 1024;
const IDLE_SAMPLE_SECS: u64 = 10;

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

    #[repr(C)]
    struct ProcessEntry32W {
        dw_size: u32,
        cnt_usage: u32,
        th32_process_id: u32,
        th32_default_heap_id: usize,
        th32_module_id: u32,
        cnt_threads: u32,
        th32_parent_process_id: u32,
        pc_pri_class_base: i32,
        dw_flags: u32,
        sz_exe_file: [u16; 260],
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> *mut c_void;
        fn Process32FirstW(snapshot: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn Process32NextW(snapshot: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut c_void;
        fn CloseHandle(handle: *mut c_void) -> i32;
        fn GetProcessHandleCount(process: *mut c_void, count: *mut u32) -> i32;
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetGuiResources(process: *mut c_void, flags: u32) -> u32;
    }

    const TH32CS_SNAPPROCESS: u32 = 0x2;
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const INVALID_HANDLE: *mut c_void = -1isize as *mut c_void;

    /// Handles + GDI/USER objects for this process. A GDI leak blacks out
    /// windows at 10k objects, which is what a frozen idle app looks like.
    pub fn resources_line() -> String {
        unsafe {
            let me = GetCurrentProcess();
            let mut handles = 0u32;
            GetProcessHandleCount(me, &mut handles);
            let gdi = GetGuiResources(me, 0);
            let user = GetGuiResources(me, 1);
            format!("handles={handles} gdi={gdi} user={user}")
        }
    }

    /// Working set of every descendant process (WebView2 browser, renderers,
    /// GPU, headless Chromium the agent spawned, PTY shells).
    pub fn children_line() -> String {
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE || snapshot.is_null() {
                return "children=?".into();
            }
            let mut entries: Vec<(u32, u32, String)> = Vec::new();
            let mut entry = std::mem::zeroed::<ProcessEntry32W>();
            entry.dw_size = std::mem::size_of::<ProcessEntry32W>() as u32;
            if Process32FirstW(snapshot, &mut entry) != 0 {
                loop {
                    let len = entry
                        .sz_exe_file
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.sz_exe_file.len());
                    let name = String::from_utf16_lossy(&entry.sz_exe_file[..len]);
                    entries.push((entry.th32_process_id, entry.th32_parent_process_id, name));
                    if Process32NextW(snapshot, &mut entry) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snapshot);

            let root = std::process::id();
            let mut owned = vec![root];
            let mut i = 0;
            while i < owned.len() {
                let parent = owned[i];
                for (pid, ppid, _) in &entries {
                    if *ppid == parent && !owned.contains(pid) {
                        owned.push(*pid);
                    }
                }
                i += 1;
            }

            let mut total_ws = 0u64;
            let mut total_private = 0u64;
            let mut by_name: std::collections::BTreeMap<String, (usize, u64)> =
                std::collections::BTreeMap::new();
            for pid in owned.iter().skip(1) {
                let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, *pid);
                if handle.is_null() {
                    continue;
                }
                let mut counters = std::mem::zeroed::<ProcessMemoryCountersEx>();
                counters.cb = std::mem::size_of::<ProcessMemoryCountersEx>() as u32;
                if GetProcessMemoryInfo(handle, &mut counters, counters.cb) != 0 {
                    total_ws += counters.working_set_size as u64;
                    total_private += counters.private_usage as u64;
                    let name = entries
                        .iter()
                        .find(|(p, _, _)| p == pid)
                        .map(|(_, _, n)| n.clone())
                        .unwrap_or_else(|| "?".into());
                    let slot = by_name.entry(name).or_insert((0, 0));
                    slot.0 += 1;
                    slot.1 += counters.private_usage as u64;
                }
                CloseHandle(handle);
            }
            let detail = by_name
                .iter()
                .map(|(name, (count, private))| format!("{name}x{count}={:.0}MB", mb(*private)))
                .collect::<Vec<_>>()
                .join(",");
            format!(
                "children={} children_ws_mb={:.0} children_private_mb={:.0} [{detail}]",
                owned.len() - 1,
                mb(total_ws),
                mb(total_private)
            )
        }
    }
}

#[cfg(not(windows))]
mod win {
    pub fn process_line() -> String {
        "ws=? (non-windows)".into()
    }
    pub fn resources_line() -> String {
        String::new()
    }
    pub fn children_line() -> String {
        String::new()
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
    // Append so a crash log survives the next launch; trim when it gets big.
    let too_big = std::fs::metadata(&path).map(|m| m.len() > MAX_LOG_BYTES).unwrap_or(false);
    let opened = if too_big {
        File::create(&path)
    } else {
        OpenOptions::new().create(true).append(true).open(&path)
    };
    match opened {
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
            "pid={} version={} log={}",
            std::process::id(),
            env!("CARGO_PKG_VERSION"),
            path.display()
        ),
    );
    std::thread::Builder::new()
        .name("shape-ram-sampler".into())
        .spawn(|| loop {
            std::thread::sleep(std::time::Duration::from_secs(IDLE_SAMPLE_SECS));
            snapshot("idle", &format!("{} {}", win::resources_line(), win::children_line()));
        })
        .ok();
}

fn write_line(line: &str) {
    if cfg!(debug_assertions) {
        eprintln!("{line}");
    }
    if let Ok(mut guard) = FILE.lock() {
        if let Some(file) = guard.as_mut() {
            let _ = writeln!(file, "{line}");
            let _ = file.flush();
            if file.metadata().map(|m| m.len() > MAX_LOG_BYTES).unwrap_or(false) {
                let _ = file.set_len(0);
            }
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
