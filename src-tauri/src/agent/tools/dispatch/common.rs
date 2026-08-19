//! Shared helpers for tool dispatch.

use serde_json::Value;

use super::ToolOutcome;

pub(super) enum ApprovalDecision {
    Approved,
    Rejected,
    Cancelled,
}

pub(super) fn is_read_only_mode(mode: &str) -> bool {
    mode.eq_ignore_ascii_case("ask") || mode.eq_ignore_ascii_case("plan")
}

pub(super) fn get_str(args: &Value, key: &str) -> Result<String, String> {
    match args.get(key).and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => Ok(s.to_string()),
        Some(_) => Err(format!("Argument '{}' must be a non-empty string.", key)),
        None => Err(format!("Argument '{}' is required.", key)),
    }
}

/// Short UI copy for tool errors. Keep fenced file dumps in `tool_result` only —
/// markdown fences inside `<tool_result>` leak into the chat transcript.
fn ui_error_message(message: &str) -> String {
    let head = message
        .split("```")
        .next()
        .unwrap_or(message)
        .replace("</tool_result>", "")
        .replace("<tool_result>", "");
    let first: String = head.lines().take(3).collect::<Vec<_>>().join("\n");
    clip(first.trim(), 400)
}

pub(super) fn error_outcome(tool: &str, message: &str) -> ToolOutcome {
    let ui = format!(
        "\n<tool_result>\n[{}] ERROR: {}\n</tool_result>\n",
        tool,
        ui_error_message(message)
    );
    ToolOutcome {
        tool_result: format!("ERROR: {}", message),
        ui_chunk: ui,
        side_effect: None,
    }
}

pub(super) fn blocked_outcome(tool: &str, reason: &str) -> ToolOutcome {
    let ui = format!(
        "\n<tool_result>\n[{}] BLOCKED: {}\n</tool_result>\n",
        tool, reason
    );
    ToolOutcome {
        tool_result: format!("BLOCKED: {}", reason),
        ui_chunk: ui,
        side_effect: None,
    }
}

pub(super) fn clip(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        return text.to_string();
    }
    let trimmed: String = text.chars().take(limit).collect();
    format!("{}\n... [truncated, {} chars total]", trimmed, text.chars().count())
}

pub(super) fn escape_xml_attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

pub(super) fn escape_todo_content(s: &str) -> String {
    s.replace("</todo>", "</todo\u{200B}>")
        .replace("</todos>", "</todos\u{200B}>")
}

pub(super) fn escape_xml_text(s: &str) -> String {
    s.replace("</original>", "</original\u{200B}>")
        .replace("</replacement>", "</replacement\u{200B}>")
        .replace("</edit>", "</edit\u{200B}>")
}

pub(super) fn record_tool_event(name: &str, outcome: &ToolOutcome, project_path: &str) {
    if outcome.tool_result.starts_with("ERROR:") || outcome.tool_result.starts_with("BLOCKED:") {
        return;
    }
    let key = match name {
        "run_terminal" | "write_to_terminal" => "ai_terminal_runs",
        "edit_file" | "apply_patch" => "ai_file_edits",
        "create_file" | "create_directory" => "ai_file_creates",
        "delete_file" => "ai_file_deletes",
        "rename_file" => "ai_file_renames",
        "search_files" | "grep" | "search_codebase" | "web_search" | "visit_url" => "ai_searches",
        "read_file" | "list_dir" | "read_terminal" | "list_terminals" => "ai_reads",
        "git_commit" => "ai_git_commits",
        "git_fetch" => "ai_git_fetches",
        "git_stage" => "ai_git_stages",
        "render_design_previews" => "ai_design_previews",
        "save_plan" => "ai_plan_saves",
        "update_todos" => "ai_todo_updates",
        _ if name.starts_with("mcp_") => "ai_mcp_calls",
        _ => return,
    };
    crate::commands::stats::bump_event(project_path, key);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_outcome_ui_drops_fenced_file_dump() {
        let message = "Could not apply the edit to app/globals.css. Reason: Incomplete SEARCH/REPLACE block.\n\n\
Nearest region of the current file (40 lines around best match):\n```\n@import 'tailwindcss';\nbody{color:red}\n```\n\
Call read_file for the full content before retrying.";
        let out = error_outcome("edit_file", message);
        assert!(out.tool_result.contains("Incomplete SEARCH/REPLACE"));
        assert!(out.tool_result.contains("@import 'tailwindcss'"));
        assert!(
            !out.ui_chunk.contains("```"),
            "ui_chunk must not wrap a markdown fence: {}",
            out.ui_chunk
        );
        assert!(!out.ui_chunk.contains("@import"));
        assert!(out.ui_chunk.contains("Incomplete SEARCH/REPLACE"));
        assert!(out.ui_chunk.contains("<tool_result>"));
        assert!(out.ui_chunk.contains("</tool_result>"));
    }
}
