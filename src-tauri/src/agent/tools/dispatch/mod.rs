//! Tool execution entry point (split by concern — files/discover/terminal/git/meta).

mod common;
mod discover;
mod files;
mod git;
mod meta;
mod terminal;

use reqwest::Client;
use serde_json::Value;
use tauri::{Emitter, Manager};

use crate::agent::models::AgentState;
use crate::commands::pty::PtyState;
use crate::core::workspace_trust::WorkspaceTrustState;

use common::{blocked_outcome, error_outcome, is_read_only_mode, record_tool_event};
use meta::design_gate_blocks_tool;

const DESIGN_GATE_BLOCK_MSG: &str = "Design preview phase is active. Call render_design_previews with React JSX concepts first and wait for the user to pick one. Do not scaffold projects (create-next-app, npm init), run terminal commands, or edit files until a concept is selected.";

const TRUST_GATED_TOOLS: &[&str] = &[
    "run_terminal",
    "create_file",
    "edit_file",
    "apply_patch",
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
    FileRead {
        path: String,
        content: String,
    },
    FileWritten {
        path: String,
        content: String,
    },
    FilesWritten {
        files: Vec<(String, String)>,
    },
    FileDeleted { path: String },
    Finished { summary: Option<String> },
}

pub async fn execute_tool(name: &str, args_json: &str, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if design_gate_blocks_tool(name, ctx) {
        return blocked_outcome(name, DESIGN_GATE_BLOCK_MSG);
    }

    if is_read_only_mode(ctx.mode) && name.starts_with("mcp_") {
        return blocked_outcome(name, "MCP tools are not available in Ask or Plan mode.");
    }

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
                &format!(
                    "Could not parse tool arguments as JSON: {}. Arguments received: {}",
                    e, args_json
                ),
            );
        }
    };

    let outcome = match name {
        "read_file" => files::tool_read_file(&args, ctx),
        "list_dir" => files::tool_list_dir(&args, ctx),
        "search_files" => discover::tool_search_files(&args, ctx).await,
        "grep" => discover::tool_grep(&args, ctx).await,
        "search_codebase" => discover::tool_search_codebase(&args, ctx).await,
        "web_search" => discover::tool_web_search(&args, ctx).await,
        "visit_url" => discover::tool_visit_url(&args, ctx).await,
        "create_directory" => files::tool_create_directory(&args, ctx),
        "create_file" => files::tool_create_file(&args, ctx).await,
        "edit_file" => files::tool_edit_file(&args, ctx).await,
        "apply_patch" => files::tool_apply_patch(&args, ctx).await,
        "read_lints" => files::tool_read_lints(&args, ctx),
        "delete_file" => files::tool_delete_file(&args, ctx),
        "rename_file" => files::tool_rename_file(&args, ctx),
        "run_terminal" => terminal::tool_run_terminal(&args, ctx).await,
        "git_status" => git::tool_git_status(ctx),
        "git_fetch" => git::tool_git_fetch(ctx),
        "git_log" => git::tool_git_log(&args, ctx),
        "git_stage" => git::tool_git_stage(&args, ctx),
        "git_commit" => git::tool_git_commit(&args, ctx).await,
        "list_terminals" => terminal::tool_list_terminals(ctx),
        "read_terminal" => terminal::tool_read_terminal(&args, ctx),
        "write_to_terminal" => terminal::tool_write_to_terminal(&args, ctx),
        "wait" => terminal::tool_wait(&args, ctx).await,
        "save_plan" => meta::tool_save_plan(&args, ctx),
        "update_todos" => meta::tool_update_todos(&args, ctx),
        "render_design_previews" => meta::tool_render_design_previews(&args, ctx).await,
        "finish" => meta::tool_finish(&args),
        other => {
            if other.starts_with("mcp_") {
                let mcp_out = meta::tool_mcp_call(other, args_json, ctx).await;
                record_tool_event(other, &mcp_out, ctx.project_path);
                let tool_result = crate::agent::tools::spill::maybe_spill_tool_output(
                    ctx.project_path,
                    other,
                    &mcp_out.tool_result,
                );
                return ToolOutcome {
                    tool_result,
                    ui_chunk: mcp_out.ui_chunk,
                    side_effect: mcp_out.side_effect,
                };
            }
            error_outcome(other, &format!("Unknown tool: '{}'", other))
        }
    };
    record_tool_event(name, &outcome, ctx.project_path);
    let tool_result = crate::agent::tools::spill::maybe_spill_tool_output(
        ctx.project_path,
        name,
        &outcome.tool_result,
    );
    ToolOutcome {
        tool_result,
        ui_chunk: outcome.ui_chunk,
        side_effect: outcome.side_effect,
    }
}
