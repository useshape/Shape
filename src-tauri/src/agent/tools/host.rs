//! Local machine helpers that replace one-off shell probes.

use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use flate2::read::GzDecoder;
use rusqlite::{Connection, OpenFlags};
use sysinfo::{Disks, System};
use tar::Archive;
use zip::ZipArchive;

const OUTPUT_CAP: usize = 12_000;
const ROW_CAP: usize = 40;
const CELL_CAP: usize = 180;

pub fn sensitive_title(title: &str) -> bool {
    let lower = title.to_ascii_lowercase();
    [
        "1password",
        "bitwarden",
        "keepass",
        "keeper",
        "lastpass",
        "dashlane",
        "authenticator",
        "password",
        "keychain",
    ]
    .iter()
    .any(|word| lower.contains(word))
}

pub fn diagnostics(process_filter: &str) -> String {
    let mut sys = System::new_all();
    sys.refresh_memory();
    sys.refresh_cpu_usage();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();
    let disks = Disks::new_with_refreshed_list();
    let mut out = String::new();
    out.push_str(&format!(
        "CPU: {:.0}% across {} cores\nMemory: {} used / {} total\nSwap: {} used / {} total\nProcesses: {}\n",
        sys.global_cpu_usage(),
        sys.cpus().len(),
        mb(sys.used_memory()),
        mb(sys.total_memory()),
        mb(sys.used_swap()),
        mb(sys.total_swap()),
        sys.processes().len(),
    ));
    out.push_str("Disks:\n");
    for disk in disks.list() {
        out.push_str(&format!(
            "  {} {} free / {}\n",
            disk.mount_point().display(),
            mb(disk.available_space()),
            mb(disk.total_space()),
        ));
    }
    out.push_str("Largest processes:\n");
    let filter = process_filter.trim().to_ascii_lowercase();
    let mut rows: Vec<_> = sys.processes().values().collect();
    rows.sort_by_key(|proc| std::cmp::Reverse(proc.memory()));
    let mut shown = 0;
    for proc in rows {
        let name = proc.name().to_string_lossy();
        if !filter.is_empty() && !name.to_ascii_lowercase().contains(&filter) {
            continue;
        }
        out.push_str(&format!(
            "  {} pid {}  {:.0}% cpu  {}\n",
            name,
            proc.pid(),
            proc.cpu_usage(),
            mb(proc.memory()),
        ));
        shown += 1;
        if shown >= 12 {
            break;
        }
    }
    clip(&out)
}

pub fn profile_processes(limit: usize) -> String {
    let limit = limit.clamp(3, 20);
    let mut sys = System::new_all();
    sys.refresh_cpu_usage();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();
    let mut rows: Vec<_> = sys.processes().values().collect();
    rows.sort_by(|a, b| {
        b.cpu_usage()
            .partial_cmp(&a.cpu_usage())
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut out = format!(
        "CPU sample after {:?}. Global {:.0}%.\n",
        sysinfo::MINIMUM_CPU_UPDATE_INTERVAL,
        sys.global_cpu_usage()
    );
    for proc in rows.into_iter().take(limit) {
        if proc.cpu_usage() < 0.1 && out.lines().count() > 3 {
            continue;
        }
        out.push_str(&format!(
            "{:.0}%  pid {:<6}  {}  {}\n",
            proc.cpu_usage(),
            proc.pid(),
            mb(proc.memory()),
            proc.name().to_string_lossy(),
        ));
    }
    if sys.global_cpu_usage() < 15.0 {
        out.push_str("No CPU bottleneck right now. The busiest process is still listed above.\n");
    }
    clip(&out)
}

pub fn listening_ports() -> Result<Vec<PortRow>, String> {
    let output = if cfg!(windows) {
        run_cmd("netstat", &["-ano", "-p", "tcp"])?
    } else {
        run_cmd("ss", &["-ltnp"]).or_else(|_| run_cmd("netstat", &["-anv", "-p", "tcp"]))?
    };
    Ok(parse_listeners(&output))
}

pub fn kill_pid(pid: u32) -> Result<String, String> {
    if pid <= 4 || pid == std::process::id() {
        return Err("That process is not a development server and was not killed.".into());
    }
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]), true);
    let name = sys
        .process(sysinfo::Pid::from_u32(pid))
        .map(|proc| proc.name().to_string_lossy().to_string())
        .unwrap_or_default();
    if protected_process(&name) {
        return Err(format!(
            "Refusing to kill {name} (pid {pid}). It is a system process."
        ));
    }
    let status = if cfg!(windows) {
        std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .status()
    } else {
        std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .status()
    };
    match status {
        Ok(code) if code.success() => Ok(format!("Stopped {} pid {pid}.", display_name(&name))),
        Ok(code) => Err(format!("Could not stop pid {pid} (exit {code}).")),
        Err(err) => Err(format!("Could not stop pid {pid}: {err}")),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PortRow {
    pub port: u16,
    pub pid: u32,
    pub address: String,
}

pub fn parse_listeners(text: &str) -> Vec<PortRow> {
    let mut rows = Vec::new();
    for line in text.lines() {
        let lower = line.to_ascii_lowercase();
        if !(lower.contains("listen")) {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }
        let local = parts.iter().find(|part| part.contains(':')).copied();
        let Some(local) = local else { continue };
        let port = local.rsplit(':').next().unwrap_or("").trim_matches(|c| c == ']' || c == '[');
        let Ok(port) = port.parse::<u16>() else { continue };
        let pid = parts
            .iter()
            .rev()
            .find_map(|part| part.trim_matches(|c: char| !c.is_ascii_digit()).parse::<u32>().ok())
            .unwrap_or(0);
        if pid == 0 {
            continue;
        }
        rows.push(PortRow {
            port,
            pid,
            address: local.to_string(),
        });
    }
    rows.sort_by_key(|row| row.port);
    rows.dedup_by(|a, b| a.port == b.port && a.pid == b.pid);
    rows
}

pub fn inspect_sqlite(path: &Path, action: &str, table: &str, sql: &str, limit: usize) -> Result<String, String> {
    if !path.is_file() {
        return Err(format!("No database file at {}.", path.display()));
    }
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|err| format!("Could not open {}: {err}", path.display()))?;
    let _ = conn.execute_batch("PRAGMA query_only = ON;");
    let limit = limit.clamp(1, 100);
    let body = match action {
        "records" => {
            let table = safe_ident(table)?;
            query_sql(&conn, &format!("SELECT * FROM \"{table}\" LIMIT {limit}"))?
        }
        "query" => {
            ensure_read_only_sql(sql)?;
            query_sql(&conn, sql)?
        }
        _ => query_sql(
            &conn,
            "SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','view','index') AND name NOT LIKE 'sqlite_%' ORDER BY type, name",
        )?,
    };
    Ok(clip(&format!("{}\n{body}", path.display())))
}

pub fn local_request(
    method: &str,
    url: &str,
    body: Option<&str>,
    headers: &[(String, String)],
) -> Result<String, String> {
    let url = allow_local_url(url)?;
    let method = method.trim().to_ascii_uppercase();
    if !matches!(method.as_str(), "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD") {
        return Err("method must be GET, POST, PUT, PATCH, DELETE, or HEAD.".into());
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|err| err.to_string())?;
    let mut req = client.request(method.parse().map_err(|_| "Bad method".to_string())?, url.clone());
    for (name, value) in headers {
        if name.eq_ignore_ascii_case("host") || name.eq_ignore_ascii_case("cookie") {
            continue;
        }
        req = req.header(name, value);
    }
    if let Some(body) = body {
        if body.len() > 64_000 {
            return Err("Request body is too large.".into());
        }
        req = req.body(body.to_string());
    }
    let response = req.send().map_err(|err| format!("Request failed: {err}"))?;
    let status = response.status();
    let headers: Vec<_> = response
        .headers()
        .iter()
        .take(20)
        .map(|(k, v)| format!("{k}: {}", v.to_str().unwrap_or("")))
        .collect();
    let text = response.text().unwrap_or_default();
    Ok(clip(&format!(
        "{method} {url}\n{status}\n{}\n\n{}",
        headers.join("\n"),
        text.chars().take(8_000).collect::<String>()
    )))
}

pub fn allow_local_url(raw: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(raw).map_err(|err| format!("Bad URL: {err}"))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("Only http and https are allowed.".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("URLs with embedded credentials are not allowed.".into());
    }
    let host = url.host_str().unwrap_or("");
    if host.eq_ignore_ascii_case("localhost")
        || host == "127.0.0.1"
        || host == "::1"
        || host.eq_ignore_ascii_case("host.docker.internal")
    {
        return Ok(url);
    }
    if let Ok(ip) = host.parse::<std::net::Ipv4Addr>() {
        if ip == std::net::Ipv4Addr::new(169, 254, 169, 254) {
            return Err("That address is not a local development server.".into());
        }
        if ip.is_loopback() || ip.is_private() {
            return Ok(url);
        }
    }
    Err("http_request only calls this machine or a private-network address.".into())
}

pub fn analyze_trace_text(text: &str) -> String {
    let frames = extract_frames(text);
    let head = text
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("No exception text.");
    if frames.is_empty() {
        return clip(&format!("No stack frames found.\n{head}"));
    }
    let mut out = format!("Exception: {head}\n{} frame(s):\n", frames.len());
    for (index, frame) in frames.iter().take(16).enumerate() {
        out.push_str(&format!(
            "  {}. {}{}{}\n",
            index + 1,
            frame.function,
            if frame.path.is_empty() { "" } else { " @ " },
            frame.location()
        ));
    }
    clip(&out)
}

pub fn read_trace_source(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|err| format!("Could not read {}: {err}", path.display()))?;
    let mut buf = Vec::new();
    file.take(200_000)
        .read_to_end(&mut buf)
        .map_err(|err| err.to_string())?;
    let text = String::from_utf8_lossy(&buf);
    let tail: String = text.chars().rev().take(20_000).collect::<String>().chars().rev().collect();
    Ok(analyze_trace_text(&tail))
}

struct Frame {
    function: String,
    path: String,
    line: String,
}

impl Frame {
    fn location(&self) -> String {
        if self.path.is_empty() {
            return String::new();
        }
        if self.line.is_empty() {
            self.path.clone()
        } else {
            format!("{}:{}", self.path, self.line)
        }
    }
}

fn extract_frames(text: &str) -> Vec<Frame> {
    let mut frames = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if let Some(frame) = parse_frame(line) {
            frames.push(frame);
        }
    }
    frames
}

fn parse_frame(line: &str) -> Option<Frame> {
    let python = regex_file_line(line, "File \"", "\", line ");
    if let Some(frame) = python {
        return Some(frame);
    }
    if let Some(rest) = line.strip_prefix("at ") {
        if let Some((func, loc)) = rest.rsplit_once(" (") {
            let loc = loc.trim_end_matches(')');
            if let Some((path, line_no)) = split_path_line(loc) {
                return Some(Frame {
                    function: func.trim().to_string(),
                    path,
                    line: line_no,
                });
            }
        }
        if let Some((func, loc)) = rest.split_once(" in ") {
            let loc = loc.trim().trim_start_matches("line ");
            let (path, line_no) = loc
                .rsplit_once(':')
                .map(|(path, line)| (path.trim().to_string(), line.trim_start_matches("line ").trim().to_string()))
                .unwrap_or((loc.to_string(), String::new()));
            return Some(Frame {
                function: func.trim().to_string(),
                path,
                line: line_no,
            });
        }
    }
    if line.contains("panicked at") {
        if let Some((_, loc)) = line.split_once("panicked at ") {
            let loc = loc.trim().trim_matches('\'');
            if let Some((path, line_no)) = split_path_line(loc) {
                return Some(Frame {
                    function: "panic".into(),
                    path,
                    line: line_no,
                });
            }
        }
    }
    None
}

fn regex_file_line(line: &str, start: &str, mid: &str) -> Option<Frame> {
    let from = line.find(start)? + start.len();
    let rest = &line[from..];
    let end = rest.find(mid)?;
    let path = rest[..end].to_string();
    let after = &rest[end + mid.len()..];
    let line_no: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
    let function = after
        .split(" in ")
        .nth(1)
        .unwrap_or("")
        .trim()
        .to_string();
    if line_no.is_empty() {
        return None;
    }
    Some(Frame {
        function,
        path,
        line: line_no,
    })
}

fn split_path_line(loc: &str) -> Option<(String, String)> {
    let loc = loc.trim().trim_matches(|c| c == '(' || c == ')');
    let (path, line) = loc.rsplit_once(':')?;
    let line: String = line.chars().take_while(|c| c.is_ascii_digit()).collect();
    if line.is_empty() || path.is_empty() {
        return None;
    }
    Some((path.to_string(), line))
}

pub fn inspect_archive(path: &Path, entry: Option<&str>) -> Result<String, String> {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if name.ends_with(".zip") {
        return inspect_zip(path, entry);
    }
    if name.ends_with(".tar") || name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        return inspect_tar(path, entry, name.ends_with(".gz") || name.ends_with(".tgz"));
    }
    Err("Supported archives are .zip, .tar, .tar.gz, and .tgz.".into())
}

pub fn inspect_font(path: &Path) -> Result<String, String> {
    if path.is_dir() {
        let mut names = Vec::new();
        for item in std::fs::read_dir(path).map_err(|err| err.to_string())? {
            let item = item.map_err(|err| err.to_string())?;
            let file = item.path();
            if is_font_file(&file) {
                names.push(file.display().to_string());
            }
        }
        names.sort();
        if names.is_empty() {
            return Ok(format!("No font files in {}.", path.display()));
        }
        return Ok(clip(&format!("Fonts in {}:\n{}", path.display(), names.join("\n"))));
    }
    if !is_font_file(path) {
        return Err("Pass a .ttf, .otf, or .ttc file, or a folder of them.".into());
    }
    let bytes = std::fs::read(path).map_err(|err| err.to_string())?;
    Ok(clip(&format!("{}\n{}", path.display(), describe_font(&bytes)?)))
}

fn is_font_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.to_ascii_lowercase()),
        Some(ext) if matches!(ext.as_str(), "ttf" | "otf" | "ttc")
    )
}

pub fn describe_font(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() >= 12 && &bytes[0..4] == b"ttcf" {
        return Ok("TrueType collection. Open a single face inside it.".into());
    }
    let tables = font_tables(bytes)?;
    let name = tables
        .get(b"name".as_slice())
        .map(|(off, len)| read_name_table(bytes, *off, *len).unwrap_or_default())
        .unwrap_or_default();
    let weight = tables
        .get(b"OS/2".as_slice())
        .and_then(|(off, _)| read_u16(bytes, *off + 4))
        .map(weight_label)
        .unwrap_or_else(|| "unknown weight".into());
    let coverage = tables
        .get(b"cmap".as_slice())
        .map(|(off, len)| summarize_cmap(bytes, *off, *len))
        .unwrap_or_else(|| "cmap not readable".into());
    if name.is_empty() {
        return Err("This font has no readable name table.".into());
    }
    Ok(format!("{name}\nWeight: {weight}\nCharacters: {coverage}"))
}

pub fn resolve_user_path(project: &str, raw: &str) -> PathBuf {
    let path = Path::new(raw.trim());
    if path.is_absolute() {
        path.to_path_buf()
    } else if project.is_empty() {
        path.to_path_buf()
    } else {
        Path::new(project).join(path)
    }
}

fn inspect_zip(path: &Path, entry: Option<&str>) -> Result<String, String> {
    let file = File::open(path).map_err(|err| err.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|err| format!("Not a readable zip: {err}"))?;
    if let Some(name) = entry {
        let mut file = archive
            .by_name(name)
            .map_err(|_| format!("No entry named {name}."))?;
        if file.size() > 1_000_000 {
            return Err("That entry is too large to inline.".into());
        }
        let mut buf = String::new();
        file.read_to_string(&mut buf)
            .map_err(|_| "That entry is not text.".to_string())?;
        return Ok(clip(&buf));
    }
    let mut lines = vec![format!("{} ({} entries)", path.display(), archive.len())];
    let count = archive.len().min(200);
    for index in 0..count {
        let file = archive.by_index(index).map_err(|err| err.to_string())?;
        if file.name().contains("..") {
            continue;
        }
        lines.push(format!("{:>10}  {}", file.size(), file.name()));
    }
    if archive.len() > count {
        lines.push(format!("… {} more", archive.len() - count));
    }
    Ok(clip(&lines.join("\n")))
}

fn inspect_tar(path: &Path, entry: Option<&str>, gzip: bool) -> Result<String, String> {
    let file = File::open(path).map_err(|err| err.to_string())?;
    let reader: Box<dyn std::io::Read> = if gzip {
        Box::new(GzDecoder::new(file))
    } else {
        Box::new(file)
    };
    let mut archive = Archive::new(reader);
    let entries = archive.entries().map_err(|err| format!("Not a readable tar: {err}"))?;
    let mut lines = Vec::new();
    let mut seen = 0usize;
    for item in entries {
        let item = item.map_err(|err| err.to_string())?;
        let name = item.path().map(|p| p.display().to_string()).unwrap_or_default();
        if name.contains("..") {
            continue;
        }
        if let Some(wanted) = entry {
            if name == wanted {
                let mut buf = String::new();
                item.take(256_000)
                    .read_to_string(&mut buf)
                    .map_err(|_| "That entry is not text.".to_string())?;
                return Ok(clip(&buf));
            }
            continue;
        }
        if seen < 200 {
            lines.push(format!("{:>10}  {name}", item.size()));
        }
        seen += 1;
    }
    if entry.is_some() {
        return Err("That entry was not in the archive.".into());
    }
    if seen > lines.len() {
        lines.push(format!("… {} more", seen - lines.len()));
    }
    Ok(clip(&format!("{}\n{}", path.display(), lines.join("\n"))))
}

fn query_sql(conn: &Connection, sql: &str) -> Result<String, String> {
    let mut stmt = conn.prepare(sql).map_err(|err| err.to_string())?;
    let cols: Vec<String> = stmt.column_names().iter().map(|c| (*c).to_string()).collect();
    let mut rows = stmt.query([]).map_err(|err| err.to_string())?;
    let mut lines = vec![cols.join(" | ")];
    let mut count = 0usize;
    while let Some(row) = rows.next().map_err(|err| err.to_string())? {
        if count >= ROW_CAP {
            lines.push(format!("… stopped after {ROW_CAP} rows"));
            break;
        }
        let mut cells = Vec::new();
        for index in 0..cols.len() {
            let value = row.get_ref(index).map_err(|err| err.to_string())?;
            cells.push(cell_text(value));
        }
        lines.push(cells.join(" | "));
        count += 1;
    }
    if count == 0 {
        lines.push("(no rows)".to_string());
    }
    Ok(lines.join("\n"))
}

fn cell_text(value: rusqlite::types::ValueRef<'_>) -> String {
    let text = match value {
        rusqlite::types::ValueRef::Null => "null".into(),
        rusqlite::types::ValueRef::Integer(n) => n.to_string(),
        rusqlite::types::ValueRef::Real(n) => n.to_string(),
        rusqlite::types::ValueRef::Text(bytes) => String::from_utf8_lossy(bytes).to_string(),
        rusqlite::types::ValueRef::Blob(bytes) => format!("<blob {} bytes>", bytes.len()),
    };
    let mut text: String = text.chars().take(CELL_CAP).collect();
    text = text.replace('\n', " ");
    text
}

fn ensure_read_only_sql(sql: &str) -> Result<(), String> {
    let trimmed = sql.trim().trim_end_matches(';').trim();
    if trimmed.contains(';') {
        return Err("Only one SQL statement is allowed.".into());
    }
    let lower = trimmed.to_ascii_lowercase();
    let ok = lower.starts_with("select")
        || lower.starts_with("pragma")
        || lower.starts_with("with")
        || lower.starts_with("explain");
    if !ok || lower.contains("load_extension") || lower.contains("attach") {
        return Err("Only a read-only SELECT, PRAGMA, WITH, or EXPLAIN is allowed.".into());
    }
    Ok(())
}

fn safe_ident(name: &str) -> Result<String, String> {
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("Table names may only use letters, numbers, and underscore.".into());
    }
    Ok(name.to_string())
}

fn font_tables(bytes: &[u8]) -> Result<std::collections::HashMap<Vec<u8>, (usize, usize)>, String> {
    if bytes.len() < 12 {
        return Err("Font file is too small.".into());
    }
    let count = read_u16(bytes, 4).ok_or("Bad font header")? as usize;
    let mut tables = std::collections::HashMap::new();
    for index in 0..count {
        let at = 12 + index * 16;
        let tag = bytes.get(at..at + 4).ok_or("Bad font table")?.to_vec();
        let offset = read_u32(bytes, at + 8).ok_or("Bad font table")? as usize;
        let len = read_u32(bytes, at + 12).ok_or("Bad font table")? as usize;
        tables.insert(tag, (offset, len));
    }
    Ok(tables)
}

fn read_name_table(bytes: &[u8], offset: usize, _len: usize) -> Option<String> {
    let count = read_u16(bytes, offset + 2)? as usize;
    let string_offset = read_u16(bytes, offset + 4)? as usize;
    let mut family = String::new();
    let mut subfamily = String::new();
    for index in 0..count {
        let at = offset + 6 + index * 12;
        let name_id = read_u16(bytes, at + 6)?;
        let length = read_u16(bytes, at + 8)? as usize;
        let rel = read_u16(bytes, at + 10)? as usize;
        let start = offset + string_offset + rel;
        let raw = bytes.get(start..start + length)?;
        let text = if raw.len() >= 2 && raw[0] == 0 {
            let units: Vec<u16> = raw.chunks_exact(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
            String::from_utf16_lossy(&units)
        } else {
            String::from_utf8_lossy(raw).to_string()
        };
        let text = text.trim().to_string();
        if text.is_empty() {
            continue;
        }
        match name_id {
            16 | 1 if family.is_empty() => family = text,
            17 | 2 if subfamily.is_empty() => subfamily = text,
            _ => {}
        }
    }
    if family.is_empty() {
        return None;
    }
    if subfamily.is_empty() {
        Some(family)
    } else {
        Some(format!("{family} {subfamily}"))
    }
}

fn summarize_cmap(bytes: &[u8], offset: usize, _len: usize) -> String {
    let count = read_u16(bytes, offset + 2).unwrap_or(0) as usize;
    for index in 0..count {
        let at = offset + 4 + index * 8;
        let platform = read_u16(bytes, at).unwrap_or(0);
        let encoding = read_u16(bytes, at + 2).unwrap_or(0);
        let sub = read_u32(bytes, at + 4).unwrap_or(0) as usize;
        if platform == 3 && encoding == 1 {
            if let Some(summary) = summarize_format4(bytes, offset + sub) {
                return summary;
            }
        }
        if platform == 0 {
            if let Some(summary) = summarize_format4(bytes, offset + sub) {
                return summary;
            }
        }
    }
    "cmap present, coverage not summarized".into()
}

fn summarize_format4(bytes: &[u8], offset: usize) -> Option<String> {
    if read_u16(bytes, offset)? != 4 {
        return None;
    }
    let seg_count = (read_u16(bytes, offset + 6)? / 2) as usize;
    if seg_count == 0 || seg_count > 2000 {
        return None;
    }
    let ends_at = offset + 14;
    let starts_at = ends_at + seg_count * 2 + 2;
    let mut ranges = Vec::new();
    let mut total = 0usize;
    for index in 0..seg_count {
        let end = read_u16(bytes, ends_at + index * 2)?;
        let start = read_u16(bytes, starts_at + index * 2)?;
        if end == 0xFFFF && start == 0xFFFF {
            continue;
        }
        if end >= start {
            total += (end - start) as usize + 1;
            if ranges.len() < 8 {
                ranges.push(format!("U+{start:04X}–U+{end:04X}"));
            }
        }
    }
    Some(format!("about {total} mapped. {}", ranges.join(", ")))
}

fn weight_label(weight: u16) -> String {
    let name = match weight {
        1..=250 => "Thin",
        251..=350 => "Light",
        351..=450 => "Regular",
        451..=550 => "Medium",
        551..=650 => "Semibold",
        651..=750 => "Bold",
        751..=850 => "ExtraBold",
        _ => "Black",
    };
    format!("{weight} ({name})")
}

fn read_u16(bytes: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_be_bytes(bytes.get(offset..offset + 2)?.try_into().ok()?))
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_be_bytes(bytes.get(offset..offset + 4)?.try_into().ok()?))
}

fn protected_process(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    [
        "system",
        "registry",
        "smss.exe",
        "csrss.exe",
        "wininit.exe",
        "services.exe",
        "lsass.exe",
        "svchost.exe",
        "winlogon.exe",
        "fontdrvhost.exe",
        "dwm.exe",
        "explorer.exe",
        "sihost.exe",
        "spoolsv.exe",
        "securityhealthservice.exe",
        "launchd",
        "kernel_task",
        "systemd",
        "init",
    ]
    .iter()
    .any(|blocked| lower == *blocked)
}

fn display_name(name: &str) -> String {
    if name.is_empty() {
        "process".into()
    } else {
        name.to_string()
    }
}

fn run_cmd(program: &str, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new(program)
        .args(args)
        .output()
        .map_err(|err| format!("Could not run {program}: {err}"))?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn mb(bytes: u64) -> String {
    format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
}

fn clip(text: &str) -> String {
    if text.len() <= OUTPUT_CAP {
        return text.to_string();
    }
    let mut end = OUTPUT_CAP;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n… truncated", &text[..end])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn parses_listening_ports() {
        let text = "  TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  4242\n  TCP  [::1]:5173  [::]:0  LISTENING  99\n";
        let rows = parse_listeners(text);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].port, 3000);
        assert_eq!(rows[0].pid, 4242);
        assert_eq!(rows[1].port, 5173);
    }

    #[test]
    fn local_urls_stay_local() {
        assert!(allow_local_url("http://127.0.0.1:3000/health").is_ok());
        assert!(allow_local_url("http://localhost:8080").is_ok());
        assert!(allow_local_url("https://example.com").is_err());
        assert!(allow_local_url("http://169.254.169.254/latest").is_err());
    }

    #[test]
    fn reads_a_python_traceback() {
        let text = "Traceback (most recent call last):\n  File \"app.py\", line 12, in main\nValueError: bad";
        let frames = extract_frames(text);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].path, "app.py");
        assert_eq!(frames[0].line, "12");
        assert_eq!(frames[0].function, "main");
    }

    #[test]
    fn sqlite_schema_is_read_only() {
        let dir = std::env::temp_dir().join(format!("shape-host-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("app.db");
        {
            let conn = Connection::open(&db).unwrap();
            conn.execute_batch("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT); INSERT INTO notes (body) VALUES ('hello');")
                .unwrap();
        }
        let schema = inspect_sqlite(&db, "schema", "", "", 10).unwrap();
        assert!(schema.contains("notes"));
        let rows = inspect_sqlite(&db, "records", "notes", "", 10).unwrap();
        assert!(rows.contains("hello"));
        assert!(inspect_sqlite(&db, "query", "", "DELETE FROM notes", 10).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn lists_a_zip() {
        let dir = std::env::temp_dir().join(format!("shape-zip-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("pack.zip");
        {
            let file = File::create(&path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            zip.start_file("readme.txt", zip::write::SimpleFileOptions::default()).unwrap();
            zip.write_all(b"hi").unwrap();
            zip.finish().unwrap();
        }
        let listed = inspect_archive(&path, None).unwrap();
        assert!(listed.contains("readme.txt"));
        let body = inspect_archive(&path, Some("readme.txt")).unwrap();
        assert!(body.contains("hi"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
