use crate::agent::security::paths;
use crate::core::error::AppError;
use std::fs;


const LIST_DIR_MAX_ENTRIES: usize = 250;
const NOISY_DIR_NAMES: &[&str] = &[
    "node_modules",
    ".git",
    "dist",
    "build",
    "target",
    ".next",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
];

/// List files in a directory, validated against the project root.
pub fn list_files(path: &str, project_path: &str) -> Result<String, AppError> {
    let target = paths::resolve_safe_path(path, project_path)?;

    if !target.exists() {
        return Err(AppError::Message(format!("Path '{}' does not exist", path)));
    }

    if target.is_file() {
        return Ok(format!("{} is a file. Use read to see its content.", path));
    }

    let entries = fs::read_dir(&target).map_err(AppError::Io)?;
    let mut dirs: Vec<String> = Vec::new();
    let mut files: Vec<String> = Vec::new();
    for entry in entries.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.path().is_dir() {
            dirs.push(name);
        } else {
            files.push(name);
        }
    }
    dirs.sort();
    files.sort();

    let total = dirs.len() + files.len();
    let mut list = String::new();
    list.push_str(&format!("Listing: {} ({} entries)\n", path, total));
    let mut shown = 0usize;
    for name in dirs.iter().chain(files.iter()) {
        if shown >= LIST_DIR_MAX_ENTRIES {
            list.push_str(&format!(
                "… {} more (narrow the path or use search_files/grep)\n",
                total - shown
            ));
            break;
        }
        let is_dir = shown < dirs.len();
        if is_dir && is_noisy_dir(name) {
            list.push_str(&format!(
                "- {name}/  [generated — do not list; search_files/grep instead]\n"
            ));
        } else if is_dir {
            list.push_str(&format!("- {name}/\n"));
        } else {
            list.push_str(&format!("- {name}\n"));
        }
        shown += 1;
    }
    Ok(list)
}

fn is_noisy_dir(name: &str) -> bool {
    NOISY_DIR_NAMES
        .iter()
        .any(|n| name.eq_ignore_ascii_case(n))
}

/// Default window for a plain `read_file`. Larger files must be paged with
/// start_line/end_line — dumping 1000+ unnumbered lines every tool loop is
/// the main driver of 20k+ input tokens on Gemini/Claude.
pub const DEFAULT_READ_LINES: usize = 400;
/// Hard cap on a single read result (~4k tokens). Prefer paging over silent middles.
pub const MAX_READ_CHARS: usize = 16_000;

pub struct ImageRead {
    pub name: String,
    pub mime: String,
    pub data_url: String,
    pub bytes: usize,
}

/// Project images the user did not attach. None when the path is not an image.
pub fn read_image_for_model(path: &str, project_path: &str) -> Option<ImageRead> {
    let mime = image_mime(path)?;
    let target = paths::validate_read_path(path, project_path).ok()?;
    if !target.is_file() {
        return None;
    }
    let bytes = fs::read(&target).ok()?;
    if bytes.is_empty() || bytes.len() > 4_000_000 {
        return None;
    }
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "image".into());
    Some(ImageRead {
        name,
        mime: mime.to_string(),
        data_url: format!("data:{mime};base64,{b64}"),
        bytes: bytes.len(),
    })
}

fn image_mime(path: &str) -> Option<&'static str> {
    let lower = path.rsplit('.').next()?.to_ascii_lowercase();
    match lower.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

pub struct SentFile {
    pub name: String,
    pub mime: String,
    pub data_url: String,
    pub bytes: usize,
}

fn mime_for_name(name: &str) -> String {
    image_mime(name)
        .map(|m| m.to_string())
        .unwrap_or_else(|| {
            let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
            match ext.as_str() {
                "txt" | "md" | "log" => "text/plain".into(),
                "json" => "application/json".into(),
                "pdf" => "application/pdf".into(),
                "csv" => "text/csv".into(),
                "html" | "htm" => "text/html".into(),
                "js" | "mjs" | "cjs" | "ts" | "tsx" | "jsx" => "text/plain".into(),
                "zip" => "application/zip".into(),
                "mp3" => "audio/mpeg".into(),
                "wav" => "audio/wav".into(),
                "mp4" => "video/mp4".into(),
                _ => "application/octet-stream".into(),
            }
        })
}

/// Bytes of a project file, capped, for handing the user a download in chat.
pub fn read_file_for_send(path: &str, project_path: &str) -> Result<SentFile, AppError> {
    let target = paths::validate_read_path(path, project_path)?;
    if !target.is_file() {
        return Err(AppError::Message(format!("File '{path}' does not exist")));
    }
    let bytes = fs::read(&target).map_err(AppError::Io)?;
    if bytes.is_empty() {
        return Err(AppError::Message(format!("File '{path}' is empty")));
    }
    if bytes.len() > 4_000_000 {
        return Err(AppError::Message(
            "File is over 4 MB. Point the user at the path instead of sending it.".into(),
        ));
    }
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".into());
    let mime = mime_for_name(&name);
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    Ok(SentFile {
        name,
        mime: mime.clone(),
        data_url: format!("data:{mime};base64,{b64}"),
        bytes: bytes.len(),
    })
}

/// Read a file's contents, validated against the project root and sensitive file checks.
/// When no line range is given, returns at most [`DEFAULT_READ_LINES`] lines.
pub fn read_file(path: &str, project_path: &str) -> Result<String, AppError> {
    read_file_range(path, 1, DEFAULT_READ_LINES, project_path)
}

/// Read a range of lines from a file, validated against the project root.
pub fn read_file_range(
    path: &str,
    start_line: usize,
    end_line: usize,
    project_path: &str,
) -> Result<String, AppError> {
    let target = paths::validate_read_path(path, project_path)?;

    if !target.exists() {
        return Err(AppError::Message(format!("File '{}' does not exist", path)));
    }

    let content = fs::read_to_string(&target).map_err(AppError::Io)?;
    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();

    if total_lines == 0 {
        return Ok(format!("File {} is empty", path));
    }

    let start = start_line.saturating_sub(1).min(total_lines - 1);
    let end = end_line.min(total_lines);

    if start >= end {
        return Err(AppError::Message(format!(
            "Invalid range: {}-{} (total lines: {})",
            start_line, end_line, total_lines
        )));
    }

    let mut body = String::new();
    let mut last = start;
    for (i, line) in lines[start..end].iter().enumerate() {
        let n = start + i + 1;
        let numbered = format!("{n:>6}|{line}\n");
        if !body.is_empty() && body.len() + numbered.len() > MAX_READ_CHARS {
            break;
        }
        body.push_str(&numbered);
        last = n;
    }
    let mut out = format!(
        "File {} (lines {}-{} of {}):\n{}",
        path,
        start + 1,
        last,
        total_lines,
        body.trim_end()
    );
    if last < total_lines {
        out.push_str(&format!(
            "\n\n[Showing lines {}-{} of {} — call read_file with start_line/end_line for the rest]",
            start + 1,
            last,
            total_lines
        ));
    }
    Ok(out)
}

/// Create a new file, validated against the project root and sensitive file checks.
pub fn create_file(path: &str, content: &str, project_path: &str) -> Result<String, AppError> {
    let target = paths::validate_write_path(path, project_path)?;

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(AppError::Io)?;
    }

    fs::write(&target, content).map_err(AppError::Io)?;
    Ok(format!("Created file {}", path))
}

/// Write raw bytes (images, SVGs from attachments or generated URLs).
pub fn write_bytes(path: &str, bytes: &[u8], project_path: &str) -> Result<String, AppError> {
    let target = paths::validate_write_path(path, project_path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(AppError::Io)?;
    }
    fs::write(&target, bytes).map_err(AppError::Io)?;
    Ok(format!("Wrote {} ({} bytes)", path, bytes.len()))
}

/// Delete a single file. Directories cannot be deleted by the AI.
/// Validated against the project root and sensitive file checks.
pub fn delete_file(path: &str, project_path: &str) -> Result<String, AppError> {
    let target = paths::validate_delete_path(path, project_path)?;

    if !target.exists() {
        return Err(AppError::Message(format!("Path '{}' does not exist", path)));
    }

    // validate_delete_path already blocks directories, but double-check
    if target.is_dir() {
        return Err(AppError::Message(
            "The AI cannot delete directories. Only individual files can be deleted.".to_string(),
        ));
    }

    fs::remove_file(&target).map_err(AppError::Io)?;
    Ok(format!("Deleted {}", path))
}

/// Rename/move a file, validated against the project root.
pub fn rename_file(old_path: &str, new_path: &str, project_path: &str) -> Result<String, AppError> {
    let old_target = paths::validate_write_path(old_path, project_path)?;
    let new_target = paths::validate_write_path(new_path, project_path)?;

    if !old_target.exists() {
        return Err(AppError::Message(format!(
            "Path '{}' does not exist",
            old_path
        )));
    }

    if let Some(parent) = new_target.parent() {
        fs::create_dir_all(parent).map_err(AppError::Io)?;
    }

    fs::rename(&old_target, &new_target).map_err(AppError::Io)?;
    Ok(format!("Renamed {} to {}", old_path, new_path))
}

/// Create a new directory, validated against the project root.
pub fn create_dir(path: &str, project_path: &str) -> Result<String, AppError> {
    let target = paths::validate_write_path(path, project_path)?;
    fs::create_dir_all(&target).map_err(AppError::Io)?;
    Ok(format!("Created directory {}", path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_range_numbers_lines_and_pages() {
        let dir = std::env::temp_dir().join(format!("shape-read-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("sample.rs");
        let body: String = (1..=20).map(|i| format!("line{i}\n")).collect();
        std::fs::write(&file, body).unwrap();
        let out = read_file_range("sample.rs", 2, 4, dir.to_str().unwrap()).unwrap();
        assert!(out.contains("lines 2-4 of 20"));
        assert!(out.contains("     2|line2"));
        assert!(out.contains("     4|line4"));
        assert!(!out.contains("line5"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Mock model script: create / read / list real files the way an agent turn would.
    #[test]
    fn mock_agent_tool_loop_stays_on_real_files() {
        let dir = std::env::temp_dir().join(format!("shape-mock-agent-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::create_dir_all(dir.join("node_modules").join("left-pad")).unwrap();
        let root = dir.to_str().unwrap();

        let script: Vec<(&str, String)> = (0..40)
            .map(|i| {
                (
                    "create_file",
                    format!("src/mod{i}.rs"),
                )
            })
            .collect();

        for (i, (_tool, path)) in script.iter().enumerate() {
            create_file(path, &format!("pub fn n{i}() {{}}\n"), root).unwrap();
            let body = read_file(path, root).unwrap();
            assert!(body.contains(&format!("n{i}")));
            if i % 5 == 0 {
                create_dir(&format!("src/pkg{i}"), root).unwrap();
            }
        }

        let listing = list_files("src", root).unwrap();
        assert!(listing.contains("mod0.rs"));
        let noisy = list_files(".", root).unwrap();
        assert!(noisy.contains("node_modules"));
        assert!(noisy.contains("generated"));

        let cache_total: usize = (0..40)
            .map(|i| {
                read_file(&format!("src/mod{i}.rs"), root)
                    .unwrap()
                    .len()
            })
            .sum();
        assert!(
            cache_total < 512_000,
            "mock turn file reads should stay small, got {cache_total}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
