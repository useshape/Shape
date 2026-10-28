//! `inspect_computer` — discover programs, processes, and windows.

use base64::Engine;
use serde_json::Value;

use crate::agent::tools::desktop;
use crate::agent::tools::page_shot;

use tauri::Emitter;

use crate::agent::commands::streaming;
use crate::agent::models::PendingCommand;

use super::common::{
    cleanup_pending_command, emit_command_resolved, error_outcome, get_str, wait_for_command_decision,
    ApprovalDecision,
};
use super::{SideEffect, ToolCtx, ToolOutcome};

pub(super) async fn tool_inspect_computer(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let action = match get_str(args, "action") {
        Ok(s) => s.to_ascii_lowercase(),
        Err(e) => return error_outcome("inspect_computer", &e),
    };
    let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let policy = ctx.agent_state.turn_policy_for(ctx.conversation_id.as_deref());

    if action == "summary" {
        let text = desktop::summary(ctx.project_path, policy.computer_use, policy.shell_automation);
        return plain(&text);
    }

    if !policy.computer_use {
        return error_outcome(
            "inspect_computer",
            "Computer use is off. Turn it on in Settings → Access to list programs, processes, and windows.",
        );
    }

    let result = match action.as_str() {
        "lookup" => desktop::lookup_program(&query),
        "processes" => desktop::list_processes(&query),
        "windows" => desktop::list_windows(&query),
        "capture" => {
            if desktop::is_sensitive_surface(&query) {
                return error_outcome(
                    "inspect_computer",
                    "That window is hidden. Password managers, authenticators, and similar apps are not captured.",
                );
            }
            if let Some(denied) = approve_capture(&query, ctx).await {
                return denied;
            }
            return match desktop::capture_window(&query) {
                Ok(shot) => captured(shot),
                Err(e) => error_outcome("inspect_computer", &e),
            };
        }
        _ => Err("action must be summary, lookup, processes, windows, or capture.".into()),
    };
    match result {
        Ok(text) => plain(&text),
        Err(e) => error_outcome("inspect_computer", &e),
    }
}

fn plain(text: &str) -> ToolOutcome {
    ToolOutcome {
        tool_result: text.to_string(),
        ui_chunk: format!("\n<tool_result>\n[inspect_computer]\n{text}\n</tool_result>\n"),
        side_effect: None,
    }
}

/// Window capture shows whatever is on that window, so the user confirms it.
/// This is not delegated to the cloud gate.
async fn approve_capture(query: &str, ctx: &ToolCtx<'_>) -> Option<ToolOutcome> {
    let cmd_id = format!("cmd-{}", uuid::Uuid::new_v4());
    let label = format!("Capture window matching \"{query}\"");
    let reason = "Screenshots can include private content. Confirm this window before it is captured.".to_string();
    let pending = PendingCommand {
        id: cmd_id.clone(),
        command: label.clone(),
        safety: "needs_approval".to_string(),
        reason: reason.clone(),
        action: Some("capture_window".into()),
        payload: Some(query.to_string()),
    };
    if let Ok(mut pendings) = ctx.agent_state.pending_commands.lock() {
        pendings.insert(cmd_id.clone(), pending.clone());
    }
    let _ = ctx.emit_ui_token(format!(
        "\n<terminal_command status=\"pending\" id=\"{cmd_id}\">{label}\nAwaiting approval: {reason}</terminal_command>\n"
    ));
    let _ = ctx.app_handle.emit("agent-command-pending", pending);
    streaming::emit_chat_status(
        ctx.app_handle,
        serde_json::json!({ "phase": "approval", "label": "Waiting for approval" }),
    );
    let decision = wait_for_command_decision(&cmd_id, ctx).await;
    cleanup_pending_command(&cmd_id, ctx);
    match decision {
        ApprovalDecision::Approved => {
            emit_command_resolved(ctx, &cmd_id, true);
            None
        }
        ApprovalDecision::Rejected => {
            emit_command_resolved(ctx, &cmd_id, false);
            Some(error_outcome(
                "inspect_computer",
                "The user rejected the window capture. Do not retry it.",
            ))
        }
        ApprovalDecision::Cancelled => Some(error_outcome(
            "inspect_computer",
            "The turn was cancelled while waiting for capture approval.",
        )),
    }
}

fn captured(shot: desktop::WindowShot) -> ToolOutcome {
    let data_url = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&shot.png)
    );
    let tag = page_shot::attached_image_tag("window.png", "image/png", &data_url);
    let note = format!(
        "Captured window \"{}\". The image is attached. If this is the wrong window, call inspect_computer with action windows and a tighter query.",
        shot.title
    );
    ToolOutcome {
        tool_result: format!("{note}\n{tag}"),
        ui_chunk: format!("\n{tag}\n"),
        side_effect: Some(SideEffect::PageScreenshot { tag }),
    }
}
