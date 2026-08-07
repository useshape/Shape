//! Plan, todos, finish, design, and MCP tools.

use serde_json::{json, Value};
use tauri::Emitter;

use crate::agent::commands::{logging, streaming};
use crate::commands::design_sandbox;
use crate::commands::preview_render;

use super::common::{
    blocked_outcome, clip, error_outcome, escape_todo_content, escape_xml_attr, escape_xml_text,
    get_str,
};
use super::{SideEffect, ToolCtx, ToolOutcome};

pub(super) async fn tool_mcp_call(name: &str, args_json: &str, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(mcp_state) = ctx.mcp_state else {
        return error_outcome(name, "MCP is not configured.");
    };
    match mcp_state.call_tool(name, args_json) {
        Ok(text) => ToolOutcome {
            tool_result: clip(&text, 12000),
            ui_chunk: format!(
                "\n<tool_result>\n[MCP {}]\n{}\n</tool_result>\n",
                name,
                escape_xml_text(&clip(&text, 2000))
            ),
            side_effect: None,
        },
        Err(e) => error_outcome(name, &e),
    }
}
pub(super) fn tool_save_plan(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if !ctx.mode.eq_ignore_ascii_case("plan") {
        return blocked_outcome("save_plan", "save_plan is only available in Plan mode.");
    }
    if ctx.project_path.is_empty() {
        return error_outcome("save_plan", "No project is open.");
    }
    let title = match get_str(args, "title") {
        Ok(s) => s,
        Err(e) => return error_outcome("save_plan", &e),
    };
    let content = match get_str(args, "content") {
        Ok(s) => s,
        Err(e) => return error_outcome("save_plan", &e),
    };
    if let Err(msg) = validate_plan_todos_section(&content) {
        return error_outcome("save_plan", &msg);
    }
    let slug = slugify_plan_title(&title);
    if slug.is_empty() {
        return error_outcome("save_plan", "title must contain at least one alphanumeric character.");
    }
    let rel_path = format!(".shape/plans/{}.md", slug);
    let abs_dir = std::path::Path::new(ctx.project_path).join(".shape/plans");
    if let Err(e) = std::fs::create_dir_all(&abs_dir) {
        return error_outcome("save_plan", &format!("Failed to create plans directory: {}", e));
    }
    let abs_path = abs_dir.join(format!("{}.md", slug));
    if let Err(e) = std::fs::write(&abs_path, &content) {
        return error_outcome("save_plan", &format!("Failed to write plan file: {}", e));
    }
    let _ = ctx.app_handle.emit("shape-plan-saved", serde_json::json!({
        "path": rel_path,
        "title": title,
        "absolutePath": abs_path.to_string_lossy(),
    }));
    let _ = ctx.app_handle.emit("shape-file-edited", &rel_path);
    ToolOutcome {
        tool_result: format!("Plan saved to {}", rel_path),
        ui_chunk: format!(
            "\n<plan_saved path=\"{}\" title=\"{}\"></plan_saved>\n",
            escape_xml_attr(&rel_path),
            escape_xml_attr(&title)
        ),
        side_effect: None,
    }
}

pub(super) fn tool_update_todos(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if ctx.mode.eq_ignore_ascii_case("ask") || ctx.mode.eq_ignore_ascii_case("plan") {
        return blocked_outcome(
            "update_todos",
            "update_todos is only available when implementing (Code/Design/Review), not in Ask or Plan mode.",
        );
    }
    let todos = match args.get("todos").and_then(|v| v.as_array()) {
        Some(arr) if !arr.is_empty() => arr,
        _ => return error_outcome("update_todos", "todos must be a non-empty array."),
    };
    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("Todos");

    let mut ui = format!("\n<todos title=\"{}\">\n", escape_xml_attr(title));
    let mut summary_parts: Vec<String> = Vec::with_capacity(todos.len());
    let mut completed = 0usize;
    let mut in_progress = 0usize;
    let mut pending = 0usize;

    for (i, item) in todos.iter().enumerate() {
        let id = item
            .get("id")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| (i + 1).to_string());
        let content = item
            .get("content")
            .and_then(|v| v.as_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty());
        let Some(content) = content else {
            return error_outcome(
                "update_todos",
                &format!("todos[{i}] is missing a non-empty content string."),
            );
        };
        let status_raw = item
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("pending")
            .trim()
            .to_ascii_lowercase();
        let status = match status_raw.as_str() {
            "completed" | "done" | "complete" => {
                completed += 1;
                "completed"
            }
            "in_progress" | "active" | "doing" => {
                in_progress += 1;
                "in_progress"
            }
            "cancelled" | "canceled" => "cancelled",
            _ => {
                pending += 1;
                "pending"
            }
        };
        ui.push_str(&format!(
            "<todo id=\"{}\" status=\"{}\">{}</todo>\n",
            escape_xml_attr(&id),
            status,
            escape_todo_content(content),
        ));
        summary_parts.push(format!("[{status}] {content}"));
    }
    ui.push_str("</todos>\n");

    if let Err(msg) = validate_update_todos_in_progress(in_progress, pending) {
        return error_outcome("update_todos", &msg);
    }

    let remaining = todos.len().saturating_sub(completed);
    ToolOutcome {
        tool_result: format!(
            "Todos updated: {remaining} remaining ({completed} completed, {in_progress} in progress).\n{}",
            summary_parts.join("\n")
        ),
        ui_chunk: ui,
        side_effect: None,
    }
}

/// Plan content must include a `## Todos` / `## Todo` section with at least one checkbox.
pub(super) fn validate_plan_todos_section(content: &str) -> Result<(), String> {
    let mut saw_todos_heading = false;
    let mut in_todos = false;
    let mut found_checkbox = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("## ") {
            let heading = trimmed[3..].trim();
            let is_todos =
                heading.eq_ignore_ascii_case("todos") || heading.eq_ignore_ascii_case("todo");
            if in_todos && !is_todos {
                break;
            }
            in_todos = is_todos;
            if is_todos {
                saw_todos_heading = true;
            }
            continue;
        }
        if in_todos && is_markdown_checkbox_line(trimmed) {
            found_checkbox = true;
            break;
        }
    }
    if !saw_todos_heading {
        return Err(
            "Plan content must include a `## Todos` section with markdown checkboxes \
             (e.g. `- [ ] Implement X`). Add that section, then call save_plan again."
                .to_string(),
        );
    }
    if !found_checkbox {
        return Err(
            "`## Todos` section must include at least one markdown checkbox line \
             (`- [ ]` or `- [x]`). Add checklist items, then call save_plan again."
                .to_string(),
        );
    }
    Ok(())
}

pub(super) fn is_markdown_checkbox_line(trimmed: &str) -> bool {
    let lower = trimmed.to_ascii_lowercase();
    lower.starts_with("- [ ]")
        || lower.starts_with("- [x]")
        || lower.starts_with("* [ ]")
        || lower.starts_with("* [x]")
}

/// While pending work remains, exactly one todo must be `in_progress`.
/// All-terminal lists (completed/cancelled only) may have zero.
pub(super) fn validate_update_todos_in_progress(in_progress: usize, pending: usize) -> Result<(), String> {
    if in_progress > 1 {
        return Err(format!(
            "Exactly one todo must be in_progress (got {in_progress}). \
             Keep a single active item; set the rest to pending, completed, or cancelled."
        ));
    }
    if in_progress == 0 && pending > 0 {
        return Err(
            "Exactly one todo must be in_progress while work remains. \
             Set one pending item to in_progress (or mark all todos completed/cancelled)."
                .to_string(),
        );
    }
    Ok(())
}

pub(super) fn slugify_plan_title(title: &str) -> String {
    let raw: String = title
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    raw.split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

pub(super) async fn tool_render_design_previews(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if !ctx.mode.eq_ignore_ascii_case("visual") && !ctx.mode.eq_ignore_ascii_case("design") {
        return blocked_outcome(
            "render_design_previews",
            "Component previews are only available in Visual mode.",
        );
    }

    let concepts = match args.get("concepts").and_then(|v| v.as_array()) {
        Some(arr) if !arr.is_empty() => arr,
        _ => {
            return error_outcome(
                "render_design_previews",
                "concepts must be a non-empty array with exactly 1 component preview.",
            );
        }
    };

    if concepts.len() > 1 {
        return error_outcome(
            "render_design_previews",
            "Only one component preview at a time. Do not send multiple concepts.",
        );
    }

    let session_id = ctx.agent_state.ensure_design_sandbox_session();
    let use_project_tokens = true;

    let mut ui = String::from(r#"<design_previews selected="">"#);
    let mut rendered = 0usize;
    let total = 1usize;
    logging::debug(
        "design_preview",
        "Rendering component preview",
    );
    streaming::emit_chat_status(
        ctx.app_handle,
        json!({
            "phase": "tool",
            "tool": "render_design_previews",
            "label": "Creating preview",
        }),
    );

    for (_idx, concept) in concepts.iter().take(1).enumerate() {
        if ctx.cancel.is_cancelled() {
            logging::debug("design_preview", "Preview rendering cancelled by user");
            break;
        }
        let id = concept
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        let name = concept
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Concept")
            .trim();
        let style = concept
            .get("style")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        let jsx = concept
            .get("jsx")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let html = concept
            .get("html")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let preview_source;
        match (jsx, html) {
            (Some(jsx), _) => {
                preview_source = design_sandbox::build_react_sandbox_html(
                    jsx,
                    if ctx.project_path.is_empty() {
                        None
                    } else {
                        Some(ctx.project_path)
                    },
                    use_project_tokens,
                );
            }
            (_, Some(html)) => {
                preview_source = preview_render::wrap_preview_html_public(
                    html,
                    if ctx.project_path.is_empty() {
                        None
                    } else {
                        Some(ctx.project_path)
                    },
                    use_project_tokens,
                );
            }
            _ => continue,
        };
        if id.is_empty() {
            continue;
        }
                        let width = concept
            .get("width")
            .and_then(|v| v.as_u64())
            .unwrap_or(640)
            .clamp(320, 1200) as u32;
        let height = concept
            .get("height")
            .and_then(|v| v.as_u64())
            .unwrap_or(360)
            .clamp(200, 640) as u32;

        // Live HTML iframes — no PNG capture. WebView2 iframe + html-to-image was
        // unreliable (asset protocol / ready timeouts). Self-contained HTML with
        // inlined scripts loads via convertFileSrc in the chat gallery.
        match design_sandbox::write_live_preview_document(&session_id, id, &preview_source) {
            Ok(html_path) => {
                rendered += 1;
                ui.push_str(&format!(
                    r#"<design_preview id="{}" name="{}" style="{}" path="{}" width="{}" height="{}" kind="html"/>"#,
                    escape_xml_attr(id),
                    escape_xml_attr(name),
                    escape_xml_attr(style),
                    escape_xml_attr(&html_path.to_string_lossy()),
                    width,
                    height,
                ));
            }
            Err(e) => {
                logging::warn(
                    "design_preview",
                    &format!("Preview failed for {id}: {e}"),
                );
            }
        }
    }

    ui.push_str("</design_previews>");

    logging::debug(
        "design_preview",
        &format!("Finished rendering {rendered}/{total} design preview(s)"),
    );

    if rendered == 0 {
        if ctx.cancel.is_cancelled() {
            return ToolOutcome {
                tool_result: "Design preview rendering was cancelled.".to_string(),
                ui_chunk: String::new(),
                side_effect: None,
            };
        }
        return error_outcome(
            "render_design_previews",
            "No previews could be rendered. Provide valid React JSX (preferred) or HTML per concept.",
        );
    }

    ToolOutcome {
        tool_result: format!(
            "Prepared a live component preview in chat (session {session_id}). Full-width card; the sandbox centers the component with padding so menus are not clipped. Call finish NOW with a short note. Do not call more tools unless the user asks for a change."
        ),
        ui_chunk: format!("\n{ui}\n"),
        side_effect: None,
    }
}


pub(super) fn tool_finish(args: &Value) -> ToolOutcome {
    let summary = args
        .get("summary")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let ui_chunk = match &summary {
        Some(s) if !s.trim().is_empty() => format!("\n{}\n", s),
        _ => String::new(),
    };
    ToolOutcome {
        tool_result: "Turn finished.".to_string(),
        ui_chunk,
        side_effect: Some(SideEffect::Finished { summary }),
    }
}

pub(super) fn design_gate_blocks_tool(name: &str, ctx: &ToolCtx<'_>) -> bool {
    if !ctx.agent_state.design_gate_blocks_writes() {
        return false;
    }
    matches!(
        name,
        "run_terminal"
            | "create_file"
            | "edit_file"
            | "apply_patch"
            | "create_directory"
            | "delete_file"
            | "rename_file"
            | "save_plan"
    )
}

#[cfg(test)]
mod tests {
    use super::{validate_plan_todos_section, validate_update_todos_in_progress};

    #[test]
    fn plan_todos_requires_heading_and_checkbox() {
        assert!(validate_plan_todos_section("# Plan\n\nNo checklist.").is_err());
        assert!(validate_plan_todos_section("## Todos\n\nJust text.").is_err());
        assert!(validate_plan_todos_section(
            "## Overview\n\n## Todos\n\n- [ ] Do the thing\n"
        )
        .is_ok());
        assert!(validate_plan_todos_section("## Todo\n\n- [x] Done already\n").is_ok());
        // Checkbox under a later section does not count.
        assert!(validate_plan_todos_section(
            "## Todos\n\nNotes only.\n\n## Steps\n\n- [ ] Ignored\n"
        )
        .is_err());
    }

    #[test]
    fn update_todos_requires_exactly_one_in_progress_while_pending() {
        assert!(validate_update_todos_in_progress(1, 2).is_ok());
        assert!(validate_update_todos_in_progress(1, 0).is_ok());
        // All terminal (no pending): zero in_progress allowed.
        assert!(validate_update_todos_in_progress(0, 0).is_ok());
        assert!(validate_update_todos_in_progress(0, 1).is_err());
        assert!(validate_update_todos_in_progress(2, 0).is_err());
        assert!(validate_update_todos_in_progress(3, 1).is_err());
    }
}

