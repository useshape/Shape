use crate::agent::security::paths;
use crate::core::error::AppError;
use std::fs;


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
    let mut list = String::new();
    list.push_str(&format!("Listing: {}\n", path));
    for entry in entries.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.path().is_dir() {
            list.push_str(&format!("- {}/\n", name));
        } else {
            list.push_str(&format!("- {}\n", name));
        }
    }
    Ok(list)
}

/// Most source files fit under this, so a plain `read_file` returns the whole thing.
/// A small default made models page through files in dozens of overlapping calls,
/// which cost far more context than just handing over the file once.
pub const DEFAULT_READ_LINES: usize = 1000;

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

    let range_content = lines[start..end].join("\n");
    let mut out = format!(
        "File {} (lines {}-{} of {}):\n{}",
        path,
        start + 1,
        end,
        total_lines,
        range_content
    );
    if end < total_lines && start == 0 && end == DEFAULT_READ_LINES {
        out.push_str(&format!(
            "\n\n[Showing first {} lines — use start_line/end_line to read more]",
            DEFAULT_READ_LINES
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
