//! Search and web discovery tools.

use serde_json::{json, Value};

use crate::agent::commands::{logging, streaming};
use crate::agent::tools::search;

use super::common::{clip, error_outcome, escape_xml_attr, escape_xml_text, get_str};
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
