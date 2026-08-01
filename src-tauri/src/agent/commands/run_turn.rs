use reqwest::Client;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use tauri::Emitter;

use super::logging;
use super::streaming::{self, ProxyContext};
use crate::agent::model_router;
use crate::agent::models::AgentState;
use crate::agent::tools::dispatch::{self, SideEffect, ToolCtx, ToolOutcome};
use crate::commands::pty::PtyState;
use crate::core::error::AppError;

pub const MAX_TOOL_LOOPS: usize = 16;
/// Soft cap per file; a successful read_file on that path resets the counter so
/// iterative fix-ups can continue instead of dead-ending after three edits.
const MAX_EDITS_PER_FILE_PER_TURN: usize = 6;
// Low bar on purpose: forced synthesis is a rescue path for turns that end with
// literally nothing to show, not a quality gate. The old 80-char bar triggered
// an extra hidden model call after turns that had already answered briefly.
const SYNTHESIS_MIN_PROSE_CHARS: usize = 10;
const SYNTHESIS_MAX_TOKENS: u32 = 900;

const NUDGE_CONCISE_USER_REPLY: &str = "Stop calling tools. Give the user a short, concrete answer. \
Plain prose; bullets only if listing distinct items. No section headers, no soft closes.";

const NUDGE_CONTINUE_OR_FINISH: &str = "Continue the task. If you still need to read or edit files, \
call the appropriate tools now. If the work is done, call finish with a short summary for the user.";

/// Read-only tools are deterministic within a turn (until a file is written), so an
/// identical repeated call is always a reasoning loop, never new information.
const DEDUPED_READONLY_TOOLS: &[&str] = &[
    "read_file",
    "list_dir",
    "grep",
    "search_files",
    "search_codebase",
    "web_search",
    "list_terminals",
];

/// Cap how many times the agent can call `wait` in one turn (stops sleep loops).
const MAX_WAIT_CALLS_PER_TURN: usize = 6;

fn duplicate_call_key(name: &str, arguments: &str) -> String {
    format!("{}\u{1}{}", name, arguments.trim())
}

fn duplicate_call_message(name: &str) -> String {
    format!(
        "DUPLICATE CALL BLOCKED: you already called {} with these exact arguments this turn and the result has not changed. \
         Do not repeat it. Use the earlier result, try a different tool or different arguments, or finish with your answer.",
        name
    )
}

/// Model often narrates the next step ("Let me try the edit again") as plain text
/// and then the turn ends because text-without-tools is treated as completion.
fn looks_like_incomplete_work(content: &str) -> bool {
    let lower = content.to_lowercase();
    const MARKERS: &[&str] = &[
        "let me ",
        "i'll ",
        "i will ",
        "try again",
        "edit again",
        "need to read",
        "need to edit",
        "going to ",
        "i should ",
        "one more",
        "once more",
        "retry",
        "next i ",
        "i can try",
        "let's ",
    ];
    MARKERS.iter().any(|m| lower.contains(m))
}

const PROMPT_SYNTHESIS_USER: &str = "Write a short answer for the user from the tool results below. \
Plain prose; bullets only if listing distinct items. No `##` headers or report formatting.";

fn strip_tool_markup(content: &str) -> String {
    let mut out = String::with_capacity(content.len());
    let mut in_tag = false;
    for c in content.chars() {
        if c == '<' {
            in_tag = true;
            continue;
        }
        if c == '>' {
            in_tag = false;
            continue;
        }
        if !in_tag {
            out.push(c);
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn has_substantive_text(content: &str) -> bool {
    strip_tool_markup(content).chars().count() >= SYNTHESIS_MIN_PROSE_CHARS
}

fn has_written_summary(finished_signal: &Option<String>) -> bool {
    finished_signal
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

fn record_usage(config: &AgentTurnConfig<'_>, input_tokens: usize, output_tokens: usize) {
    config
        .agent_state
        .record_turn_usage(input_tokens, output_tokens);
}

fn collect_tool_context(api_messages: &[Value]) -> String {
    api_messages
        .iter()
        .filter(|m| m.get("role").and_then(|r| r.as_str()) == Some("tool"))
        .filter_map(|m| m.get("content").and_then(|c| c.as_str()))
        .take(24)
        .map(|s| clip_text(s, 2500))
        .collect::<Vec<_>>()
        .join("\n\n---\n\n")
}

async fn synthesize_from_tool_context(
    config: &AgentTurnConfig<'_>,
    instruction: &str,
) -> String {
    let tool_context = collect_tool_context(config.api_messages);
    if tool_context.trim().is_empty() {
        return "Exploration finished but no findings were captured. Try asking again with a narrower question."
            .to_string();
    }
    let prompt = format!(
        "{}\n\n<tool_results>\n{}\n</tool_results>",
        instruction, tool_context
    );
    let proxy_ctx = config.proxy_ctx.clone().fresh_request();
    match streaming::complete_chat_with_max_tokens(
        config.client,
        config.api_key,
        &prompt,
        model_router::MODEL_FAST,
        SYNTHESIS_MAX_TOKENS,
        &proxy_ctx,
    )
    .await
    {
        Ok((s, inp, out)) => {
            record_usage(config, inp, out);
            if has_substantive_text(&s) {
                s
            } else {
                clip_text(&tool_context, 4000)
            }
        }
        Err(_) => clip_text(&tool_context, 4000),
    }
}

async fn force_text_response(
    config: &mut AgentTurnConfig<'_>,
    final_full_response: &mut String,
    total_input_tokens: &mut usize,
    total_output_tokens: &mut usize,
    nudge: &str,
) {
    if config.cancel.is_cancelled() {
        return;
    }
    config.proxy_ctx.refresh_request_id();
    config.api_messages.push(json!({
        "role": "user",
        "content": nudge,
    }));
    let empty_tools: &[Value] = &[];
    match streaming::stream_chat_with_retry(
        config.client,
        config.api_key,
        config.api_messages,
        empty_tools,
        config.app_handle,
        config.cancel.clone(),
        config.model,
        &config.proxy_ctx,
    )
    .await
    {
        Ok(outcome) => {
            record_usage(config, outcome.input_tokens, outcome.output_tokens);
            *total_input_tokens += outcome.input_tokens;
            *total_output_tokens += outcome.output_tokens;
            if !outcome.content.trim().is_empty() {
                final_full_response.push_str(&outcome.content);
            } else if outcome.content.trim().is_empty() {
                // fall through to synthesize below
            }
        }
        Err(e) => {
            logging::warn("chat", &format!("Synthesis stream failed: {}", e));
        }
    }

    if !has_substantive_text(final_full_response) {
        let fallback = synthesize_from_tool_context(
            config,
            PROMPT_SYNTHESIS_USER,
        )
        .await;
        if !fallback.trim().is_empty() {
            final_full_response.push_str(&fallback);
            emit_turn_chat_token(config, fallback.clone());
        }
    }
}

pub struct AgentTurnConfig<'a> {
    pub client: &'a Client,
    pub api_key: &'a str,
    pub api_messages: &'a mut Vec<Value>,
    pub tools: &'a [Value],
    pub model: &'a str,
    pub mode: &'a str,
    pub project_path: &'a str,
    pub app_handle: &'a tauri::AppHandle,
    pub agent_state: &'a AgentState,
    pub index_state: Option<&'a crate::agent::index::IndexState>,
    pub mcp_state: Option<&'a crate::mcp::McpState>,
    pub pty_state: Option<&'a PtyState>,
    pub cancel: tokio_util::sync::CancellationToken,
    pub proxy_ctx: ProxyContext,
    pub max_loops: usize,
    pub emit_complete: bool,
}

pub struct AgentTurnOutcome {
    pub response_text: String,
    pub loop_count: usize,
    /// When the model stream died mid-turn (e.g. provider 403), we keep the
    /// partial tool transcript but surface this to the UI as `chat_complete.error`.
    pub interrupt_error: Option<String>,
}

fn emit_turn_chat_token(config: &AgentTurnConfig<'_>, chunk: impl Into<String>) {
    let _ = config.app_handle.emit(
        "chat_token",
        json!({
            "chunk": chunk.into(),
            "turnId": config.proxy_ctx.turn_id,
            "conversationId": config.proxy_ctx.conversation_id,
        }),
    );
}

pub async fn run_agent_turn(mut config: AgentTurnConfig<'_>) -> Result<AgentTurnOutcome, AppError> {
    let mut loop_count = 0usize;
    let mut total_input_tokens = 0usize;
    let mut total_output_tokens = 0usize;
    let mut read_paths: HashSet<String> = HashSet::new();
    let mut edit_counts: HashMap<String, usize> = HashMap::new();
    let mut executed_readonly_calls: HashSet<String> = HashSet::new();
    let mut wait_calls = 0usize;
    let mut final_full_response = String::new();
    let mut finished_signal: Option<String> = None;
    let mut ended_with_text_completion = false;
    let mut interrupt_error: Option<String> = None;
    let mut empty_response_retried = false;
    let mut incomplete_text_nudged = false;

    let turn_id = config.proxy_ctx.turn_id.clone();
    let conversation_id = config.proxy_ctx.conversation_id.clone();

    'outer: loop {
        if config.cancel.is_cancelled() {
            logging::info("chat", "Cancelled by user");
            break;
        }
        if loop_count >= config.max_loops {
            logging::warn(
                "chat",
                &format!("Hit max tool-loop iterations ({}), stopping", config.max_loops),
            );
            final_full_response.push_str(
                "\n<tool_result>\n[chat] Reached the max tool-loop limit. Stopping to avoid runaway tool calls. Ask me to continue if needed.\n</tool_result>\n",
            );
            break;
        }
        loop_count += 1;
        config.proxy_ctx.refresh_request_id();

        // Reset the UI activity label: we're back in the model, not a tool.
        streaming::emit_chat_status(
            &config.app_handle,
            json!({ "phase": "model" }),
        );

        let outcome = match streaming::stream_chat_with_retry(
            config.client,
            config.api_key,
            config.api_messages,
            config.tools,
            config.app_handle,
            config.cancel.clone(),
            config.model,
            &config.proxy_ctx,
        )
        .await
        {
            Ok(o) => o,
            Err(e) => {
                logging::warn(
                    "chat",
                    &format!("Stream failed on loop {}: {}", loop_count, e),
                );
                if loop_count > 1 || !final_full_response.trim().is_empty() {
                    // Keep the tool transcript for the user, but mark the turn as
                    // failed so the UI shows an error card (tool_result tags are hidden).
                    interrupt_error = Some(e.to_string());
                    break 'outer;
                }
                return Err(e);
            }
        };

        record_usage(&config, outcome.input_tokens, outcome.output_tokens);
        total_input_tokens += outcome.input_tokens;
        total_output_tokens += outcome.output_tokens;

        if config.cancel.is_cancelled() {
            break;
        }

        // Provider signaled failure (common with Gemini via OpenRouter while emitting
        // a huge tool-arg payload). Retry once with tools still enabled — do not fall
        // through to a tool-less synthesis that invents design concepts as prose.
        let finish_failed = outcome.finish_reason.as_deref() == Some("error");
        if finish_failed && outcome.tool_calls.is_empty() {
            if !empty_response_retried {
                empty_response_retried = true;
                loop_count = loop_count.saturating_sub(1);
                logging::warn(
                    "chat",
                    "Provider finish_reason=error with no tool calls — retrying once with tools",
                );
                streaming::emit_chat_status(
                    &config.app_handle,
                    json!({ "phase": "model", "label": "Retrying after model error" }),
                );
                continue;
            }
            interrupt_error = Some(format!(
                "The model ({}) failed while preparing tools. Try again or pick a different model.",
                config.model
            ));
            break 'outer;
        }

        if !outcome.content.is_empty() {
            // Mid-tool narration stays in the API transcript only — the reply bubble
            // should not accumulate planning essays between tool calls.
            if outcome.tool_calls.is_empty() {
                final_full_response.push_str(&outcome.content);
            }
        }

        if outcome.content.trim().is_empty()
            && outcome.tool_calls.is_empty()
            && !outcome.had_reasoning
            && outcome.output_tokens == 0
        {
            if loop_count == 1 && config.emit_complete && !empty_response_retried {
                // Providers occasionally return a blank first completion; retry once
                // before surfacing an error to the user.
                empty_response_retried = true;
                loop_count = 0;
                logging::warn("chat", "Empty model response on first loop — retrying once");
                continue;
            }
            if loop_count <= 1 && config.emit_complete {
                // `send_chat_message` emits chat_complete (with the error) for us.
                return Err(AppError::Message(format!(
                    "The model ({}) returned an empty response. Try again or pick a different model.",
                    config.model
                )));
            }
            break;
        }

        // Reasoning-only stop (no content, no tools) — nothing left to do this loop.
        if outcome.content.trim().is_empty() && outcome.tool_calls.is_empty() {
            break;
        }

        let mut assistant_msg = json!({
            "role": "assistant",
            "content": if outcome.content.is_empty() { Value::Null } else { Value::String(outcome.content.clone()) },
        });
        if !outcome.tool_calls.is_empty() {
            let calls: Vec<Value> = outcome
                .tool_calls
                .iter()
                .map(|c| {
                    json!({
                        "id": c.id,
                        "type": "function",
                        "function": {
                            "name": c.name,
                            "arguments": c.arguments,
                        }
                    })
                })
                .collect();
            assistant_msg["tool_calls"] = Value::Array(calls);
        }
        config.api_messages.push(assistant_msg);

        if outcome.tool_calls.is_empty() {
            let content = outcome.content.trim();
            // Models often narrate the next tool step as prose ("Let me try the edit
            // again") and stop. Nudge once so the turn does not die mid-task.
            if !content.is_empty()
                && loop_count > 1
                && !incomplete_text_nudged
                && looks_like_incomplete_work(content)
                && !config.cancel.is_cancelled()
            {
                incomplete_text_nudged = true;
                logging::info(
                    "chat",
                    "Text-only reply looks unfinished — nudging model to continue or finish",
                );
                config.api_messages.push(json!({
                    "role": "user",
                    "content": NUDGE_CONTINUE_OR_FINISH,
                }));
                continue;
            }
            ended_with_text_completion = !content.is_empty();
            break;
        }

        let tool_calls = outcome.tool_calls;

        // A multi-call batch of read-only tools has no ordering dependencies, so
        // execute it concurrently instead of one call at a time. This is where
        // most of the "gathering context" latency in a turn comes from.
        let parallel_batch = tool_calls.len() > 1
            && tool_calls
                .iter()
                .all(|c| DEDUPED_READONLY_TOOLS.contains(&c.name.as_str()));

        if parallel_batch {
            if config.cancel.is_cancelled() {
                break 'outer;
            }
            streaming::emit_chat_status(
                &config.app_handle,
                json!({ "phase": "tool", "tool": tool_calls[0].name }),
            );

            // The duplicate-call guard still applies per call.
            let blocked: Vec<Option<String>> = tool_calls
                .iter()
                .map(|call| {
                    let key = duplicate_call_key(&call.name, &call.arguments);
                    if executed_readonly_calls.insert(key) {
                        None
                    } else {
                        Some(duplicate_call_message(&call.name))
                    }
                })
                .collect();

            let ctxs: Vec<ToolCtx<'_>> = tool_calls
                .iter()
                .map(|_| ToolCtx {
                    project_path: config.project_path,
                    mode: config.mode,
                    app_handle: config.app_handle,
                    agent_state: config.agent_state,
                    client: config.client,
                    api_key: config.api_key,
                    cancel: config.cancel.clone(),
                    index_state: config.index_state,
                    mcp_state: config.mcp_state,
                    pty_state: config.pty_state,
                    turn_id: turn_id.clone(),
                    conversation_id: conversation_id.clone(),
                })
                .collect();

            let run_indices: Vec<usize> = blocked
                .iter()
                .enumerate()
                .filter(|(_, b)| b.is_none())
                .map(|(i, _)| i)
                .collect();
            let executed = futures::future::join_all(run_indices.iter().map(|&i| {
                let call = &tool_calls[i];
                dispatch::execute_tool(&call.name, &call.arguments, &ctxs[i])
            }))
            .await;

            let mut results: Vec<Option<ToolOutcome>> =
                tool_calls.iter().map(|_| None).collect();
            for (&i, out) in run_indices.iter().zip(executed) {
                results[i] = Some(out);
            }

            // Emit and record results in the model's original call order.
            for (i, call) in tool_calls.iter().enumerate() {
                if let Some(msg) = &blocked[i] {
                    push_tool_result(config.api_messages, &call.id, &call.name, msg);
                    continue;
                }
                let Some(tool_outcome) = results[i].take() else {
                    continue;
                };
                if !tool_outcome.ui_chunk.is_empty() {
                    upsert_terminal_ui_chunk(&mut final_full_response, &tool_outcome.ui_chunk);
                    emit_turn_chat_token(&config, tool_outcome.ui_chunk.clone());
                    track_stream_chunk(&config, &tool_outcome.ui_chunk, None);
                }
                push_tool_result(
                    config.api_messages,
                    &call.id,
                    &call.name,
                    &tool_outcome.tool_result,
                );
                if let Some(SideEffect::FileRead { path, .. }) = tool_outcome.side_effect {
                    let abs = resolve_abs(&path, config.project_path);
                    read_paths.insert(abs.clone());
                    edit_counts.remove(&abs);
                }
            }

            super::messages::clear_old_tool_results(config.api_messages);
            continue;
        }

        for call in tool_calls {
            if config.cancel.is_cancelled() {
                break 'outer;
            }

            let tool_status = if call.name == "render_design_previews" {
                json!({
                    "phase": "tool",
                    "tool": call.name,
                    "label": "Creating designs",
                })
            } else {
                json!({ "phase": "tool", "tool": call.name })
            };
            streaming::emit_chat_status(&config.app_handle, tool_status);

            // Loop guard: an identical read-only call cannot yield new information.
            // Block it with an actionable message instead of burning another result.
            if DEDUPED_READONLY_TOOLS.contains(&call.name.as_str()) {
                let key = duplicate_call_key(&call.name, &call.arguments);
                if !executed_readonly_calls.insert(key) {
                    let msg = duplicate_call_message(&call.name);
                    push_tool_result(config.api_messages, &call.id, &call.name, &msg);
                    continue;
                }
            }

            if call.name == "wait" {
                wait_calls += 1;
                if wait_calls > MAX_WAIT_CALLS_PER_TURN {
                    let msg = format!(
                        "BLOCKED: wait was called {} times this turn. Poll once more with read_terminal if needed, then continue or call finish.",
                        MAX_WAIT_CALLS_PER_TURN
                    );
                    push_tool_result(config.api_messages, &call.id, &call.name, &msg);
                    continue;
                }
            }

            let mut tool_hint: Option<String> = None;
            if call.name == "edit_file" {
                if let Ok(args_val) = serde_json::from_str::<Value>(&call.arguments) {
                    let target = args_val
                        .get("target_file")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    if !target.is_empty() {
                        let abs = resolve_abs(&target, config.project_path);
                        let count = edit_counts.entry(abs.clone()).or_insert(0);
                        *count += 1;
                        if *count > MAX_EDITS_PER_FILE_PER_TURN {
                            let hint_msg = format!(
                                "BLOCKED: You have already edited '{}' {} times this turn without re-reading. \
                                 Call read_file on it (that resets the edit budget), then edit again — \
                                 or call finish if the task is done.",
                                target, MAX_EDITS_PER_FILE_PER_TURN
                            );
                            push_tool_result(config.api_messages, &call.id, &call.name, &hint_msg);
                            let ui = format!("\n<tool_result>\n[edit_file] {}\n</tool_result>\n", hint_msg);
                            emit_turn_chat_token(&config, ui.clone());
                            final_full_response.push_str(&ui);
                            continue;
                        }
                        if !read_paths.contains(&abs) && std::path::Path::new(&abs).exists() {
                            tool_hint = Some(format!(
                                "Hint: you have not read '{}' this turn. Call read_file first if the edit fails.",
                                target
                            ));
                        }
                    }
                }
            }

            let ctx = ToolCtx {
                project_path: config.project_path,
                mode: config.mode,
                app_handle: config.app_handle,
                agent_state: config.agent_state,
                client: config.client,
                api_key: config.api_key,
                cancel: config.cancel.clone(),
                index_state: config.index_state,
                mcp_state: config.mcp_state,
                pty_state: config.pty_state,
                turn_id: turn_id.clone(),
                conversation_id: conversation_id.clone(),
            };

            let tool_outcome = dispatch::execute_tool(&call.name, &call.arguments, &ctx).await;

            // Mutating tools (edits, terminal commands) can change what read-only
            // tools would return, so repeated reads become legitimate again.
            if !DEDUPED_READONLY_TOOLS.contains(&call.name.as_str()) {
                executed_readonly_calls.clear();
            }

            if !tool_outcome.ui_chunk.is_empty() {
                upsert_terminal_ui_chunk(&mut final_full_response, &tool_outcome.ui_chunk);
                emit_turn_chat_token(&config, tool_outcome.ui_chunk.clone());
                track_stream_chunk(&config, &tool_outcome.ui_chunk, None);
            }

            let mut content = tool_outcome.tool_result.clone();
            if let Some(hint) = tool_hint {
                content = format!("{}\n\n{}", hint, content);
            }
            push_tool_result(config.api_messages, &call.id, &call.name, &content);

            if let Some(effect) = tool_outcome.side_effect {
                match effect {
                    SideEffect::FileRead { path, .. } => {
                        let abs = resolve_abs(&path, config.project_path);
                        read_paths.insert(abs.clone());
                        // Re-reading unlocks another edit budget for this file.
                        edit_counts.remove(&abs);
                    }
                    SideEffect::FileWritten { path, .. } => {
                        read_paths.insert(resolve_abs(&path, config.project_path));
                    }
                    SideEffect::FileDeleted { path } => {
                        let abs = resolve_abs(&path, config.project_path);
                        read_paths.remove(&abs);
                        edit_counts.remove(&abs);
                    }
                    SideEffect::Finished { summary } => {
                        finished_signal = Some(summary.unwrap_or_default());
                    }
                }
            }
        }

        if finished_signal.is_some() {
            break;
        }

        super::messages::clear_old_tool_results(config.api_messages);
    }

    if let Some(ref summary) = finished_signal {
        if !summary.trim().is_empty() && !final_full_response.contains(summary.as_str()) {
            final_full_response.push_str(summary);
            final_full_response.push('\n');
            let chunk = format!("{}\n", summary);
            emit_turn_chat_token(&config, chunk.clone());
            track_stream_chunk(&config, &chunk, None);
        }
    }

    if !has_written_summary(&finished_signal)
        && !ended_with_text_completion
        && !has_substantive_text(&final_full_response)
        && interrupt_error.is_none()
        && !config.cancel.is_cancelled()
    {
            logging::info("chat", "No written summary yet — forcing synthesis stream");
            force_text_response(
                &mut config,
                &mut final_full_response,
                &mut total_input_tokens,
                &mut total_output_tokens,
                NUDGE_CONCISE_USER_REPLY,
            )
            .await;
    }

    // `chat_complete` (with stats) is emitted from `send_chat_message` after the turn returns.

    Ok(AgentTurnOutcome {
        response_text: final_full_response,
        loop_count,
        interrupt_error,
    })
}

fn push_tool_result(api_messages: &mut Vec<Value>, id: &str, name: &str, content: &str) {
    api_messages.push(json!({
        "role": "tool",
        "tool_call_id": id,
        "name": name,
        "content": content,
    }));
}

fn track_stream_chunk(config: &AgentTurnConfig<'_>, chunk: &str, activity_label: Option<&str>) {
    if chunk.is_empty() {
        return;
    }
    let proj = if config.project_path.is_empty() {
        None
    } else {
        Some(config.project_path)
    };
    config
        .agent_state
        .append_in_flight(chunk, activity_label, proj);
}

fn resolve_abs(path: &str, project_path: &str) -> String {
    if std::path::Path::new(path).is_absolute() {
        path.to_string()
    } else {
        std::path::Path::new(project_path)
            .join(path)
            .to_string_lossy()
            .into_owned()
    }
}

fn upsert_terminal_ui_chunk(accumulated: &mut String, chunk: &str) {
    if chunk.contains("<todos") {
        upsert_tagged_block(accumulated, chunk, "<todos", "</todos>");
        return;
    }
    if !chunk.contains("<terminal_command") {
        accumulated.push_str(chunk);
        return;
    }

    let Some(id) = extract_xml_attr(chunk, "id") else {
        accumulated.push_str(chunk);
        return;
    };

    let marker = format!("id=\"{}\"", id);
    let Some(marker_pos) = accumulated.rfind(&marker) else {
        accumulated.push_str(chunk);
        return;
    };

    let Some(block_start) = accumulated[..marker_pos].rfind("<terminal_command") else {
        accumulated.push_str(chunk);
        return;
    };

    let Some(rel_end) = accumulated[block_start..].find("</terminal_command>") else {
        accumulated.push_str(chunk);
        return;
    };

    let block_end = block_start + rel_end + "</terminal_command>".len();
    accumulated.replace_range(block_start..block_end, chunk);
}

fn upsert_tagged_block(accumulated: &mut String, chunk: &str, start_tag: &str, end_tag: &str) {
    if let Some(block_start) = accumulated.rfind(start_tag) {
        if let Some(rel_end) = accumulated[block_start..].find(end_tag) {
            let block_end = block_start + rel_end + end_tag.len();
            accumulated.replace_range(block_start..block_end, chunk.trim());
            return;
        }
    }
    accumulated.push_str(chunk);
}

fn extract_xml_attr(chunk: &str, attr: &str) -> Option<String> {
    let pattern = format!("{}=\"", attr);
    let start = chunk.find(&pattern)? + pattern.len();
    let rest = &chunk[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}


fn clip_text(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        return text.to_string();
    }
    let trimmed: String = text.chars().take(limit).collect();
    format!(
        "{}\n... [truncated, {} chars total]",
        trimmed,
        text.chars().count()
    )
}
