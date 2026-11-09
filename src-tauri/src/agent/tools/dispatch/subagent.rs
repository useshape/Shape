//! Background threads. Parent is not blocked; results arrive as an update.

use serde_json::Value;

use crate::agent::checkout::Isolation;
use crate::agent::commands::history;
use crate::agent::subagents;
use crate::core::workspace_trust::WorkspaceTrustState;
use tauri::Manager;

use super::common::{error_outcome, escape_xml_attr, get_str};
use super::{ToolCtx, ToolOutcome};

pub(super) async fn tool_spawn_subagent(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if subagents::spawn_depth(ctx.conversation_id.as_deref()) >= 2 {
        return error_outcome(
            "spawn_subagent",
            "Threads can nest one level. This thread cannot spawn another.",
        );
    }
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
    let ask_like = ctx.mode.eq_ignore_ascii_case("ask") || ctx.mode.eq_ignore_ascii_case("plan");
    let isolation = if ask_like {
        Isolation::Shared
    } else {
        isolation
    };
    if isolation == Isolation::Worktree {
        let trust = ctx.app_handle.state::<WorkspaceTrustState>();
        if !trust.is_trusted(ctx.project_path) {
            return error_outcome(
                "spawn_subagent",
                "Workspace is not trusted. Trust this folder before using worktree isolation.",
            );
        }
    }
    let requested_model = args.get("model").and_then(|v| v.as_str());
    let model = subagents::resolve_model(ctx.agent_state, requested_model);

    let user_task = super::common::latest_user_task(ctx);
    let gate = crate::agent::tools::plugins::fetch_gate(
        ctx.api_key,
        serde_json::json!({
            "kind": "spawn",
            "task": format!("{}\nUser: {}", task, user_task),
        }),
        ctx.turn_id.as_deref(),
        ctx.conversation_id.as_deref(),
    )
    .await;
    if crate::agent::tools::plugins::gate_action(&gate) == "skip"
        && super::common::honor_spawn_skip(&user_task)
    {
        return ToolOutcome {
            tool_result: "Do this yourself with the listed tools. It is not an independent parallel thread.".into(),
            ui_chunk: String::new(),
            side_effect: None,
        };
    }

    let history_store = if history::is_chat_work_dir(ctx.project_path)
        || ctx.project_path.is_empty()
        || ctx.project_path == history::TALK_STORE
    {
        history::TALK_STORE.to_string()
    } else {
        ctx.project_path.to_string()
    };

    let spawned = match subagents::spawn(
        ctx.app_handle.clone(),
        ctx.project_path.to_string(),
        ctx.sealed_project.map(|path| path.to_string()),
        ctx.api_key.to_string(),
        model.clone(),
        ctx.mode.to_string(),
        task.clone(),
        title.clone(),
        isolation,
        ctx.conversation_id.clone(),
        ctx.turn_id.clone(),
        history_store,
    ) {
        Ok(spawned) => spawned,
        Err(e) => return error_outcome("spawn_subagent", &e),
    };
    let id = spawned.id;
    let isolation = spawned.isolation;

    let running_ui = format!(
        "\n<subagent_ref id=\"{}\" agent=\"{}\" task=\"{}\" status=\"running\" />\n",
        escape_xml_attr(&id),
        escape_xml_attr(&title),
        escape_xml_attr(&task),
    );

    ToolOutcome {
        tool_result: format!(
            "Started thread `{id}` ({title}) on `{model}` with {iso} isolation. Keep working. You will get a <subagent_update> when it finishes — do not wait or poll.\n{note}",
            iso = isolation.as_str(),
            note = spawned.note
        ),
        ui_chunk: running_ui,
        side_effect: None,
    }
}
