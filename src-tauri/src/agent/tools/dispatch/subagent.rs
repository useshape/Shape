//! Background subagents. Parent is not blocked; results arrive as an update.

use serde_json::Value;

use crate::agent::checkout::Isolation;
use crate::agent::subagents;

use super::common::{error_outcome, escape_xml_attr, get_str};
use super::{ToolCtx, ToolOutcome};

pub(super) async fn tool_spawn_subagent(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let task = match get_str(args, "task") {
        Ok(s) => s,
        Err(e) => return error_outcome("spawn_subagent", &e),
    };
    if let Err(e) = subagents::can_spawn() {
        return error_outcome("spawn_subagent", &e);
    }
    let mut title = args
        .get("title")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(task.as_str())
        .to_string();
    if title.chars().count() > 72 {
        title = format!("{}…", title.chars().take(71).collect::<String>());
    }
    let isolation = Isolation::parse(args.get("isolation").and_then(|v| v.as_str()));
    let requested_model = args.get("model").and_then(|v| v.as_str());
    let model = subagents::resolve_model(ctx.agent_state, requested_model);

    let gate = crate::agent::tools::plugins::fetch_gate(
        ctx.api_key,
        serde_json::json!({
            "kind": "spawn",
            "task": format!("{}\nUser: {}", task, super::common::latest_user_task(ctx)),
        }),
        ctx.turn_id.as_deref(),
        ctx.conversation_id.as_deref(),
    )
    .await;
    if crate::agent::tools::plugins::gate_action(&gate) == "skip" {
        return ToolOutcome {
            tool_result: "Do this yourself with the listed tools. It is not an independent parallel subtask.".into(),
            ui_chunk: String::new(),
            side_effect: None,
        };
    }

    let id = subagents::spawn(
        ctx.app_handle.clone(),
        ctx.project_path.to_string(),
        ctx.api_key.to_string(),
        model.clone(),
        ctx.mode.to_string(),
        task.clone(),
        title.clone(),
        isolation,
        ctx.conversation_id.clone(),
        ctx.turn_id.clone(),
        ctx.cancel.child_token(),
    );

    let running_ui = format!(
        "\n<subagent_ref id=\"{}\" agent=\"{}\" task=\"{}\" status=\"running\" />\n",
        escape_xml_attr(&id),
        escape_xml_attr(&title),
        escape_xml_attr(&task),
    );

    ToolOutcome {
        tool_result: format!(
            "Started subagent `{id}` ({title}) on `{model}` with {iso} isolation. Keep working. You will get a <subagent_update> when it finishes — do not wait or poll.\n{note}",
            iso = isolation.as_str(),
            note = match isolation {
                Isolation::Shared => "Shared checkout: avoid editing the same files it will touch.",
                Isolation::Worktree => "Isolated worktree: it will not merge into the user's branch.",
            }
        ),
        ui_chunk: running_ui,
        side_effect: None,
    }
}
