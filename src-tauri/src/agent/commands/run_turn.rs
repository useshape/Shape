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
/// Code/Review can go a bit longer; Visual stays tight so preview requests don't thrash.
pub const MAX_TOOL_LOOPS_CODE: usize = 20;
pub const MAX_TOOL_LOOPS_VISUAL: usize = 10;

pub fn max_loops_for_mode(mode: &str) -> usize {
    match mode.to_ascii_lowercase().as_str() {
        "visual" | "design" => MAX_TOOL_LOOPS_VISUAL,
        "code" | "agent" | "review" => MAX_TOOL_LOOPS_CODE,
        _ => MAX_TOOL_LOOPS,
    }
}
/// Soft cap per file; a successful read_file on that path resets the counter so
/// iterative fix-ups can continue instead of dead-ending after three edits.
const MAX_EDITS_PER_FILE_PER_TURN: usize = 6;
/// After this many consecutive failed edits on one file without a re-read, block
/// further edit_file calls until the model reads the file again.
const MAX_CONSECUTIVE_EDIT_FAILURES: usize = 3;
// Low bar on purpose: forced synthesis is a rescue path for turns that end with
// literally nothing to show, not a quality gate. The old 80-char bar triggered
// an extra hidden model call after turns that had already answered briefly.
const SYNTHESIS_MIN_PROSE_CHARS: usize = 10;
const SYNTHESIS_MAX_TOKENS: u32 = 900;

const NUDGE_CONCISE_USER_REPLY: &str = "Stop calling tools. Give the user a short, concrete answer. \
Plain prose; bullets only if listing distinct items. No section headers, no soft closes.";

const NUDGE_CONTINUE_OR_FINISH: &str = "Continue the task. If you still need to read or edit files, \
call the appropriate tools now. If the work is done, reply to the user in plain prose (finish is optional).";

const NUDGE_REASONING_ONLY: &str = "You thought but did not call any tools or reply to the user. \
Call the tools you need now (read/search/etc), or give a short answer. Do not only think again.";

const NUDGE_PLAN_REASONING_ONLY: &str = "You thought but did not research or save a plan. \
Use read/search tools now, then call save_plan when ready. Do not only think again.";

const NUDGE_ASK_REASONING_ONLY: &str = "You thought but did not call tools or answer. \
Read or search what you need, then answer the user. Do not only think again.";

const NUDGE_START_EDITING: &str = "You've done a lot of read-only exploration. Prefer making progress now: \
edit/create the files the user asked for, call render_design_previews if they want a preview, \
or answer in plain prose. You may still read a specific file you need — avoid broad search/list loops.";

/// After this many consecutive read-only rounds, nudge once toward editing.
/// Code tasks routinely need many reads; keep Visual tight (preview thrash).
fn readonly_nudge_after(mode: &str) -> usize {
    match mode.to_ascii_lowercase().as_str() {
        "visual" | "design" => 5,
        "ask" | "plan" => 10,
        _ => 12, // code / agent / review
    }
}

/// Hard-stop after extended read-only thrash. Must stay below the mode's max loops,
/// otherwise the turn dies on the loop cap first and the model never sees this message.
fn readonly_hard_stop_after(mode: &str) -> usize {
    match mode.to_ascii_lowercase().as_str() {
        "visual" | "design" => 8,
        "ask" | "plan" => 13,
        _ => 16,
    }
}

/// Read-only tools are deterministic within a turn (until a file is written), so an
/// identical repeated call is always a reasoning loop, never new information.
const DEDUPED_READONLY_TOOLS: &[&str] = &[
    "read_file",
    "list_dir",
    "grep",
    "search_files",
    "search_codebase",
    "web_search",
    "visit_url",
    "list_terminals",
    "read_lints",
];

/// Tools that can change files on disk, so earlier reads may be stale afterwards.
/// Deliberately narrower than "not read-only": a blocked command, a plan save or a
/// todo update cannot invalidate a read, and treating them as if they could let the
/// agent re-read the same file after every failed shell attempt.
const READ_INVALIDATING_TOOLS: &[&str] = &[
    "create_directory",
    "create_file",
    "edit_file",
    "apply_patch",
    "delete_file",
    "rename_file",
    "run_terminal",
    "write_to_terminal",
];

fn tool_invalidates_reads(name: &str, tool_result: &str) -> bool {
    if name.starts_with("mcp_") {
        return true;
    }
    if !READ_INVALIDATING_TOOLS.contains(&name) {
        return false;
    }
    // Blocked or redirected commands never reached a shell, so nothing changed.
    !tool_result.starts_with("BLOCKED:")
        && !tool_result.starts_with(dispatch::REDIRECTED_TOOL_PREFIX)
}

/// Cap how many times the agent can call `wait` in one turn (stops sleep loops).
const MAX_WAIT_CALLS_PER_TURN: usize = 6;

fn duplicate_call_key(name: &str, arguments: &str) -> String {
    format!("{}\u{1}{}", name, arguments.trim())
}

/// Line range a `read_file` call asked for, defaulting to a whole-file read.
fn read_file_range_args(arguments: &str) -> Option<(String, usize, usize)> {
    let args: Value = serde_json::from_str(arguments).ok()?;
    let path = args.get("path")?.as_str()?.to_string();
    if path.is_empty() {
        return None;
    }
    let start = args.get("start_line").and_then(|v| v.as_u64()).unwrap_or(1).max(1) as usize;
    let end = args
        .get("end_line")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .unwrap_or(usize::MAX);
    Some((path, start, end.max(start)))
}

/// The range a `read_file` result actually returned, which can be smaller than the
/// range asked for when the file is short or the default line budget kicks in.
fn parse_read_result_range(tool_result: &str) -> Option<(usize, usize)> {
    tool_result.lines().take(3).find_map(|line| {
        let (start, end) = line
            .split(" (lines ")
            .nth(1)?
            .split(" of ")
            .next()?
            .split_once('-')?;
        Some((start.trim().parse().ok()?, end.trim().parse().ok()?))
    })
}

fn duplicate_call_message(name: &str) -> String {
    format!(
        "DUPLICATE CALL BLOCKED: you already called {} with these exact arguments this turn and the result has not changed. \
         Do not repeat it. Use the earlier result, try a different tool or different arguments, or answer the user.",
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
        "i am going to",
        "i'm going to",
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
        "installing",
        "next i'll",
        "i'll install",
        "i'll add",
        "i'll update",
        "i'll rebuild",
        "continuing",
        "working on",
        "still need",
        "hang on",
        "one sec",
        "give me a moment",
    ];
    MARKERS.iter().any(|m| lower.contains(m))
}

fn tool_result_looks_failed(result: &str) -> bool {
    let lower = result.to_lowercase();
    if lower.contains("exit code 0") || lower.contains("exit=0") {
        return false;
    }
    lower.contains("exit code ")
        || lower.contains("exit=")
        || lower.contains("error spawning")
        || lower.contains("command failed")
        || lower.contains("failed command")
        || lower.contains("syntax errors")
        || lower.contains("eperm:")
        || lower.contains("enoent")
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
    /// True when any tool wrote/deleted files this turn (drives the post-turn
    /// incremental index refresh).
    pub wrote_files: bool,
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
    let mut edit_fail_counts: HashMap<String, usize> = HashMap::new();
    let mut needs_reread: HashSet<String> = HashSet::new();
    let mut file_cache: HashMap<String, String> = HashMap::new();
    let mut executed_readonly_calls: HashSet<String> = HashSet::new();
    // Line ranges already returned for each file this turn.
    let mut read_coverage: HashMap<String, Vec<(usize, usize)>> = HashMap::new();
    let mut wait_calls = 0usize;
    let mut final_full_response = String::new();
    let mut finished_signal: Option<String> = None;
    let mut ended_with_text_completion = false;
    let mut interrupt_error: Option<String> = None;
    let mut wrote_files = false;
    let mut empty_response_retried = false;
    let mut incomplete_text_nudged = false;
    let mut reasoning_only_nudged = false;
    let mut consecutive_readonly_rounds = 0usize;
    let mut explore_nudge_sent = false;
    let mut last_round_failed = false;

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

        // Reasoning-only stop (think tokens, no content, no tools). Common in Plan/Ask
        // when the model "thinks" then exits — nudge once so the turn continues.
        if outcome.content.trim().is_empty() && outcome.tool_calls.is_empty() {
            if outcome.had_reasoning
                && !reasoning_only_nudged
                && !config.cancel.is_cancelled()
                && loop_count < config.max_loops
            {
                reasoning_only_nudged = true;
                let nudge = if config.mode.eq_ignore_ascii_case("plan") {
                    NUDGE_PLAN_REASONING_ONLY
                } else if config.mode.eq_ignore_ascii_case("ask") {
                    NUDGE_ASK_REASONING_ONLY
                } else {
                    NUDGE_REASONING_ONLY
                };
                logging::info(
                    "chat",
                    &format!(
                        "Reasoning-only stop in {} mode — nudging model to continue",
                        config.mode
                    ),
                );
                config.api_messages.push(json!({
                    "role": "user",
                    "content": nudge,
                }));
                streaming::emit_chat_status(
                    &config.app_handle,
                    json!({ "phase": "model", "label": "Continuing" }),
                );
                continue;
            }
            break;
        }

        let mut assistant_msg = json!({
            "role": "assistant",
            "content": if outcome.content.is_empty() { Value::Null } else { Value::String(outcome.content.clone()) },
        });
        if let Some(reasoning) = &outcome.reasoning {
            if !reasoning.is_empty() {
                assistant_msg["reasoning"] = Value::String(reasoning.clone());
                // DeepSeek-compatible routes expect reasoning_content on tool-call turns.
                assistant_msg["reasoning_content"] = Value::String(reasoning.clone());
            }
        }
        if let Some(details) = &outcome.reasoning_details {
            assistant_msg["reasoning_details"] = details.clone();
        }
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
        drop_stale_reasoning(config.api_messages);
        config.api_messages.push(assistant_msg);

        if outcome.tool_calls.is_empty() {
            let content = outcome.content.trim();
            // Models often narrate the next tool step as prose ("Let me try the edit
            // again") and stop. Nudge once so the turn does not die mid-task.
            if !incomplete_text_nudged
                && loop_count > 1
                && !config.cancel.is_cancelled()
                && (
                    looks_like_incomplete_work(content)
                    || (last_round_failed && content.chars().count() < 280)
                )
            {
                incomplete_text_nudged = true;
                logging::info(
                    "chat",
                    "Text-only reply looks unfinished — nudging model to continue or finish",
                );
                config.api_messages.push(json!({
                    "role": "user",
                    "content": if last_round_failed {
                        "The last command failed. Do not stop. Read the error, adjust, and continue the task (or explain the blocker if you are genuinely stuck)."
                    } else {
                        NUDGE_CONTINUE_OR_FINISH
                    },
                }));
                continue;
            }
            ended_with_text_completion = !content.is_empty();
            break;
        }

        let tool_calls = outcome.tool_calls;
        let mut round_failed = false;

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
                if tool_result_looks_failed(&tool_outcome.tool_result) {
                    round_failed = true;
                }
                if let Some(SideEffect::FileRead { path, content }) = tool_outcome.side_effect {
                    let abs = resolve_abs(&path, config.project_path);
                    read_paths.insert(abs.clone());
                    file_cache.insert(abs.clone(), content);
                    edit_counts.remove(&abs);
                    edit_fail_counts.remove(&abs);
                    needs_reread.remove(&abs);
                }
            }

            if super::messages::clear_old_tool_results(config.api_messages) {
                read_coverage.clear();
            }

            // Count this parallel read-only batch as one explore round.
            consecutive_readonly_rounds += 1;
            let hard_stop = readonly_hard_stop_after(config.mode);
            if consecutive_readonly_rounds >= hard_stop {
                logging::warn(
                    "chat",
                    &format!(
                        "Read-only thrash after {} rounds — hard-stopping turn",
                        consecutive_readonly_rounds
                    ),
                );
                final_full_response.push_str(
                    "\n<tool_result>\n[chat] Stopped after too many search/read loops. Ask me to continue with a narrower request.\n</tool_result>\n",
                );
                break 'outer;
            }
            if consecutive_readonly_rounds >= readonly_nudge_after(config.mode) && !explore_nudge_sent {
                explore_nudge_sent = true;
                logging::info("chat", "Read-only thrash — nudging model toward editing");
                config.api_messages.push(json!({
                    "role": "user",
                    "content": NUDGE_START_EDITING,
                }));
            }
            last_round_failed = round_failed;
            continue;
        }

        let mut round_had_write = false;
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
                // Paging through a file produces a different key every time, so exact-argument
                // dedup never catches it. Compare line coverage instead.
                if call.name == "read_file" {
                    if let Some((path, start, end)) = read_file_range_args(&call.arguments) {
                        let abs = resolve_abs(&path, config.project_path);
                        let covered = read_coverage
                            .get(&abs)
                            .is_some_and(|seen| seen.iter().any(|(s, e)| *s <= start && *e >= end));
                        if covered && !needs_reread.contains(&abs) {
                            let msg = format!(
                                "DUPLICATE READ BLOCKED: lines {}-{} of '{}' are already in this conversation and the file has not changed since. \
                                 Scroll back to the earlier read_file result, or read a range you have not seen yet.",
                                start,
                                if end == usize::MAX { "end".to_string() } else { end.to_string() },
                                path
                            );
                            push_tool_result(config.api_messages, &call.id, &call.name, &msg);
                            continue;
                        }
                    }
                }
            } else {
                round_had_write = true;
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
                        if needs_reread.contains(&abs) {
                            let fails = edit_fail_counts.get(&abs).copied().unwrap_or(0);
                            let hint_msg = format!(
                                "BLOCKED: edit_file on '{}' failed {} time(s) this turn. \
                                 Call read_file on it now (required), then retry with a unique SEARCH block from the latest content.",
                                target, fails.max(1)
                            );
                            push_tool_result(config.api_messages, &call.id, &call.name, &hint_msg);
                            let ui = format!("\n<tool_result>\n[edit_file] {}\n</tool_result>\n", hint_msg);
                            emit_turn_chat_token(&config, ui.clone());
                            final_full_response.push_str(&ui);
                            continue;
                        }
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

            // Serve unchanged full-file reads from the turn cache when possible.
            if call.name == "read_file" {
                if let Ok(args_val) = serde_json::from_str::<Value>(&call.arguments) {
                    let path = args_val.get("path").and_then(|v| v.as_str()).unwrap_or("");
                    let has_range = args_val.get("start_line").is_some()
                        || args_val.get("end_line").is_some();
                    if !path.is_empty() && !has_range {
                        let abs = resolve_abs(path, config.project_path);
                        if !needs_reread.contains(&abs) {
                            if let Some(cached) = file_cache.get(&abs) {
                                let display = if cached.chars().count() > 30_000 {
                                    let head: String = cached.chars().take(30_000).collect();
                                    format!(
                                        "{}\n\n[truncated — file longer than 30,000 chars; call read_file again with start_line/end_line to see more]\n\
                                         [served from turn cache]",
                                        head
                                    )
                                } else {
                                    format!("{}\n\n[served from turn cache — content unchanged since last read/write]", cached)
                                };
                                let ui = format!("\n<cat>{}</cat>\n", path);
                                upsert_terminal_ui_chunk(&mut final_full_response, &ui);
                                emit_turn_chat_token(&config, ui.clone());
                                track_stream_chunk(&config, &ui, None);
                                push_tool_result(config.api_messages, &call.id, &call.name, &display);
                                if let Some(range) = parse_read_result_range(cached) {
                                    read_coverage.entry(abs.clone()).or_default().push(range);
                                }
                                read_paths.insert(abs.clone());
                                edit_counts.remove(&abs);
                                edit_fail_counts.remove(&abs);
                                continue;
                            }
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

            // Writing to disk can change what read-only tools would return, so repeated
            // reads become legitimate again.
            if tool_invalidates_reads(&call.name, &tool_outcome.tool_result) {
                executed_readonly_calls.clear();
                read_coverage.clear();
            }

            if call.name == "read_file" {
                if let (Some((path, _, _)), Some(range)) = (
                    read_file_range_args(&call.arguments),
                    parse_read_result_range(&tool_outcome.tool_result),
                ) {
                    let abs = resolve_abs(&path, config.project_path);
                    read_coverage.entry(abs).or_default().push(range);
                }
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

            if tool_result_looks_failed(&content) {
                round_failed = true;
            }

            // Track failed edits so we force a re-read before the next attempt.
            if call.name == "edit_file"
                && (content.starts_with("ERROR:") || content.starts_with("BLOCKED:"))
            {
                if let Ok(args_val) = serde_json::from_str::<Value>(&call.arguments) {
                    let target = args_val
                        .get("target_file")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    if !target.is_empty() {
                        let abs = resolve_abs(target, config.project_path);
                        let fails = edit_fail_counts.entry(abs.clone()).or_insert(0);
                        *fails += 1;
                        file_cache.remove(&abs);
                        if *fails >= MAX_CONSECUTIVE_EDIT_FAILURES {
                            needs_reread.insert(abs);
                        } else {
                            // Even one failure: require re-read before the next edit.
                            needs_reread.insert(abs);
                        }
                    }
                }
            }

            if let Some(effect) = tool_outcome.side_effect {
                match effect {
                    SideEffect::FileRead { path, content: file_content } => {
                        let abs = resolve_abs(&path, config.project_path);
                        read_paths.insert(abs.clone());
                        file_cache.insert(abs.clone(), file_content);
                        // Re-reading unlocks another edit budget for this file.
                        edit_counts.remove(&abs);
                        edit_fail_counts.remove(&abs);
                        needs_reread.remove(&abs);
                    }
                    SideEffect::FileWritten { path, content: file_content } => {
                        wrote_files = true;
                        let abs = resolve_abs(&path, config.project_path);
                        read_paths.insert(abs.clone());
                        file_cache.insert(abs.clone(), file_content);
                        edit_fail_counts.remove(&abs);
                        needs_reread.remove(&abs);
                    }
                    SideEffect::FilesWritten { files } => {
                        wrote_files = true;
                        for (path, file_content) in files {
                            let abs = resolve_abs(&path, config.project_path);
                            read_paths.insert(abs.clone());
                            file_cache.insert(abs.clone(), file_content);
                            edit_fail_counts.remove(&abs);
                            needs_reread.remove(&abs);
                        }
                    }
                    SideEffect::FileDeleted { path } => {
                        wrote_files = true;
                        let abs = resolve_abs(&path, config.project_path);
                        read_paths.remove(&abs);
                        edit_counts.remove(&abs);
                        edit_fail_counts.remove(&abs);
                        needs_reread.remove(&abs);
                        file_cache.remove(&abs);
                    }
                    SideEffect::Finished { summary } => {
                        finished_signal = Some(summary.unwrap_or_default());
                    }
                }
            }
        }

        last_round_failed = round_failed;

        if finished_signal.is_some() {
            if last_round_failed && !incomplete_text_nudged && !config.cancel.is_cancelled() {
                incomplete_text_nudged = true;
                finished_signal = None;
                logging::info("chat", "finish after a failed tool — nudging model to recover");
                config.api_messages.push(json!({
                    "role": "user",
                    "content": "The last command failed. Do not finish yet. Recover from the error or explain the blocker, then continue the task.",
                }));
                continue;
            }
            break;
        }

        if round_had_write {
            consecutive_readonly_rounds = 0;
        } else {
            consecutive_readonly_rounds += 1;
            let hard_stop = readonly_hard_stop_after(config.mode);
            if consecutive_readonly_rounds >= hard_stop {
                logging::warn(
                    "chat",
                    &format!(
                        "Read-only thrash after {} rounds — hard-stopping turn",
                        consecutive_readonly_rounds
                    ),
                );
                final_full_response.push_str(
                    "\n<tool_result>\n[chat] Stopped after too many search/read loops. Ask me to continue with a narrower request.\n</tool_result>\n",
                );
                break;
            }
            if consecutive_readonly_rounds >= readonly_nudge_after(config.mode) && !explore_nudge_sent {
                explore_nudge_sent = true;
                logging::info("chat", "Read-only thrash — nudging model toward editing");
                config.api_messages.push(json!({
                    "role": "user",
                    "content": NUDGE_START_EDITING,
                }));
            }
        }

        if super::messages::clear_old_tool_results(config.api_messages) {
            read_coverage.clear();
        }
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
        wrote_files,
    })
}

/// Providers only need reasoning on the latest assistant turn to keep the chain of
/// thought intact. Older copies are resent verbatim on every request and, over a long
/// tool loop, become one of the largest parts of the input.
fn drop_stale_reasoning(api_messages: &mut [Value]) {
    for msg in api_messages.iter_mut() {
        if msg.get("role").and_then(|r| r.as_str()) != Some("assistant") {
            continue;
        }
        if let Some(obj) = msg.as_object_mut() {
            obj.remove("reasoning");
            obj.remove("reasoning_content");
            obj.remove("reasoning_details");
        }
    }
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
    let tag = if chunk.contains("<terminal_command") {
        ("<terminal_command", "</terminal_command>")
    } else if chunk.contains("<edit_pending") {
        ("<edit_pending", "</edit_pending>")
    } else {
        accumulated.push_str(chunk);
        return;
    };

    let Some(id) = extract_xml_attr(chunk, "id") else {
        accumulated.push_str(chunk);
        return;
    };

    let marker = format!("id=\"{}\"", id);
    let Some(marker_pos) = accumulated.rfind(&marker) else {
        accumulated.push_str(chunk);
        return;
    };

    let Some(block_start) = accumulated[..marker_pos].rfind(tag.0) else {
        accumulated.push_str(chunk);
        return;
    };

    let Some(rel_end) = accumulated[block_start..].find(tag.1) else {
        accumulated.push_str(chunk);
        return;
    };

    let block_end = block_start + rel_end + tag.1.len();
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
