//! Past-chat memory tools (opt-in via settings).

use serde_json::Value;

use crate::agent::commands::{history, messages};

use super::common::{
    blocked_outcome, clip, error_outcome, escape_xml_attr, escape_xml_text, get_str,
};
use super::{ToolCtx, ToolOutcome};

fn memory_disabled(ctx: &ToolCtx<'_>) -> bool {
    !ctx.agent_state.chat_memory_enabled()
}

pub(super) fn tool_list_chats(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if memory_disabled(ctx) {
        return blocked_outcome(
            "list_chats",
            "Chat memory is off. Enable it in Settings → AI → Chat memory.",
        );
    }
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| !s.is_empty());
    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(20)
        .clamp(1, 50) as usize;

    let current_id = ctx.conversation_id.clone().unwrap_or_default();
    let mut convs = if ctx.project_path.is_empty() {
        history::load_conversations(history::TALK_STORE)
    } else {
        let mut list = history::load_conversations(ctx.project_path);
        if !history::is_talk_store(ctx.project_path) {
            list.extend(history::load_conversations(history::TALK_STORE));
        }
        list
    };
    convs.sort_by(|a, b| {
        b.timestamp
            .partial_cmp(&a.timestamp)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut rows: Vec<String> = Vec::new();
    for conv in convs {
        if !query
            .as_ref()
            .map(|q| {
                conv.title.to_ascii_lowercase().contains(q)
                    || conv.id.to_ascii_lowercase().contains(q)
            })
            .unwrap_or(true)
        {
            continue;
        }
        let current = if conv.id == current_id {
            " (current)"
        } else {
            ""
        };
        rows.push(format!(
            "- id={}{} | title={} | messages={} | updated={}",
            conv.id,
            current,
            conv.title.replace('\n', " "),
            conv.history.len(),
            conv.timestamp as i64
        ));
        if rows.len() >= limit {
            break;
        }
    }

    let body = if rows.is_empty() {
        "No matching past chats in this project.".to_string()
    } else {
        format!(
            "Past chats in this project (newest first). Use read_chat with an id to load messages.\n{}",
            rows.join("\n")
        )
    };

    let ui = format!(
        "\n<tool_result>\n[list_chats]\n{}\n</tool_result>\n",
        escape_xml_text(&clip(&body, 1500))
    );
    ToolOutcome {
        tool_result: clip(&body, 6000),
        ui_chunk: ui,
        side_effect: None,
    }
}

pub(super) fn tool_read_chat(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    if memory_disabled(ctx) {
        return blocked_outcome(
            "read_chat",
            "Chat memory is off. Enable it in Settings → AI → Chat memory.",
        );
    }
    let id = match get_str(args, "conversation_id").or_else(|_| get_str(args, "id")) {
        Ok(s) => s,
        Err(_) => {
            return error_outcome(
                "read_chat",
                "conversation_id is required (from list_chats).",
            );
        }
    };
    let max_messages = args
        .get("max_messages")
        .and_then(|v| v.as_u64())
        .unwrap_or(40)
        .clamp(1, 80) as usize;

    let preferred = if ctx.project_path.is_empty() {
        Some(history::TALK_STORE)
    } else {
        Some(ctx.project_path)
    };
    let Some((_proj, conv)) = history::find_conversation_by_id(&id, preferred) else {
        return error_outcome(
            "read_chat",
            &format!("No chat found with id '{id}'."),
        );
    };

    let total = conv.history.len();
    let start = total.saturating_sub(max_messages);
    let slice = &conv.history[start..];

    let mut lines: Vec<String> = Vec::with_capacity(slice.len() + 2);
    lines.push(format!(
        "Chat \"{}\" (id={}). Showing {} of {} messages.",
        conv.title,
        conv.id,
        slice.len(),
        total
    ));
    if start > 0 {
        lines.push(format!("[{start} earlier messages omitted]"));
    }
    for msg in slice {
        let body = messages::strip_heavy_content_for_summary(&msg.content);
        let body = clip(&body, 2500);
        lines.push(format!("[{}] {}", msg.role, body));
    }

    let body = lines.join("\n\n");
    let ui = format!(
        "\n<tool_result>\n[read_chat id=\"{}\"]\n{}\n</tool_result>\n",
        escape_xml_attr(&conv.id),
        escape_xml_text(&clip(&body, 1200))
    );
    ToolOutcome {
        tool_result: clip(&body, 12000),
        ui_chunk: ui,
        side_effect: None,
    }
}
