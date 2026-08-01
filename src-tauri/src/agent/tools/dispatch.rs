/// Tool execution entry point.
///
/// `execute_tool` takes a tool name and JSON arguments from the model, runs the right
/// underlying operation, and returns both:
///   * `tool_result` — the string content fed back to the model as a `role: "tool"`
///     message in the next request.
///   * `ui_chunk`    — an XML-style chunk emitted to the frontend renderer so the
///     existing chat UI keeps showing `<edit>` / `<status>` / `<tool_result>` blocks
///     without modification.
///
/// Side effects the chat loop needs to know about (file read, file written,
/// finish signalled) are surfaced via `ToolOutcome.side_effect` so the loop
/// can update its per-turn trackers without parsing the tool name a second time.

use reqwest::Client;
use serde_json::{json, Value};
use tauri::{Emitter, Manager};

use crate::agent::security::{self, commands::CommandSafety};
use crate::agent::models::{AgentState, PendingCommand};
use crate::core::workspace_trust::WorkspaceTrustState;
use crate::agent::commands::{checkpoints, logging, streaming, terminal::{self, classify_command, CommandExecutionMode}, history::now_f64};
use crate::agent::tools::{files, search};
use crate::commands::git;
use crate::commands::design_sandbox;
use crate::commands::preview_render;
use crate::commands::pty::PtyState;

const DESIGN_GATE_BLOCK_MSG: &str = "Design preview phase is active. Call render_design_previews with React JSX concepts first and wait for the user to pick one. Do not scaffold projects (create-next-app, npm init), run terminal commands, or edit files until a concept is selected.";

const TRUST_GATED_TOOLS: &[&str] = &[
    "run_terminal",
    "create_file",
    "edit_file",
    "delete_file",
    "rename_file",
    "create_directory",
    "write_to_terminal",
    "save_plan",
    "git_stage",
];

const WORKSPACE_UNTRUSTED_MSG: &str =
    "Workspace is not trusted. Trust this folder in Shape to allow agent shell commands and file writes.";

/// Per-call execution context. Immutable; turn-level state belongs to the chat loop.
pub struct ToolCtx<'a> {
    pub project_path: &'a str,
    pub mode: &'a str,
    pub app_handle: &'a tauri::AppHandle,
    pub agent_state: &'a AgentState,
    pub client: &'a Client,
    pub api_key: &'a str,
    pub cancel: tokio_util::sync::CancellationToken,
    pub index_state: Option<&'a crate::agent::index::IndexState>,
    pub mcp_state: Option<&'a crate::mcp::McpState>,
    pub pty_state: Option<&'a PtyState>,
    pub turn_id: Option<String>,
    pub conversation_id: Option<String>,
}

impl<'a> ToolCtx<'a> {
    pub fn emit_ui_token(&self, chunk: impl Into<String>) {
        let chunk = chunk.into();
        let _ = self.app_handle.emit(
            "chat_token",
            serde_json::json!({
                "chunk": chunk,
                "turnId": self.turn_id,
                "conversationId": self.conversation_id,
            }),
        );
    }
}

pub struct ToolOutcome {
    pub tool_result: String,
    pub ui_chunk: String,
    pub side_effect: Option<SideEffect>,
}

pub enum SideEffect {
    /// `content` is retained so the chat loop or future cache layer can keep the
    /// model's last-seen view of a file without re-reading from disk.
    FileRead {
        path: String,
        #[allow(dead_code)]
        content: String,
    },
    FileWritten {
        path: String,
        #[allow(dead_code)]
        content: String,
    },
    FileDeleted { path: String },
    Finished { summary: Option<String> },
}

pub async fn execute_tool(name: &str, args_json: &str, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if design_gate_blocks_tool(name, ctx) {
        return blocked_outcome(name, DESIGN_GATE_BLOCK_MSG);
    }

    // mcp_* tools can mutate external systems / local state; gate like writes.
    if TRUST_GATED_TOOLS.contains(&name) || name.starts_with("mcp_") {
        let trust = ctx.app_handle.state::<WorkspaceTrustState>();
        if !trust.is_trusted(ctx.project_path) {
            return blocked_outcome(name, WORKSPACE_UNTRUSTED_MSG);
        }
    }

    let args: Value = match serde_json::from_str(args_json) {
        Ok(v) => v,
        Err(e) => {
            return error_outcome(
                name,
                &format!("Could not parse tool arguments as JSON: {}. Arguments received: {}", e, args_json),
            );
        }
    };

    let outcome = match name {
        "read_file" => tool_read_file(&args, ctx),
        "list_dir" => tool_list_dir(&args, ctx),
        "search_files" => tool_search_files(&args, ctx).await,
        "grep" => tool_grep(&args, ctx).await,
        "search_codebase" => tool_search_codebase(&args, ctx).await,
        "web_search" => tool_web_search(&args, ctx).await,
        "create_directory" => tool_create_directory(&args, ctx),
        "create_file" => tool_create_file(&args, ctx),
        "edit_file" => tool_edit_file(&args, ctx).await,
        "delete_file" => tool_delete_file(&args, ctx),
        "rename_file" => tool_rename_file(&args, ctx),
        "run_terminal" => tool_run_terminal(&args, ctx).await,
        "git_status" => tool_git_status(ctx),
        "git_fetch" => tool_git_fetch(ctx),
        "git_log" => tool_git_log(&args, ctx),
        "git_stage" => tool_git_stage(&args, ctx),
        "git_commit" => tool_git_commit(&args, ctx).await,
        "list_terminals" => tool_list_terminals(ctx),
        "read_terminal" => tool_read_terminal(&args, ctx),
        "write_to_terminal" => tool_write_to_terminal(&args, ctx),
        "wait" => tool_wait(&args, ctx).await,
        "save_plan" => tool_save_plan(&args, ctx),
        "update_todos" => tool_update_todos(&args, ctx),
        "render_design_previews" => tool_render_design_previews(&args, ctx).await,
        "finish" => tool_finish(&args),
        other => {
            if other.starts_with("mcp_") {
                let mcp_out = tool_mcp_call(other, &args_json, ctx).await;
                record_tool_event(other, &mcp_out, ctx.project_path);
                return mcp_out;
            }
            error_outcome(other, &format!("Unknown tool: '{}'", other))
        }
    };
    record_tool_event(name, &outcome, ctx.project_path);
    outcome
}

fn record_tool_event(name: &str, outcome: &ToolOutcome, project_path: &str) {
    if outcome.tool_result.starts_with("ERROR:") || outcome.tool_result.starts_with("BLOCKED:") {
        return;
    }
    let key = match name {
        "run_terminal" | "write_to_terminal" => "ai_terminal_runs",
        "edit_file" => "ai_file_edits",
        "create_file" | "create_directory" => "ai_file_creates",
        "delete_file" => "ai_file_deletes",
        "rename_file" => "ai_file_renames",
        "search_files" | "grep" | "search_codebase" | "web_search" => "ai_searches",
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

// ----- individual tool handlers -------------------------------------------------------

fn tool_read_file(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let path = match get_str(args, "path") {
        Ok(s) => s,
        Err(e) => return error_outcome("read_file", &e),
    };
    let start = args.get("start_line").and_then(|v| v.as_u64()).map(|v| v as usize);
    let end = args.get("end_line").and_then(|v| v.as_u64()).map(|v| v as usize);

    let res = if let (Some(s), Some(e)) = (start, end) {
        files::read_file_range(&path, s, e, ctx.project_path)
    } else {
        files::read_file(&path, ctx.project_path)
    };

    match res {
        Ok(content) => {
            let display = if content.len() > 30_000 {
                format!(
                    "{}\n\n[truncated — file longer than 30,000 chars; call read_file again with start_line/end_line to see more]",
                    &content[..30_000]
                )
            } else {
                content.clone()
            };
            ToolOutcome {
                tool_result: display,
                ui_chunk: cat_ui_chunk(&path, start, end),
                side_effect: Some(SideEffect::FileRead { path, content }),
            }
        }
        Err(e) => error_outcome("read_file", &e.to_string()),
    }
}

fn cat_ui_chunk(path: &str, start: Option<usize>, end: Option<usize>) -> String {
    match (start, end) {
        (Some(s), Some(e)) => format!(
            "\n<cat path=\"{}\" start=\"{}\" end=\"{}\"></cat>\n",
            escape_xml_attr(path),
            s,
            e
        ),
        _ => format!("\n<cat>{}</cat>\n", path),
    }
}

fn tool_list_dir(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let path = match get_str(args, "path") {
        Ok(s) => s,
        Err(e) => return error_outcome("list_dir", &e),
    };
    match files::list_files(&path, ctx.project_path) {
        Ok(out) => ToolOutcome {
            tool_result: out,
            ui_chunk: format!("\n<ls>{}</ls>\n", path),
            side_effect: None,
        },
        Err(e) => error_outcome("list_dir", &e.to_string()),
    }
}

async fn tool_search_files(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let query = match get_str(args, "query") {
        Ok(s) => s,
        Err(e) => return error_outcome("search_files", &e),
    };
    let proj_opt = Some(ctx.project_path.to_string());
    let res = search::execute_file_search(&query, &proj_opt).await;
    let ui = format!(
        "\n<search_result query=\"{}\">\n{}\n</search_result>\n",
        escape_xml_attr(&query),
        escape_xml_text(&clip(&res, 2000))
    );
    ToolOutcome {
        tool_result: clip(&res, 12000),
        ui_chunk: ui,
        side_effect: None,
    }
}

async fn tool_grep(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let query = match get_str(args, "query") {
        Ok(s) => s,
        Err(e) => return error_outcome("grep", &e),
    };
    let proj_opt = Some(ctx.project_path.to_string());
    let res = search::execute_local_search(&query, &proj_opt).await;
    let ui = format!(
        "\n<search_result query=\"{}\">\n{}\n</search_result>\n",
        escape_xml_attr(&query),
        escape_xml_text(&clip(&res, 2000))
    );
    ToolOutcome {
        tool_result: clip(&res, 12000),
        ui_chunk: ui,
        side_effect: None,
    }
}

async fn tool_web_search(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let query = match get_str(args, "query") {
        Ok(s) => s,
        Err(e) => return error_outcome("web_search", &e),
    };
    let res = search::execute_web_search(&query, ctx.api_key).await;
    let ui = format!(
        "\n<web_result query=\"{}\">\n{}\n</web_result>\n",
        escape_xml_attr(&query),
        escape_xml_text(&clip(&res, 4000))
    );
    ToolOutcome {
        tool_result: clip(&res, 12000),
        ui_chunk: ui,
        side_effect: None,
    }
}

fn tool_create_directory(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("create_directory", "Directory creation is not allowed in Ask or Plan mode.");
    }
    let path = match get_str(args, "path") {
        Ok(s) => s,
        Err(e) => return error_outcome("create_directory", &e),
    };
    match files::create_dir(&path, ctx.project_path) {
        Ok(out) => {
            let _ = ctx.app_handle.emit("shape-file-edited", &path);
            ToolOutcome {
                tool_result: out,
                ui_chunk: format!("\n<mkdir>{}</mkdir>\n", path),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("create_directory", &e.to_string()),
    }
}

fn tool_create_file(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("create_file", "File creation is not allowed in Ask or Plan mode.");
    }
    let path = match get_str(args, "path") {
        Ok(s) => s,
        Err(e) => return error_outcome("create_file", &e),
    };
    let content = args
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    match files::create_file(&path, &content, ctx.project_path) {
        Ok(_) => {
            let _ = ctx.app_handle.emit("shape-file-edited", &path);
            record_checkpoint(ctx, &path, None);
            let mut tool_result = format!("Created file {} ({} chars)", path, content.len());
            let syntax_errors = crate::agent::editing::syntax_check::check_syntax(&path, &content);
            if let Some(feedback) =
                crate::agent::editing::syntax_check::format_syntax_feedback(&path, &syntax_errors)
            {
                tool_result.push_str(&feedback);
            }
            ToolOutcome {
                tool_result,
                ui_chunk: format!("\n<create_file>{}</create_file>\n", path),
                side_effect: Some(SideEffect::FileWritten {
                    path,
                    content,
                }),
            }
        }
        Err(e) => error_outcome("create_file", &e.to_string()),
    }
}

/// Snapshot a file's pre-edit state the first time this turn touches it, and
/// persist it immediately so a crash mid-turn does not lose the checkpoint.
fn record_checkpoint(ctx: &ToolCtx<'_>, path: &str, original_content: Option<String>) {
    let message_index = ctx.agent_state.current_turn_index();
    ctx.agent_state.record_file_checkpoint(message_index, path, original_content);
    if let Some(conv_id) = ctx.conversation_id.as_deref().filter(|s| !s.is_empty()) {
        checkpoints::save_checkpoints(conv_id, &ctx.agent_state.file_checkpoints_snapshot());
    }
}

async fn tool_edit_file(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("edit_file", "File edits are not allowed in Ask or Plan mode.");
    }
    let target = match get_str(args, "target_file") {
        Ok(s) => s,
        Err(e) => return error_outcome("edit_file", &e),
    };
    let instructions = args
        .get("instructions")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let code_edit = args
        .get("code_edit")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if code_edit.trim().is_empty() {
        return error_outcome("edit_file", "`code_edit` is required and must not be empty.");
    }

    if let Err(e) = security::paths::validate_write_path(&target, ctx.project_path) {
        return error_outcome("edit_file", &format!("Security: cannot edit '{}': {}", target, e));
    }

    let abs_path = match security::paths::resolve_safe_path(&target, ctx.project_path) {
        Ok(p) => p.to_string_lossy().into_owned(),
        Err(e) => return error_outcome("edit_file", &format!("Cannot resolve '{}': {}", target, e)),
    };

    // Read the current content for the UI preview (the renderer wants original/replacement)
    // and for the checkpoint snapshot (existence matters: a missing file means restore
    // should delete it rather than write back an empty string).
    let file_existed = tokio::fs::metadata(&abs_path).await.is_ok();
    let original_preview = if file_existed {
        tokio::fs::read_to_string(&abs_path).await.unwrap_or_default()
    } else {
        String::new()
    };

    match crate::agent::editing::apply_edit(
        abs_path.clone(),
        instructions,
        code_edit,
        ctx.app_handle.clone(),
        ctx.client,
        ctx.api_key,
    )
    .await
    {
        Ok(outcome) => {
            let _ = ctx.app_handle.emit("shape-file-edited", &abs_path);
            record_checkpoint(
                ctx,
                &target,
                if file_existed { Some(original_preview.clone()) } else { None },
            );
            let ui = format!(
                "\n<edit file=\"{}\"><original>{}</original><replacement>{}</replacement></edit>\n",
                escape_xml_attr(&target),
                escape_xml_text(&original_preview),
                escape_xml_text(&outcome.merged_content),
            );
            let mut tool_result = format!(
                "Edit applied to {} via {} strategy ({} -> {} lines).",
                target, outcome.strategy, outcome.original_lines, outcome.merged_lines
            );
            let syntax_errors =
                crate::agent::editing::syntax_check::check_syntax(&target, &outcome.merged_content);
            if let Some(feedback) =
                crate::agent::editing::syntax_check::format_syntax_feedback(&target, &syntax_errors)
            {
                tool_result.push_str(&feedback);
            }
            ToolOutcome {
                tool_result,
                ui_chunk: ui,
                side_effect: Some(SideEffect::FileWritten {
                    path: target,
                    content: outcome.merged_content,
                }),
            }
        }
        Err(e) => {
            logging::error("dispatch", &format!("edit_file failed for {}: {}", target, e));
            error_outcome("edit_file", &e.to_string())
        }
    }
}

fn tool_delete_file(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("delete_file", "File deletion is not allowed in Ask or Plan mode.");
    }
    let path = match get_str(args, "path") {
        Ok(s) => s,
        Err(e) => return error_outcome("delete_file", &e),
    };
    // Capture pre-delete content so a checkpoint restore can recreate the file.
    let original_content = security::paths::resolve_safe_path(&path, ctx.project_path)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok());
    match files::delete_file(&path, ctx.project_path) {
        Ok(out) => {
            let _ = ctx.app_handle.emit("shape-file-edited", &path);
            record_checkpoint(ctx, &path, original_content);
            ToolOutcome {
                tool_result: out,
                ui_chunk: format!("\n<delete_file>{}</delete_file>\n", path),
                side_effect: Some(SideEffect::FileDeleted { path }),
            }
        }
        Err(e) => error_outcome("delete_file", &e.to_string()),
    }
}

fn tool_rename_file(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("rename_file", "File renaming is not allowed in Ask or Plan mode.");
    }
    let old_path = match get_str(args, "old_path") {
        Ok(s) => s,
        Err(e) => return error_outcome("rename_file", &e),
    };
    let new_path = match get_str(args, "new_path") {
        Ok(s) => s,
        Err(e) => return error_outcome("rename_file", &e),
    };
    match files::rename_file(&old_path, &new_path, ctx.project_path) {
        Ok(out) => {
            let _ = ctx.app_handle.emit("shape-file-edited", &old_path);
            let _ = ctx.app_handle.emit("shape-file-edited", &new_path);
            ToolOutcome {
                tool_result: out,
                ui_chunk: format!("\n<rename_file>{} -> {}</rename_file>\n", old_path, new_path),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("rename_file", &e.to_string()),
    }
}

fn git_ui_chunk(op: &str, status: &str, body: &str) -> String {
    format!(
        "\n<git_operation op=\"{}\" status=\"{}\">{}</git_operation>\n",
        escape_xml_attr(op),
        escape_xml_attr(status),
        escape_xml_text(body)
    )
}

fn format_git_status(path: &str) -> Result<String, String> {
    let files = git::git_status(path.to_string()).map_err(|e| e.to_string())?;
    if files.is_empty() {
        return Ok("Working tree clean — no staged or unstaged changes.".to_string());
    }
    let mut lines = Vec::new();
    for f in files {
        let area = if f.staged { "staged" } else { "unstaged" };
        lines.push(format!("[{}] {} {}", area, f.status, f.path));
    }
    Ok(lines.join("\n"))
}

fn tool_git_status(ctx: &ToolCtx<'_>) -> ToolOutcome {
    match format_git_status(ctx.project_path) {
        Ok(out) => ToolOutcome {
            tool_result: out.clone(),
            ui_chunk: git_ui_chunk("status", "completed", &out),
            side_effect: None,
        },
        Err(e) => error_outcome("git_status", &e),
    }
}

fn tool_git_fetch(ctx: &ToolCtx<'_>) -> ToolOutcome {
    let _ = ctx.emit_ui_token(git_ui_chunk("fetch", "running", "Fetching from remotes…"));
    match git::git_fetch(ctx.project_path.to_string()) {
        Ok(()) => {
            let msg = "Fetched from all remotes.";
            ToolOutcome {
                tool_result: msg.to_string(),
                ui_chunk: git_ui_chunk("fetch", "completed", msg),
                side_effect: None,
            }
        }
        Err(e) => {
            let msg = e.to_string();
            ToolOutcome {
                tool_result: format!("git fetch failed: {}", msg),
                ui_chunk: git_ui_chunk("fetch", "error", &msg),
                side_effect: None,
            }
        }
    }
}

fn tool_git_log(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|v| v.min(50) as usize)
        .unwrap_or(10);
    match git::git_log(ctx.project_path.to_string(), Some(limit)) {
        Ok(entries) => {
            let out = if entries.is_empty() {
                "No commits found.".to_string()
            } else {
                entries
                    .iter()
                    .map(|e| {
                        let short = e.hash.chars().take(7).collect::<String>();
                        let subject = e.message.lines().next().unwrap_or("").trim();
                        format!("{} {} — {} ({})", short, e.date, subject, e.author)
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            ToolOutcome {
                tool_result: out.clone(),
                ui_chunk: git_ui_chunk("log", "completed", &out),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("git_log", &e.to_string()),
    }
}

fn tool_git_stage(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("git_stage", "Staging files is not allowed in Ask or Plan mode.");
    }
    let path = match get_str(args, "path") {
        Ok(s) => s,
        Err(e) => return error_outcome("git_stage", &e),
    };
    match git::git_stage(ctx.project_path.to_string(), path.clone()) {
        Ok(()) => {
            let msg = format!("Staged {}", path);
            ToolOutcome {
                tool_result: msg.clone(),
                ui_chunk: git_ui_chunk("stage", "completed", &msg),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("git_stage", &e.to_string()),
    }
}

async fn tool_git_commit(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("git_commit", "Committing is not allowed in Ask or Plan mode.");
    }
    let message = match get_str(args, "message") {
        Ok(s) => s,
        Err(e) => return error_outcome("git_commit", &e),
    };
    if message.trim().is_empty() {
        return error_outcome("git_commit", "Commit message cannot be empty.");
    }
    let command = format!(
        "git commit -m {}",
        serde_json::to_string(&message).unwrap_or_else(|_| format!("\"{}\"", message))
    );
    run_with_approval(
        &command,
        "Creates a git commit with your currently staged changes.",
        ctx,
    )
    .await
}

async fn tool_run_terminal(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("run_terminal", "Running terminal commands is not allowed in Ask or Plan mode.");
    }
    let command = match get_str(args, "command") {
        Ok(s) => s,
        Err(e) => return error_outcome("run_terminal", &e),
    };
    let background = args
        .get("background")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // Models sometimes try `cat file` / `dir folder` via the terminal even though
    // dedicated tools exist. Running a shell for simple file inspection wastes loops,
    // bypasses read tracking, and on Windows may prompt/format unexpectedly. Translate
    // those commands into the proper tools instead of executing them.
    if let Some(outcome) = intercept_file_inspection_command(&command, ctx) {
        return outcome;
    }

    if let Some(outcome) = intercept_file_mutation_command(&command) {
        return outcome;
    }

    let safety = security::commands::check_command_safety(&command);
    match safety {
        CommandSafety::Blocked { reason } => {
            logging::warn("dispatch", &format!("Command blocked: {}", reason));
            ToolOutcome {
                tool_result: format!("BLOCKED: Command '{}' was blocked by security: {}", command, reason),
                ui_chunk: format!(
                    "\n<terminal_command status=\"blocked\">{}\nBlocked: {}</terminal_command>\n",
                    command, reason
                ),
                side_effect: None,
            }
        }
        CommandSafety::Safe => {
            let use_background = background
                || matches!(classify_command(&command), CommandExecutionMode::LongRunning);
            let output = if use_background && ctx.pty_state.is_some() {
                terminal::execute_long_running_in_pty(
                    &command,
                    ctx.project_path,
                    ctx.app_handle,
                    ctx.pty_state.unwrap(),
                    ctx.agent_state,
                )
                .await
            } else {
                terminal::execute_terminal_command(
                    &command,
                    ctx.project_path,
                    Some(ctx.app_handle),
                    Some(ctx.cancel.clone()),
                    Some(ctx.agent_state),
                )
                .await
            };
            let status = if use_background && ctx.pty_state.is_some() {
                "background"
            } else {
                "completed"
            };
            ToolOutcome {
                tool_result: format!("Command: {}\nOutput:\n{}", command, clip(&output, 10000)),
                ui_chunk: format!(
                    "\n<terminal_command status=\"{}\">{}\n{}\n</terminal_command>\n",
                    status,
                    command,
                    escape_xml_text(&clip(&output, 2000))
                ),
                side_effect: None,
            }
        }
        CommandSafety::NeedsApproval { reason } => {
            run_with_approval(&command, &reason, ctx).await
        }
    }
}

fn intercept_file_mutation_command(command: &str) -> Option<ToolOutcome> {
    let cmd_lower = command.trim().to_lowercase();
    if cmd_lower.is_empty() {
        return None;
    }

    let blocked_reason = if cmd_lower.starts_with("python -c")
        || cmd_lower.starts_with("python3 -c")
        || cmd_lower.contains("powershell -command")
        || cmd_lower.contains("powershell -enc")
        || cmd_lower.contains("pwsh -command")
    {
        Some("Shell one-liners cannot edit files. Use `edit_file` instead.")
    } else if cmd_lower.contains("set-content")
        || cmd_lower.contains("out-file")
        || cmd_lower.contains("add-content")
        || cmd_lower.contains("get-content")
            && cmd_lower.contains("-replace")
        || cmd_lower.contains(" open(")
            && (cmd_lower.contains(".write(") || cmd_lower.contains(".writelines("))
    {
        Some("Writing files through the shell is blocked. Use `edit_file` instead.")
    } else if cmd_lower.contains(" > ")
        || cmd_lower.contains(" >> ")
        || cmd_lower.starts_with("sed -i")
        || cmd_lower.contains("sed -i")
    {
        Some("Redirecting shell output to files is blocked. Use `edit_file` instead.")
    } else {
        None
    };

    blocked_reason.map(|reason| ToolOutcome {
        tool_result: format!("BLOCKED: {} Command: {}", reason, command),
        ui_chunk: format!(
            "\n<terminal_command status=\"blocked\">{}\nBlocked: {}</terminal_command>\n",
            command, reason
        ),
        side_effect: None,
    })
}

fn intercept_file_inspection_command(command: &str, ctx: &ToolCtx<'_>) -> Option<ToolOutcome> {
    let trimmed = command.trim();
    if trimmed.contains('|') || trimmed.contains("&&") || trimmed.contains(';') {
        return None;
    }

    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    match parts.as_slice() {
        ["cat", path] | ["type", path] => {
            let args = serde_json::json!({ "path": *path });
            Some(tool_read_file(&args, ctx))
        }
        ["cat", ..] | ["type", ..] => {
            Some(error_outcome("run_terminal", "Using `cat` or `type` with globs/multiple files is not supported. Use `read_file` or `grep`."))
        }
        ["head", path] => {
            let args = serde_json::json!({ "path": *path, "start_line": 1, "end_line": 80 });
            Some(tool_read_file(&args, ctx))
        }
        ["tail", path] => {
            let res = files::read_file(path, ctx.project_path);
            Some(match res {
                Ok(content) => {
                    let tail = content
                        .lines()
                        .rev()
                        .take(80)
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect::<Vec<_>>()
                        .join("\n");
                    ToolOutcome {
                        tool_result: tail.clone(),
                        ui_chunk: cat_ui_chunk(path, None, None),
                        side_effect: Some(SideEffect::FileRead {
                            path: (*path).to_string(),
                            content,
                        }),
                    }
                }
                Err(e) => error_outcome("run_terminal", &e.to_string()),
            })
        }
        ["ls"] | ["dir"] => {
            let args = serde_json::json!({ "path": "." });
            Some(tool_list_dir(&args, ctx))
        }
        ["ls", path] | ["dir", path] => {
            if path.starts_with('-') || path.contains('/') && path.starts_with('-') {
                return Some(error_outcome("run_terminal", "Using `ls` or `dir` with flags (like -R or /s) is not supported. Use `list_dir` or `grep`."));
            }
            let args = serde_json::json!({ "path": *path });
            Some(tool_list_dir(&args, ctx))
        }
        ["ls", ..] | ["dir", ..] => {
            Some(error_outcome("run_terminal", "Using `ls` or `dir` with multiple arguments is not supported. Use `list_dir` or `grep`."))
        }
        ["find", ..] => {
            Some(error_outcome("run_terminal", "Using `find` is not supported. Use `list_dir` or `grep` instead."))
        }
        _ => {
            // Also catch things like `ls -R path` where `ls` is the first part
            if parts[0] == "ls" || parts[0] == "dir" || parts[0] == "find" || parts[0] == "cat" || parts[0] == "type" {
                return Some(error_outcome("run_terminal", &format!("Using `{}` via the terminal is blocked to prevent looping and formatting issues. Use native tools (`list_dir`, `read_file`, `grep`) instead.", parts[0])));
            }
            None
        }
    }
}

async fn run_with_approval(command: &str, reason: &str, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let cmd_id = format!("cmd-{}", now_f64() as u64);
    let pending = PendingCommand {
        id: cmd_id.clone(),
        command: command.to_string(),
        safety: "needs_approval".to_string(),
        reason: reason.to_string(),
    };

    if let Ok(mut pendings) = ctx.agent_state.pending_commands.lock() {
        pendings.insert(cmd_id.clone(), pending.clone());
    }

    let _ = ctx.emit_ui_token(format!(
        "\n<terminal_command status=\"pending\" id=\"{}\">{}\nAwaiting approval: {}</terminal_command>\n",
        cmd_id, command, reason
    ));
    let _ = ctx.app_handle.emit("agent-command-pending", pending);

    let approval_timeout = std::time::Duration::from_secs(120);
    let start = std::time::Instant::now();
    let mut approved = false;
    let mut result_output = String::new();

    loop {
        if start.elapsed() > approval_timeout || ctx.cancel.is_cancelled() {
            break;
        }
        if let Ok(results) = ctx.agent_state.command_results.lock() {
            if let Some(output) = results.get(&cmd_id) {
                result_output = output.clone();
                approved = true;
                break;
            }
        }
        if let Ok(pendings) = ctx.agent_state.pending_commands.lock() {
            if !pendings.contains_key(&cmd_id) {
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    if let Ok(mut pendings) = ctx.agent_state.pending_commands.lock() {
        pendings.remove(&cmd_id);
    }
    if let Ok(mut results) = ctx.agent_state.command_results.lock() {
        results.remove(&cmd_id);
    }

    if approved {
        ToolOutcome {
            tool_result: format!("Command: {} (approved by user)\nOutput:\n{}", command, clip(&result_output, 10000)),
            ui_chunk: format!(
                "\n<terminal_command status=\"completed\" id=\"{}\">{}\n</terminal_command>\n",
                cmd_id, command
            ),
            side_effect: None,
        }
    } else {
        ToolOutcome {
            tool_result: format!(
                "Command '{}' was rejected by the user (or timed out). Do NOT retry it or attempt an equivalent command. Continue the task without it, or ask the user how to proceed.",
                command
            ),
            ui_chunk: format!(
                "\n<terminal_command status=\"rejected\" id=\"{}\">{}\n</terminal_command>\n",
                cmd_id, command
            ),
            side_effect: None,
        }
    }
}

async fn tool_search_codebase(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let query = match get_str(args, "query") {
        Ok(s) => s,
        Err(e) => return error_outcome("search_codebase", &e),
    };
    let top_k = args
        .get("top_k")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .unwrap_or(8)
        .min(20);

    let Some(index_state) = ctx.index_state else {
        return error_outcome(
            "search_codebase",
            "Codebase index is not available. Use grep or search_files instead.",
        );
    };

    // Hybrid search does blocking work: index load from disk, a ripgrep subprocess,
    // and (when signed in) a *blocking* HTTP call for remote embeddings. Running that
    // directly on a tokio worker panics ("Cannot drop a runtime in a context where
    // blocking is not allowed") and kills the whole agent turn, so it must run on the
    // blocking pool. spawn_blocking also converts any panic into a catchable error
    // instead of unwinding the turn.
    let index_state_owned = index_state.clone();
    let project_path = ctx.project_path.to_string();
    let query_owned = query.clone();
    let embeddings_enabled = index_state.embeddings_enabled();
    let search_result = tokio::task::spawn_blocking(move || {
        index_state_owned.hybrid_search(
            &project_path,
            &query_owned,
            crate::agent::index::HybridOptions {
                top_k,
                n_retrieve: 50,
                embeddings_enabled,
                boost_paths: vec![],
            },
        )
    })
    .await
    .unwrap_or_else(|join_err| {
        logging::error(
            "dispatch",
            &format!("search_codebase task panicked: {}", join_err),
        );
        Err("Codebase search failed internally. Use grep or search_files instead.".to_string())
    });

    match search_result {
        Ok(hits) if hits.is_empty() => ToolOutcome {
            tool_result: "No results found. Try grep with a more specific term.".to_string(),
            ui_chunk: format!("\n<search_result query=\"{}\">No results</search_result>\n", escape_xml_attr(&query)),
            side_effect: None,
        },
        Ok(hits) => {
            let mut result = String::new();
            for hit in &hits {
                result.push_str(&format!(
                    "{}:{}-{} (score {:.2})\n{}\n---\n",
                    hit.file, hit.start_line, hit.end_line, hit.score, hit.excerpt
                ));
            }
            let ui = format!(
                "\n<search_result query=\"{}\">\n{}\n</search_result>\n",
                escape_xml_attr(&query),
                escape_xml_text(&clip(&result, 3000))
            );
            ToolOutcome {
                tool_result: clip(&result, 4000),
                ui_chunk: ui,
                side_effect: None,
            }
        }
        Err(e) => error_outcome("search_codebase", &e),
    }
}

async fn tool_mcp_call(name: &str, args_json: &str, ctx: &ToolCtx<'_>) -> ToolOutcome {
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

fn tool_list_terminals(ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(pty_state) = ctx.pty_state else {
        return error_outcome("list_terminals", "Terminal state is not available.");
    };
    let snapshots = pty_state.list_session_snapshots();
    if snapshots.is_empty() {
        return ToolOutcome {
            tool_result: "No active terminal sessions.".to_string(),
            ui_chunk: "\n<list_terminals>No active sessions</list_terminals>\n".to_string(),
            side_effect: None,
        };
    }
    let listing: Vec<String> = snapshots
        .iter()
        .map(|s| {
            format!(
                "session_id: {} | running: {} | command: {}",
                s.session_id,
                s.running,
                s.command.as_deref().unwrap_or("(unknown)")
            )
        })
        .collect();
    let result = listing.join("\n");
    ToolOutcome {
        tool_result: format!(
            "{}\n\nUse read_terminal with a session_id to inspect output.",
            result
        ),
        ui_chunk: format!("\n<list_terminals>\n{}\n</list_terminals>\n", result),
        side_effect: None,
    }
}

fn tool_read_terminal(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let session_id = match args.get("session_id").and_then(|v| v.as_u64()) {
        Some(id) => id as u32,
        None => return error_outcome("read_terminal", "session_id is required."),
    };
    let tail_chars = args
        .get("tail_chars")
        .and_then(|v| v.as_u64())
        .unwrap_or(8000) as usize;
    let Some(pty_state) = ctx.pty_state else {
        return error_outcome("read_terminal", "Terminal state is not available.");
    };

    match pty_state.read_session_output(session_id, tail_chars) {
        Ok(snapshot) => {
            let status = if snapshot.running {
                "still running"
            } else {
                "finished"
            };
            let header = format!(
                "Terminal session {} ({}) — {} chars captured",
                snapshot.session_id, status, snapshot.output_chars
            );
            let command_line = snapshot
                .command
                .map(|c| format!("Command: {}", c))
                .unwrap_or_default();
            let body = if snapshot.output.is_empty() {
                "(no output yet)".to_string()
            } else {
                snapshot.output.clone()
            };
            let tool_result = format!(
                "{}\n{}\n\n{}",
                header,
                command_line,
                clip(&body, 12_000)
            );
            ToolOutcome {
                tool_result: tool_result.clone(),
                ui_chunk: format!(
                    "\n<terminal_read session=\"{}\" running=\"{}\">\n{}\n</terminal_read>\n",
                    snapshot.session_id,
                    snapshot.running,
                    escape_xml_text(&clip(&tool_result, 3000))
                ),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("read_terminal", &e.to_string()),
    }
}

async fn tool_wait(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let seconds = args
        .get("seconds")
        .and_then(|v| v.as_u64())
        .unwrap_or(10)
        .clamp(1, 180);
    let reason = args
        .get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("Waiting before checking command progress");

    let total = std::time::Duration::from_secs(seconds);
    let step = std::time::Duration::from_millis(250);
    let mut remaining = total;
    while remaining > std::time::Duration::ZERO {
        if ctx.cancel.is_cancelled() {
            return ToolOutcome {
                tool_result: "Wait cancelled.".to_string(),
                ui_chunk: "\n<status>Wait cancelled</status>\n".to_string(),
                side_effect: None,
            };
        }
        let sleep_for = remaining.min(step);
        tokio::time::sleep(sleep_for).await;
        remaining = remaining.saturating_sub(sleep_for);
    }

    ToolOutcome {
        tool_result: format!(
            "Waited {} seconds. {} — use read_terminal or list_terminals to check progress.",
            seconds, reason
        ),
        ui_chunk: format!(
            "\n<status>Waited {}s — {}</status>\n",
            seconds,
            escape_xml_text(reason)
        ),
        side_effect: None,
    }
}

fn tool_write_to_terminal(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if is_read_only_mode(ctx.mode) {
        return blocked_outcome("write_to_terminal", "Writing to terminal is not allowed in Ask or Plan mode.");
    }
    let session_id = match args.get("session_id").and_then(|v| v.as_u64()) {
        Some(id) => id as u32,
        None => return error_outcome("write_to_terminal", "session_id is required."),
    };
    let input = match get_str(args, "input") {
        Ok(s) => s,
        Err(e) => return error_outcome("write_to_terminal", &e),
    };
    let Some(pty_state) = ctx.pty_state else {
        return error_outcome("write_to_terminal", "Terminal state is not available.");
    };

    // Never write into interactive user terminals — only agent-owned sessions
    // (those with a recorded command from agent terminal tools).
    let snapshot = match pty_state.read_session_output(session_id, 500) {
        Ok(s) => s,
        Err(e) => return error_outcome("write_to_terminal", &e.to_string()),
    };
    if snapshot.command.is_none() {
        return blocked_outcome(
            "write_to_terminal",
            "Refusing to write to an interactive user terminal. Use run_terminal_command for agent shells.",
        );
    }

    match pty_state.write_to_session(session_id, &input) {
        Ok(()) => ToolOutcome {
            tool_result: format!("Sent {} bytes to terminal session {}.", input.len(), session_id),
            ui_chunk: format!(
                "\n<terminal_input session=\"{}\">{}</terminal_input>\n",
                session_id,
                escape_xml_text(&clip(&input, 200))
            ),
            side_effect: None,
        },
        Err(e) => error_outcome("write_to_terminal", &e.to_string()),
    }
}

fn tool_save_plan(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
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

fn tool_update_todos(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
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
fn validate_plan_todos_section(content: &str) -> Result<(), String> {
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

fn is_markdown_checkbox_line(trimmed: &str) -> bool {
    let lower = trimmed.to_ascii_lowercase();
    lower.starts_with("- [ ]")
        || lower.starts_with("- [x]")
        || lower.starts_with("* [ ]")
        || lower.starts_with("* [x]")
}

/// While pending work remains, exactly one todo must be `in_progress`.
/// All-terminal lists (completed/cancelled only) may have zero.
fn validate_update_todos_in_progress(in_progress: usize, pending: usize) -> Result<(), String> {
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

fn slugify_plan_title(title: &str) -> String {
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

fn is_read_only_mode(mode: &str) -> bool {
    mode.eq_ignore_ascii_case("ask") || mode.eq_ignore_ascii_case("plan")
}

fn tool_finish(args: &Value) -> ToolOutcome {
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

// ----- small helpers ------------------------------------------------------------------

fn get_str(args: &Value, key: &str) -> Result<String, String> {
    match args.get(key).and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => Ok(s.to_string()),
        Some(_) => Err(format!("Argument '{}' must be a non-empty string.", key)),
        None => Err(format!("Argument '{}' is required.", key)),
    }
}

async fn tool_render_design_previews(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
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
            .clamp(280, 1200) as u32;
        let height = concept
            .get("height")
            .and_then(|v| v.as_u64())
            .unwrap_or(360)
            .clamp(160, 800) as u32;

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
            "Prepared a live component preview in chat (session {session_id}). It stays in the chat canvas — interactive. Ask in plain language whether to add it to the project, or wait for the user to say go ahead / build it / change something. Do not invent a selection UI. When implementing, match the project's existing UI library (shadcn/Radix/etc.); if the project has no UI stack yet, use Radix primitives + Tailwind."
        ),
        ui_chunk: format!("\n{ui}\n"),
        side_effect: None,
    }
}

fn design_gate_blocks_tool(name: &str, ctx: &ToolCtx<'_>) -> bool {
    if !ctx.agent_state.design_gate_blocks_writes() {
        return false;
    }
    matches!(
        name,
        "run_terminal"
            | "create_file"
            | "edit_file"
            | "create_directory"
            | "delete_file"
            | "rename_file"
            | "save_plan"
    )
}

fn error_outcome(tool: &str, message: &str) -> ToolOutcome {
    let ui = format!(
        "\n<tool_result>\n[{}] ERROR: {}\n</tool_result>\n",
        tool, message
    );
    ToolOutcome {
        tool_result: format!("ERROR: {}", message),
        ui_chunk: ui,
        side_effect: None,
    }
}

fn blocked_outcome(tool: &str, reason: &str) -> ToolOutcome {
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

fn clip(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        return text.to_string();
    }
    let trimmed: String = text.chars().take(limit).collect();
    format!("{}\n... [truncated, {} chars total]", trimmed, text.chars().count())
}

/// Helper for the renderer's XML attribute values (double-quoted).
fn escape_xml_attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_todo_content(s: &str) -> String {
    s.replace("</todo>", "</todo\u{200B}>")
        .replace("</todos>", "</todos\u{200B}>")
}

/// Helper for the renderer's CDATA-style text bodies. The frontend already strips
/// the outer tags via `indexOf`, so we only need to keep `<` from breaking the parse.
fn escape_xml_text(s: &str) -> String {
    s.replace("</original>", "</original\u{200B}>")
        .replace("</replacement>", "</replacement\u{200B}>")
        .replace("</edit>", "</edit\u{200B}>")
}

#[cfg(test)]
mod tests {
    use super::*;

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
