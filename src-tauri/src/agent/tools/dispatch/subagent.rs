//! Spawn a focused research subagent. Results show as cards in the right panel.

use serde_json::{json, Value};
use tauri::Emitter;

use crate::agent::commands::streaming::{self, ProxyContext};
use crate::agent::tools::search;

use super::common::{clip, error_outcome, escape_xml_attr, get_str};
use super::{ToolCtx, ToolOutcome};

fn emit_subagent(ctx: &ToolCtx<'_>, id: &str, title: &str, activity: &str, status: &str) {
    let _ = ctx.app_handle.emit(
        "agent-subagent",
        json!({
            "id": id,
            "title": title,
            "activity": activity,
            "status": status,
            "turnId": ctx.turn_id,
            "conversationId": ctx.conversation_id,
        }),
    );
}

pub(super) async fn tool_spawn_subagent(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let task = match get_str(args, "task") {
        Ok(s) => s,
        Err(e) => return error_outcome("spawn_subagent", &e),
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

    let id = format!(
        "sub-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );

    emit_subagent(ctx, &id, &title, "Starting…", "running");

    let running_ui = format!(
        "\n<subagent_ref id=\"{}\" agent=\"{}\" task=\"{}\" status=\"running\" />\n",
        escape_xml_attr(&id),
        escape_xml_attr(&title),
        escape_xml_attr(&task),
    );
    ctx.emit_ui_token(&running_ui);

    emit_subagent(ctx, &id, &title, "Searching the codebase…", "running");
    let files = search::execute_file_search(&task, &Some(ctx.project_path.to_string())).await;

    emit_subagent(ctx, &id, &title, "Grepping for matches…", "running");
    let grep = search::execute_grep(
        &task,
        &Some(ctx.project_path.to_string()),
        search::GrepOptions {
            head_limit: 24,
            ..Default::default()
        },
    )
    .await;

    let fallback = format!("Task: {task}\n\nFile matches:\n{files}\n\nCode matches:\n{grep}");
    let mut summary = fallback.clone();

    if !ctx.cancel.is_cancelled() && !ctx.api_key.is_empty() {
        emit_subagent(ctx, &id, &title, "Summarizing findings…", "running");
        let prompt = format!(
            "You are a research subagent for Shape. Using only the search results below, answer the task.\n\
             Be concise and cite file paths. If the results are insufficient, say what is missing.\n\
             Do not invent files or APIs.\n\n\
             Task:\n{task}\n\nFile matches:\n{files}\n\nCode matches:\n{grep}"
        );
        let proxy = ProxyContext::new("subagent")
            .with_turn(ctx.turn_id.clone(), ctx.conversation_id.clone())
            .with_project_path(Some(ctx.project_path.to_string()));
        if let Ok((content, _, _)) = streaming::complete_chat_with_max_tokens(
            ctx.client,
            ctx.api_key,
            &prompt,
            ctx.model,
            900,
            &proxy,
        )
        .await
        {
            if !content.trim().is_empty() {
                summary = content;
            }
        }
    }

    let activity: String = summary
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("Done")
        .chars()
        .take(96)
        .collect();

    emit_subagent(ctx, &id, &title, &activity, "done");

    let done_ui = format!(
        "\n<subagent_ref id=\"{}\" agent=\"{}\" task=\"{}\" status=\"done\" />\n",
        escape_xml_attr(&id),
        escape_xml_attr(&title),
        escape_xml_attr(&task),
    );

    ToolOutcome {
        tool_result: clip(&summary, 8000),
        ui_chunk: done_ui,
        side_effect: None,
    }
}
