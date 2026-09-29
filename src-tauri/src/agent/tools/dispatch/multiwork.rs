//! Multiwork orchestrator + worker tools.

use serde_json::{json, Value};
use tauri::Emitter;

use crate::agent::multiwork;

use super::common::{error_outcome, get_str};
use super::{ToolCtx, ToolOutcome};

pub(super) async fn tool_spawn_worker(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if !ctx.mode.eq_ignore_ascii_case("multiwork") {
        return error_outcome(
            "spawn_worker",
            "spawn_worker is only available in Multiwork mode.",
        );
    }
    if let Err(e) = multiwork::can_spawn_worker() {
        return error_outcome("spawn_worker", &e);
    }
    let task = match get_str(args, "task") {
        Ok(s) => s,
        Err(e) => return error_outcome("spawn_worker", &e),
    };
    let mut title = args
        .get("title")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(task.as_str())
        .to_string();
    if title.chars().count() > 72 {
        title = format!("{}…", title.chars().take(71).collect::<String>());
    }
    let model_override = args.get("model").and_then(|v| v.as_str());
    let files = args
        .get("files")
        .and_then(|v| {
            if let Some(s) = v.as_str() {
                Some(s.to_string())
            } else if let Some(arr) = v.as_array() {
                let joined = arr
                    .iter()
                    .filter_map(|x| x.as_str())
                    .collect::<Vec<_>>()
                    .join("\n");
                if joined.is_empty() {
                    None
                } else {
                    Some(joined)
                }
            } else {
                None
            }
        });

    let model = multiwork::pick_worker_model(
        ctx.conversation_id.as_deref(),
        model_override,
        ctx.model,
    );
    let worker_id = format!(
        "mw-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );

    // One setup line in the orchestrator transcript the first time we spawn.
    if multiwork::active_worker_count() == 0 {
        ctx.emit_ui_token("\nSetting up the office…\n");
    }

    multiwork::spawn_worker_turn(
        ctx.app_handle.clone(),
        ctx.project_path.to_string(),
        ctx.api_key.to_string(),
        model.clone(),
        task.clone(),
        title.clone(),
        worker_id.clone(),
        ctx.conversation_id.clone(),
        ctx.cancel.child_token(),
        files,
    );

    ToolOutcome {
        tool_result: format!(
            "Started worker `{worker_id}` ({title}) on model `{model}`. Task: {task}"
        ),
        ui_chunk: String::new(),
        side_effect: None,
    }
}

pub(super) async fn tool_message_worker(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let id = match get_str(args, "id") {
        Ok(s) => s,
        Err(e) => return error_outcome("message_worker", &e),
    };
    let content = match get_str(args, "content") {
        Ok(s) => s,
        Err(e) => return error_outcome("message_worker", &e),
    };
    let to_title = multiwork::worker_title(&id).unwrap_or_else(|| id.clone());
    multiwork::emit_bus(
        ctx.app_handle,
        json!({
            "from": "orchestrator",
            "to": to_title,
            "content": content,
            "workerId": id,
        }),
    );
    multiwork::emit_worker(
        ctx.app_handle,
        json!({
            "id": id,
            "activity": content.chars().take(96).collect::<String>(),
            "conversationId": ctx.conversation_id,
        }),
    );
    ToolOutcome {
        tool_result: format!("Messaged worker {id}."),
        ui_chunk: String::new(),
        side_effect: None,
    }
}

pub(super) async fn tool_broadcast_workers(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let content = match get_str(args, "content") {
        Ok(s) => s,
        Err(e) => return error_outcome("broadcast_workers", &e),
    };
    multiwork::emit_bus(
        ctx.app_handle,
        json!({
            "from": "orchestrator",
            "content": content,
        }),
    );
    ToolOutcome {
        tool_result: "Broadcast sent to all workers.".to_string(),
        ui_chunk: String::new(),
        side_effect: None,
    }
}

pub(super) async fn tool_set_worker_status(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let id = match get_str(args, "id") {
        Ok(s) => s,
        Err(e) => return error_outcome("set_worker_status", &e),
    };
    let column = match get_str(args, "column") {
        Ok(s) => s.to_ascii_lowercase(),
        Err(e) => return error_outcome("set_worker_status", &e),
    };
    let column = match column.as_str() {
        "running" | "review" | "done" => column,
        _ => {
            return error_outcome(
                "set_worker_status",
                "column must be running, review, or done.",
            );
        }
    };
    let status = if column == "done" {
        "done"
    } else if column == "review" {
        "done"
    } else {
        "running"
    };
    multiwork::emit_worker(
        ctx.app_handle,
        json!({
            "id": id,
            "column": column,
            "status": status,
            "conversationId": ctx.conversation_id,
        }),
    );
    ToolOutcome {
        tool_result: format!("Worker {id} → {column}."),
        ui_chunk: String::new(),
        side_effect: None,
    }
}

pub(super) async fn tool_message_peer(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let to = args
        .get("to")
        .and_then(|v| v.as_str())
        .unwrap_or("orchestrator")
        .to_string();
    let content = match get_str(args, "content") {
        Ok(s) => s,
        Err(e) => return error_outcome("message_peer", &e),
    };
    let from = ctx
        .conversation_id
        .as_deref()
        .and_then(|c| c.strip_prefix("mw-worker-"))
        .unwrap_or("worker");
    let from_title = multiwork::worker_title(from).unwrap_or_else(|| from.to_string());
    multiwork::emit_bus(
        ctx.app_handle,
        json!({
            "from": from_title,
            "to": to,
            "content": content,
        }),
    );
    ToolOutcome {
        tool_result: "Message delivered.".to_string(),
        ui_chunk: String::new(),
        side_effect: None,
    }
}

pub(super) async fn tool_report_orchestrator(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let content = match get_str(args, "content") {
        Ok(s) => s,
        Err(e) => return error_outcome("report_orchestrator", &e),
    };
    let from = ctx
        .conversation_id
        .as_deref()
        .and_then(|c| c.strip_prefix("mw-worker-"))
        .unwrap_or("worker");
    let from_title = multiwork::worker_title(from).unwrap_or_else(|| from.to_string());
    multiwork::emit_bus(
        ctx.app_handle,
        json!({
            "from": from_title,
            "to": "orchestrator",
            "content": content,
        }),
    );
    multiwork::emit_worker(
        ctx.app_handle,
        json!({
            "id": from,
            "activity": content.chars().take(96).collect::<String>(),
            "conversationId": multiwork::worker_parent(from),
        }),
    );
    if let Some(parent) = multiwork::worker_parent(from) {
        let _ = ctx.app_handle.emit(
            "chat_token",
            json!({
                "chunk": format!("\n[{from_title}] {content}\n"),
                "turnId": ctx.turn_id,
                "conversationId": parent,
            }),
        );
    }
    ToolOutcome {
        tool_result: "Reported to orchestrator.".to_string(),
        ui_chunk: String::new(),
        side_effect: None,
    }
}
