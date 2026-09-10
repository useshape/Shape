//! Search and web discovery tools.

use serde_json::{json, Value};
use tauri::Emitter;

use crate::agent::commands::{logging, streaming};
use crate::agent::models::{AutoRunMode, PendingCommand};
use crate::agent::tools::search;

use super::common::{
    clip, cleanup_pending_command, emit_command_resolved, error_outcome, escape_xml_attr,
    escape_xml_text, get_str, wait_for_command_decision, ApprovalDecision,
};
use super::{ToolCtx, ToolOutcome};

pub(super) async fn tool_search_files(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
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
        tool_result: clip(&res, 6000),
        ui_chunk: ui,
        side_effect: None,
    }
}

pub(super) async fn tool_grep(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let query = match get_str(args, "query") {
        Ok(s) => s,
        Err(e) => return error_outcome("grep", &e),
    };
    let opts = search::GrepOptions {
        path: args
            .get("path")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        glob: args
            .get("glob")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        context: args
            .get("context")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize,
        case_sensitive: args
            .get("case_sensitive")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        head_limit: args
            .get("head_limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(80) as usize,
    };
    let proj_opt = Some(ctx.project_path.to_string());
    let res = search::execute_grep(&query, &proj_opt, opts).await;
    let ui = format!(
        "\n<search_result query=\"{}\">\n{}\n</search_result>\n",
        escape_xml_attr(&query),
        escape_xml_text(&clip(&res, 1500))
    );
    ToolOutcome {
        tool_result: clip(&res, 8000),
        ui_chunk: ui,
        side_effect: None,
    }
}

pub(super) async fn tool_web_search(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
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
        tool_result: clip(&res, 6000),
        ui_chunk: ui,
        side_effect: None,
    }
}

pub(super) async fn tool_visit_url(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let url = match get_str(args, "url") {
        Ok(s) => s,
        Err(e) => return error_outcome("visit_url", &e),
    };
    streaming::emit_chat_status(
        ctx.app_handle,
        json!({
            "phase": "tool",
            "tool": "visit_url",
            "label": format!("Visiting {url}"),
        }),
    );
    match search::execute_visit_url(&url, ctx.api_key).await {
        Ok(res) => {
            let host = if res.host.is_empty() {
                res.url.clone()
            } else {
                res.host.clone()
            };
            let title = if res.title.is_empty() {
                host.clone()
            } else {
                res.title.clone()
            };
            let ui = format!(
                "\n<web_visit url=\"{}\" host=\"{}\" title=\"{}\"></web_visit>\n",
                escape_xml_attr(&res.url),
                escape_xml_attr(&host),
                escape_xml_attr(&title),
            );
            ToolOutcome {
                tool_result: clip(&res.formatted, 10000),
                ui_chunk: ui,
                side_effect: None,
            }
        }
        Err(e) => error_outcome("visit_url", &e),
    }
}
pub(super) async fn tool_search_codebase(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
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

fn plugin_call_ui(
    toolkit: &str,
    slug: &str,
    label: &str,
    status: &str,
    id: Option<&str>,
    body: &str,
) -> String {
    let id_attr = id
        .map(|v| format!(" id=\"{}\"", escape_xml_attr(v)))
        .unwrap_or_default();
    format!(
        "\n<plugin_call toolkit=\"{}\" slug=\"{}\" label=\"{}\" status=\"{}\"{}>\n{}\n</plugin_call>\n",
        escape_xml_attr(toolkit),
        escape_xml_attr(slug),
        escape_xml_attr(label),
        escape_xml_attr(status),
        id_attr,
        escape_xml_text(&clip(body, 2500))
    )
}

fn humanize_plugin_slug(slug: &str) -> String {
    let rest = slug.split_once('_').map(|(_, r)| r).unwrap_or(slug);
    rest.split('_')
        .filter(|p| !p.is_empty())
        .map(|p| {
            let mut cs = p.chars();
            match cs.next() {
                Some(c) => format!("{}{}", c.to_uppercase(), cs.as_str().to_lowercase()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn toolkit_from_plugin_args(slug: &str, args: &Value) -> String {
    if let Some(t) = args.get("toolkit").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        return t.to_ascii_lowercase();
    }
    slug.split('_')
        .next()
        .unwrap_or("plugin")
        .to_ascii_lowercase()
}

fn plugin_slug_is_mutating(slug: &str) -> bool {
    let u = slug.to_ascii_uppercase();
    const WRITE: &[&str] = &[
        "SEND", "CREATE", "DELETE", "UPDATE", "POST", "WRITE", "REMOVE", "PATCH", "PUT",
        "INVITE", "CANCEL", "MERGE", "DEPLOY", "PUBLISH", "COMMENT", "ASSIGN", "CLOSE",
        "ARCHIVE", "UPLOAD", "INSERT",
    ];
    WRITE.iter().any(|k| u.contains(k))
}

fn plugin_needs_approval(mode: AutoRunMode, slug: &str) -> bool {
    match mode {
        AutoRunMode::Ask => true,
        AutoRunMode::Always => false,
        AutoRunMode::Auto => plugin_slug_is_mutating(slug),
    }
}

fn plugin_discovery_outcome(toolkit: &str, slug: &str, label: &str, res: String) -> ToolOutcome {
    let status = if res.starts_with("ERROR") || res.starts_with("Plugins are not configured") {
        "error"
    } else {
        "ok"
    };
    ToolOutcome {
        tool_result: clip(&res, 8000),
        ui_chunk: plugin_call_ui(toolkit, slug, label, status, None, &res),
        side_effect: None,
    }
}

pub(super) async fn tool_plugin_list(ctx: &ToolCtx<'_>) -> ToolOutcome {
    let res = crate::agent::tools::plugins::execute_plugin_list(ctx.api_key).await;
    plugin_discovery_outcome("plugins", "plugin_list", "Listed plugins", res)
}

pub(super) async fn tool_plugin_search(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let query = match get_str(args, "query") {
        Ok(s) => s,
        Err(e) => return error_outcome("plugin_search", &e),
    };
    let res = crate::agent::tools::plugins::execute_plugin_search(&query, ctx.api_key).await;
    let label = format!("Searched plugins for {query}");
    plugin_discovery_outcome("plugins", "plugin_search", &label, res)
}

pub(super) async fn tool_plugin_tools(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let toolkit = match get_str(args, "toolkit") {
        Ok(s) => s,
        Err(e) => return error_outcome("plugin_tools", &e),
    };
    let query = args.get("query").and_then(|v| v.as_str());
    let res =
        crate::agent::tools::plugins::execute_plugin_tools(&toolkit, query, ctx.api_key).await;
    let label = format!("Listed {toolkit} actions");
    plugin_discovery_outcome(&toolkit, "plugin_tools", &label, res)
}

async fn execute_plugin_run_ui(
    toolkit: &str,
    slug: &str,
    label: &str,
    arguments: &Value,
    ctx: &ToolCtx<'_>,
    cmd_id: Option<&str>,
) -> ToolOutcome {
    let res = crate::agent::tools::plugins::execute_plugin_run(
        slug,
        arguments,
        ctx.api_key,
        ctx.turn_id.as_deref(),
        ctx.conversation_id.as_deref(),
    )
    .await;
    let err = res.starts_with("ERROR")
        || res.starts_with("Sign in")
        || res.starts_with("Plugin request")
        || res.starts_with("Monthly")
        || (!res.trim_start().starts_with('{') && res.to_ascii_lowercase().contains("error"));
    let status = if err { "error" } else { "ok" };
    ToolOutcome {
        tool_result: clip(&res, 8000),
        ui_chunk: plugin_call_ui(toolkit, slug, label, status, cmd_id, &res),
        side_effect: None,
    }
}

pub(super) async fn tool_plugin_run(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let slug = match get_str(args, "slug") {
        Ok(s) => s,
        Err(e) => return error_outcome("plugin_run", &e),
    };
    let arguments = args.get("arguments").cloned().unwrap_or(json!({}));
    let toolkit = toolkit_from_plugin_args(&slug, args);
    let label = humanize_plugin_slug(&slug);
    let policy = ctx.agent_state.turn_policy();
    if policy
        .plugin_disabled_actions
        .get(&toolkit)
        .map(|list| list.iter().any(|s| s.eq_ignore_ascii_case(&slug)))
        .unwrap_or(false)
    {
        return error_outcome(
            "plugin_run",
            "This action is turned off in plugin settings.",
        );
    }
    let mode = policy
        .plugin_approvals
        .get(&toolkit)
        .copied()
        .unwrap_or(policy.plugin_approval_default);

    if !plugin_needs_approval(mode, &slug) {
        return execute_plugin_run_ui(&toolkit, &slug, &label, &arguments, ctx, None).await;
    }

    let cmd_id = format!("cmd-{}", uuid::Uuid::new_v4());
    let pending = PendingCommand {
        id: cmd_id.clone(),
        command: format!("{toolkit}: {label}"),
        safety: "needs_approval".to_string(),
        reason: format!("Plugin action on {toolkit}"),
        action: Some("plugin_run".to_string()),
        payload: None,
    };
    if let Ok(mut pendings) = ctx.agent_state.pending_commands.lock() {
        pendings.insert(cmd_id.clone(), pending.clone());
    }
    let _ = ctx.emit_ui_token(plugin_call_ui(
        &toolkit,
        &slug,
        &label,
        "pending",
        Some(&cmd_id),
        "Awaiting approval",
    ));
    let _ = ctx.app_handle.emit("agent-command-pending", pending);
    streaming::emit_chat_status(
        ctx.app_handle,
        json!({ "phase": "approval", "label": "Waiting for approval" }),
    );

    let decision = wait_for_command_decision(&cmd_id, ctx).await;
    cleanup_pending_command(&cmd_id, ctx);

    match decision {
        ApprovalDecision::Approved => {
            emit_command_resolved(ctx, &cmd_id, true);
            let mut outcome =
                execute_plugin_run_ui(&toolkit, &slug, &label, &arguments, ctx, Some(&cmd_id)).await;
            outcome.tool_result = format!("(approved by user)\n{}", outcome.tool_result);
            outcome
        }
        ApprovalDecision::Rejected => {
            emit_command_resolved(ctx, &cmd_id, false);
            ToolOutcome {
                tool_result: format!(
                    "Plugin action '{}' was rejected by the user. Do NOT retry it. Continue without it, or ask how to proceed.",
                    slug
                ),
                ui_chunk: plugin_call_ui(
                    &toolkit,
                    &slug,
                    &label,
                    "rejected",
                    Some(&cmd_id),
                    "Rejected",
                ),
                side_effect: None,
            }
        }
        ApprovalDecision::Cancelled => ToolOutcome {
            tool_result: "Turn was cancelled while waiting for plugin approval.".to_string(),
            ui_chunk: plugin_call_ui(
                &toolkit,
                &slug,
                &label,
                "cancelled",
                Some(&cmd_id),
                "Cancelled",
            ),
            side_effect: None,
        },
    }
}
