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
