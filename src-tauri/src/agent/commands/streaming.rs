/// Handles SSE streaming from OpenRouter and non-streaming completions.
///
/// This module owns the wire format between the agent and the LLM provider. It speaks
/// OpenAI-style chat completions with native function calling: the request includes a
/// `tools` array (see `tools::schema`), and the response can contain both text content
/// and structured `tool_calls`. The dispatcher (`tools::dispatch`) handles the calls and
/// the result is pushed back into the conversation as `role: "tool"` messages.
///
/// Reasoning tokens (`reasoning_content` / `reasoning` deltas) are streamed to the UI
/// wrapped in `<think>` tags but are deliberately NOT echoed back into the next request —
/// the model regenerates its own thinking each turn, matching Anthropic's ephemeral
/// thinking contract and eliminating the duplicate-think-block bug.

use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Instant;
use tauri::Emitter;
use tauri::Manager;

use crate::core::error::AppError;
use super::logging;
use super::tool_call_leak_parser::{LeakedToolCallParser, ParsedLeakCall};

pub fn completions_url() -> String {
    let base = crate::core::website_url::shape_website_base();
    format!("{}/api/ai/chat/completions", base)
}

/// Billing / usage metadata sent with every proxied LLM request.
#[derive(Debug, Clone, Default)]
pub struct ProxyContext {
    pub feature: String,
    pub turn_id: Option<String>,
    pub conversation_id: Option<String>,
    pub request_id: Option<String>,
    pub project_path: Option<String>,
}

impl ProxyContext {
    pub fn new(feature: &str) -> Self {
        Self {
            feature: feature.to_string(),
            turn_id: None,
            conversation_id: None,
            request_id: Some(uuid::Uuid::new_v4().to_string()),
            project_path: None,
        }
    }

    pub fn with_turn(mut self, turn_id: Option<String>, conversation_id: Option<String>) -> Self {
        self.turn_id = turn_id;
        self.conversation_id = conversation_id;
        self
    }

    pub fn with_project_path(mut self, project_path: Option<String>) -> Self {
        self.project_path = project_path;
        self
    }

    pub fn fresh_request(mut self) -> Self {
        self.request_id = Some(uuid::Uuid::new_v4().to_string());
        self
    }

    pub fn refresh_request_id(&mut self) {
        self.request_id = Some(uuid::Uuid::new_v4().to_string());
    }
}

pub(crate) fn emit_chat_status(app_handle: &tauri::AppHandle, payload: serde_json::Value) {
    if let Some(label) = payload
        .get("label")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
    {
        if let Some(agent_state) = app_handle.try_state::<crate::agent::models::AgentState>() {
            agent_state.set_in_flight_activity_label(Some(label));
        }
    } else if payload.get("phase").and_then(|v| v.as_str()) == Some("model")
        && payload.get("label").is_none()
    {
        if let Some(agent_state) = app_handle.try_state::<crate::agent::models::AgentState>() {
            agent_state.set_in_flight_activity_label(None);
        }
    }
    let _ = app_handle.emit("chat_status", payload);
}

pub(crate) fn emit_stream_token(
    app_handle: &tauri::AppHandle,
    proxy_ctx: &ProxyContext,
    chunk: impl Into<String>,
) {
    let chunk = chunk.into();
    if let Some(agent_state) = app_handle.try_state::<crate::agent::models::AgentState>() {
        agent_state.append_in_flight(
            &chunk,
            None,
            proxy_ctx.project_path.as_deref(),
        );
    }
    let _ = app_handle.emit(
        "chat_token",
        json!({
            "chunk": chunk,
            "turnId": proxy_ctx.turn_id,
            "conversationId": proxy_ctx.conversation_id,
        }),
    );
}

pub(crate) fn shape_proxy_request(
    client: &Client,
    api_key: &str,
    ctx: &ProxyContext,
) -> reqwest::RequestBuilder {
    let mut builder = client
        .post(completions_url())
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("X-Shape-Feature", &ctx.feature)
        .header(
            "X-Shape-Client-Version",
            crate::core::build_attestation::client_version(),
        );
    if let Some(turn_id) = &ctx.turn_id {
        builder = builder.header("X-Shape-Turn-Id", turn_id);
    }
    if let Some(conv_id) = &ctx.conversation_id {
        builder = builder.header("X-Shape-Conversation-Id", conv_id);
    }
    if let Some(request_id) = &ctx.request_id {
        builder = builder.header("X-Shape-Request-Id", request_id);
    }
    let device_id = crate::commands::device_id::get_device_id()
        .ok()
        .filter(|id| !id.is_empty())
        .unwrap_or_default();
    if !device_id.is_empty() {
        builder = builder.header("X-Shape-Device-Id", &device_id);
    }
    if let Some(attestation) =
        crate::core::build_attestation::build_attestation_header(&device_id)
    {
        builder = builder.header("X-Shape-Build-Attestation", attestation);
    }
    builder
}

fn content_delta_piece(accumulated: &str, delta_text: &str) -> String {
    if delta_text.is_empty() {
        return String::new();
    }
    if accumulated.is_empty() {
        return delta_text.to_string();
    }
    if let Some(suffix) = delta_text.strip_prefix(accumulated) {
        return suffix.to_string();
    }
    delta_text.to_string()
}

/// A single tool call accumulated from streamed deltas.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    /// Raw JSON-encoded argument string emitted by the model.
    pub arguments: String,
}

/// Outcome of one streamed assistant turn.
#[derive(Debug, Clone)]
pub struct StreamOutcome {
    pub content: String,
    pub tool_calls: Vec<ToolCall>,
    /// Finish reason from the provider (`stop`, `tool_calls`, `error`, …).
    pub finish_reason: Option<String>,
    #[allow(dead_code)]
    pub token_count: usize,
    pub input_tokens: usize,
    pub output_tokens: usize,
    /// True when any reasoning/thinking tokens were streamed this completion.
    pub had_reasoning: bool,
}

/// Stream a chat completion from OpenRouter with native tool calling.
///
/// Emits `chat_token` events to the UI for both regular content and `<think>` blocks
/// (the latter wraps streamed reasoning tokens). Returns the accumulated content,
/// any structured tool calls, and the finish reason.
pub async fn stream_chat(
    client: &Client,
    api_key: &str,
    messages: &[Value],
    tools: &[Value],
    app_handle: &tauri::AppHandle,
    token: tokio_util::sync::CancellationToken,
    model: &str,
    proxy_ctx: &ProxyContext,
) -> Result<StreamOutcome, AppError> {
    logging::info(
        "stream",
        &format!(
            "Starting stream: model={}, messages={}, tools={}",
            model,
            messages.len(),
            tools.len()
        ),
    );

    let max_tokens = get_model_max_tokens(model);
    logging::debug("stream", &format!("Using max_tokens={} for model={}", max_tokens, model));

    let mut body = json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "max_tokens": max_tokens,
    });

    // Sticky routing + prompt caching: pinning the provider per conversation lets
    // OpenRouter reuse the cached prompt prefix across the many round-trips of a
    // single agent turn (system prompt + tool schemas + earlier messages), which is
    // the bulk of the input-token cost.
    if let Some(session) = proxy_ctx
        .conversation_id
        .as_ref()
        .or(proxy_ctx.turn_id.as_ref())
    {
        body["session_id"] = json!(session);
    }
    // Anthropic requires an explicit cache marker; OpenRouter's top-level
    // `cache_control` enables automatic breakpoint placement for multi-turn chats.
    if model.starts_with("anthropic/") {
        body["cache_control"] = json!({ "type": "ephemeral" });
    }

    // OpenRouter leaves Gemini thinking off unless requested. Without this, Flash
    // dumps plans into normal `content` instead of the reasoning channel (think UI).
    if let Some(reasoning) = reasoning_config_for_model(model) {
        body["reasoning"] = reasoning;
    }

    if !tools.is_empty() {
        body["tools"] = json!(tools);
        body["tool_choice"] = json!("auto");
        // Parallel tool calls are intentionally enabled (provider default): forcing
        // serial calls made the agent burn one full prompt round-trip per tool call.
        // The turn loop executes every returned call before the next request.
    }

    let mut retry_strategy = backoff::ExponentialBackoff::default();
    retry_strategy.max_elapsed_time = Some(std::time::Duration::from_secs(30));

    let resp = backoff::future::retry(retry_strategy, || async {
        if token.is_cancelled() {
            return Err(backoff::Error::Permanent(AppError::Message(
                "Cancelled".to_string(),
            )));
        }
        shape_proxy_request(client, api_key, proxy_ctx)
            .header("HTTP-Referer", "https://shape-ide.local")
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                logging::warn("stream", &format!("Request failed (will retry): {}", e));
                backoff::Error::transient(AppError::Network(e))
            })
    })
    .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        logging::error(
            "stream",
            &format!(
                "API error {}: {}",
                status,
                &text[..text.floor_char_boundary(500)]
            ),
        );

        // Capability detection: some models on OpenRouter don't support function calling.
        // The provider responds 400 with a body that mentions "tool" / "function" support.
        // Surface a clear user-facing error so they switch models rather than seeing a
        // raw JSON error blob.
        if status.as_u16() == 400 && !tools.is_empty() {
            let lower = text.to_lowercase();
            let mentions_tools = lower.contains("tool")
                || lower.contains("function")
                || lower.contains("does not support");
            if mentions_tools {
                return Err(AppError::Message(format!(
                    "The model '{}' does not support tool/function calling, which Shape requires. Switch to a tool-capable model such as `anthropic/claude-sonnet-4`, `openai/gpt-5`, or `google/gemini-2.5-pro` in the model picker, then try again.",
                    model
                )));
            }
        }

        return Err(AppError::Message(format!(
            "OpenRouter API error {}: {}",
            status,
            &text[..text.floor_char_boundary(800)]
        )));
    }

    logging::debug("stream", "SSE stream connected");
    emit_chat_status(
        app_handle,
        serde_json::json!({ "phase": "model", "label": "Generating" }),
    );

    let mut stream = resp.bytes_stream();
    let mut content = String::new();
    let mut buffer = String::new();
    let mut token_buffer = String::new();
    let mut last_emit = Instant::now();
    let mut token_count: usize = 0;
    let mut input_tokens: usize = 0;
    let mut output_tokens: usize = 0;
    let mut in_thinking = false;
    let mut had_reasoning = false;
    let mut finish_reason: Option<String> = None;
    // When tools are available, buffer normal content until we know whether this
    // completion also issued tool calls. Models (esp. Gemini) often narrate into
    // `content` while thinking+tooling — that chatter belongs out of the reply.
    let defer_content_emit = !tools.is_empty();
    let mut deferred_content = String::new();

    // Tool calls are streamed as deltas keyed by `index`. We accumulate by index.
    let mut tool_call_buf: Vec<ToolCallAccumulator> = Vec::new();
    let mut leak_parser = LeakedToolCallParser::new();
    let mut leaked_calls: Vec<ParsedLeakCall> = Vec::new();
    let mut announced_tool_name: Option<String> = None;

    while let Some(chunk_result) = stream.next().await {
            if token.is_cancelled() {
            logging::info("stream", "Cancelled by user during stream");
            // Don't flush deferred mid-tool narration into the reply on cancel.
            if !defer_content_emit && !token_buffer.is_empty() {
                emit_stream_token(app_handle, proxy_ctx, token_buffer);
            }
            return Ok(StreamOutcome {
                content,
                tool_calls: finalize_tool_calls(tool_call_buf),
                finish_reason,
                token_count,
                input_tokens,
                output_tokens,
                had_reasoning,
            });
        }

        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                // Proxied SSE often closes the body right after `data: [DONE]`; reqwest may
                // surface that as a decode/read error even though the turn is complete.
                if finish_reason.is_some()
                    || !tool_call_buf.is_empty()
                    || !content.is_empty()
                    || token_count > 0
                {
                    logging::warn(
                        "stream",
                        &format!(
                            "Stream body closed after usable data (ignoring): {}",
                            e
                        ),
                    );
                    break;
                }
                return Err(AppError::Network(e));
            }
        };
        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        while let Some(newline_pos) = buffer.find('\n') {
            if token.is_cancelled() {
                if !defer_content_emit && !token_buffer.is_empty() {
                    emit_stream_token(app_handle, proxy_ctx, token_buffer);
                }
                return Ok(StreamOutcome {
                    content,
                    tool_calls: finalize_tool_calls(tool_call_buf),
                    finish_reason,
                    token_count,
                    input_tokens,
                    output_tokens,
                    had_reasoning,
                });
            }
            let line = buffer[..newline_pos].trim().to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            let Some(data) = line.strip_prefix("data: ") else { continue };
            if data.trim() == "[DONE]" {
                continue;
            }

            let parsed: Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => {
                    logging::warn(
                        "stream",
                        &format!("Failed to parse SSE data: {}", &data[..data.len().min(200)]),
                    );
                    continue;
                }
            };

            if let Some(err) = parsed.get("error") {
                let err_msg = err
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("Unknown streaming error");
                logging::error("stream", &format!("Stream error from API: {}", err_msg));
                // Reasoning-only chunks must not mask a hard provider error — otherwise
                // the turn falls through to a tool-less "synthesis" that invents answers.
                return Err(AppError::Message(format!("Model error: {}", err_msg)));
            }

            if let Some(usage) = parsed.get("usage") {
                if let Some(prompt) = usage.get("prompt_tokens").and_then(|v| v.as_u64()) {
                    input_tokens = prompt as usize;
                }
                if let Some(completion) = usage.get("completion_tokens").and_then(|v| v.as_u64()) {
                    output_tokens = completion as usize;
                }
            }

            let delta = match parsed.get("choices").and_then(|c| c.get(0)) {
                Some(choice) => &choice["delta"],
                None => continue,
            };

            if let Some(text) = delta["content"].as_str() {
                if !text.is_empty() {
                    if in_thinking {
                        let close = "</think>\n\n";
                        token_buffer.push_str(close);
                        in_thinking = false;
                    }
                    let piece = content_delta_piece(&content, text);
                    if !piece.is_empty() {
                        let (clean, mut parsed) = leak_parser.push(&piece);
                        leaked_calls.append(&mut parsed);
                        if !clean.is_empty() {
                            content.push_str(&clean);
                            if defer_content_emit {
                                deferred_content.push_str(&clean);
                            } else {
                                token_buffer.push_str(&clean);
                            }
                            token_count += 1;
                        }
                    }
                }
            }

            let reasoning = delta["reasoning_content"]
                .as_str()
                .or_else(|| delta["reasoning"].as_str());
            if let Some(reasoning_text) = reasoning {
                if !reasoning_text.is_empty() {
                    had_reasoning = true;
                    if !in_thinking {
                        token_buffer.push_str("<think>");
                        in_thinking = true;
                    }
                    token_buffer.push_str(reasoning_text);
                    token_count += 1;
                }
            }

            if let Some(tool_calls) = delta["tool_calls"].as_array() {
                for tc in tool_calls {
                    let index = tc["index"].as_u64().unwrap_or(0) as usize;
                    while tool_call_buf.len() <= index {
                        tool_call_buf.push(ToolCallAccumulator::default());
                    }
                    let slot = &mut tool_call_buf[index];

                    if let Some(id) = tc["id"].as_str() {
                        if slot.id.is_empty() {
                            slot.id = id.to_string();
                        }
                    }
                    if let Some(name) = tc["function"]["name"].as_str() {
                        if slot.name.is_empty() {
                            slot.name = name.to_string();
                        }
                    }
                    if let Some(args) = tc["function"]["arguments"].as_str() {
                        slot.arguments.push_str(args);
                    }
                }

                // Long tool-arg streams (esp. render_design_previews) produce no chat tokens.
                let primary = tool_call_buf
                    .iter()
                    .find(|t| !t.name.is_empty())
                    .cloned();
                if let Some(primary) = primary {
                    let name = primary.name.clone();
                    let should_announce = announced_tool_name.as_deref() != Some(name.as_str());
                    if should_announce {
                        announced_tool_name = Some(name.clone());
                        let label = if name == "render_design_previews" {
                            "Creating designs".to_string()
                        } else {
                            let pretty = name.replace('_', " ");
                            let mut chars = pretty.chars();
                            match chars.next() {
                                None => pretty,
                                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                            }
                        };
                        emit_chat_status(
                            app_handle,
                            json!({
                                "phase": "tool",
                                "tool": name,
                                "label": label,
                            }),
                        );
                    }
                }
            }

            if let Some(finish) = parsed
                .get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c| c.get("finish_reason"))
                .and_then(|v| v.as_str())
            {
                if !finish.is_empty() {
                    if in_thinking {
                        let close = "</think>\n\n";
                        token_buffer.push_str(close);
                        in_thinking = false;
                    }
                    // Some providers (via OpenRouter) send a duplicate finish chunk —
                    // the second one is empty except for usage. Keep the first reason.
                    if finish_reason.is_none() {
                        logging::debug("stream", &format!("Finish reason: {}", finish));
                        finish_reason = Some(finish.to_string());
                    }
                }
            }

            if !token_buffer.is_empty() && last_emit.elapsed().as_millis() >= 40 {
                emit_stream_token(app_handle, proxy_ctx, token_buffer.clone());
                token_buffer.clear();
                last_emit = Instant::now();
            }
        }
    }

    if in_thinking {
        token_buffer.push_str("</think>\n\n");
    }
    if !token_buffer.is_empty() {
        emit_stream_token(app_handle, proxy_ctx, token_buffer);
    }

    let (final_clean, mut final_leaked) = leak_parser.finalize();
    leaked_calls.append(&mut final_leaked);
    if !final_clean.is_empty() {
        content.push_str(&final_clean);
        if defer_content_emit {
            deferred_content.push_str(&final_clean);
        } else {
            emit_stream_token(app_handle, proxy_ctx, final_clean);
        }
    }

    let structured_calls = finalize_tool_calls(tool_call_buf);
    let tool_calls = if leaked_calls.is_empty() || !structured_calls.is_empty() {
        structured_calls
    } else {
        leaked_calls
            .into_iter()
            .filter(|a| !a.name.is_empty())
            .enumerate()
            .map(|(i, a)| ToolCall {
                id: if a.id.is_empty() {
                    format!("call_{}", i)
                } else {
                    a.id
                },
                name: a.name,
                arguments: if a.arguments.is_empty() {
                    "{}".to_string()
                } else {
                    a.arguments
                },
            })
            .collect()
    };

    // Flush deferred reply text only when this completion is the user-facing answer
    // (no tool calls). Mid-tool narration stays in `content` for the API, not the UI.
    if defer_content_emit && !deferred_content.is_empty() && tool_calls.is_empty() {
        emit_stream_token(app_handle, proxy_ctx, deferred_content);
    } else if defer_content_emit && !tool_calls.is_empty() && !content.is_empty() {
        logging::debug(
            "stream",
            &format!(
                "Suppressed {} chars of mid-tool narration from reply UI",
                content.len()
            ),
        );
    }

    if !tool_calls.is_empty()
        && finish_reason.as_deref() == Some("stop")
    {
        finish_reason = Some("tool_calls".to_string());
    }
    let (final_input, final_output) = if input_tokens > 0 || output_tokens > 0 {
        (input_tokens, output_tokens)
    } else {
        (token_count / 3, token_count.saturating_sub(token_count / 3))
    };
    logging::info(
        "stream",
        &format!(
            "Stream complete. {} chunks, {} in / {} out tokens, {} chars, {} tool_calls",
            token_count,
            final_input,
            final_output,
            content.len(),
            tool_calls.len()
        ),
    );

    if finish_reason.as_deref() == Some("length")
        && content.trim().is_empty()
        && tool_calls.is_empty()
    {
        logging::warn(
            "stream",
            "Model hit output length limit with no usable content or tool calls",
        );
        emit_chat_status(
            app_handle,
            serde_json::json!({
                "phase": "model",
                "label": "Hit output limit — retrying",
            }),
        );
    }

    Ok(StreamOutcome {
        content,
        tool_calls,
        finish_reason,
        token_count,
        input_tokens: final_input,
        output_tokens: final_output,
        had_reasoning,
    })
}

/// Stream with one automatic retry on a completely empty response.
///
/// OpenRouter occasionally returns a 200 with zero content and zero tool_calls (transient
/// upstream hiccup). The pre-refactor code treated this as "model is done" and silently
/// ended the conversation — masking the failure. We retry once before bubbling up.
pub async fn stream_chat_with_retry(
    client: &Client,
    api_key: &str,
    messages: &[Value],
    tools: &[Value],
    app_handle: &tauri::AppHandle,
    token: tokio_util::sync::CancellationToken,
    model: &str,
    proxy_ctx: &ProxyContext,
) -> Result<StreamOutcome, AppError> {
    let first = stream_chat(
        client,
        api_key,
        messages,
        tools,
        app_handle,
        token.clone(),
        model,
        proxy_ctx,
    )
    .await?;
    if !first.content.trim().is_empty()
        || !first.tool_calls.is_empty()
        || first.had_reasoning
        || first.output_tokens > 0
    {
        return Ok(first);
    }
    if token.is_cancelled() {
        return Ok(first);
    }
    logging::warn(
        "stream",
        "Empty response received, retrying once before bailing",
    );
    let second = stream_chat(
        client,
        api_key,
        messages,
        tools,
        app_handle,
        token,
        model,
        proxy_ctx,
    )
    .await?;
    Ok(second)
}

#[derive(Default, Clone)]
pub(crate) struct ToolCallAccumulator {
    id: String,
    name: String,
    arguments: String,
}

fn finalize_tool_calls(buf: Vec<ToolCallAccumulator>) -> Vec<ToolCall> {
    buf.into_iter()
        .filter(|a| !a.name.is_empty())
        .enumerate()
        .map(|(i, a)| ToolCall {
            id: if a.id.is_empty() {
                format!("call_{}", i)
            } else {
                a.id
            },
            name: a.name,
            arguments: if a.arguments.is_empty() {
                "{}".to_string()
            } else {
                a.arguments
            },
        })
        .collect()
}

/// Simple wrapper for non-streaming calls (title generation, commit messages, fast-apply).
pub async fn complete_chat(
    client: &Client,
    api_key: &str,
    prompt: &str,
    model: &str,
    proxy_ctx: &ProxyContext,
) -> Result<String, AppError> {
    logging::debug(
        "complete",
        &format!("Non-streaming call: model={}, prompt_len={}", model, prompt.len()),
    );

    let body = json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 30,
    });

    let resp = shape_proxy_request(client, api_key, proxy_ctx)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Message(format!("Title gen failed: {}", e)))?;

    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("New Chat")
        .trim()
        .trim_matches('"')
        .to_string();

    logging::debug(
        "complete",
        &format!("Result: {}", &content[..content.floor_char_boundary(80)]),
    );
    Ok(content)
}

pub async fn complete_chat_with_max_tokens(
    client: &Client,
    api_key: &str,
    message: &str,
    model: &str,
    max_tokens: u32,
    proxy_ctx: &ProxyContext,
) -> Result<(String, usize, usize), AppError> {
    let body = json!({
        "model": model,
        "messages": [{"role": "user", "content": message}],
        "max_tokens": max_tokens,
    });

    let resp = shape_proxy_request(client, api_key, proxy_ctx)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Message(format!("Completion failed: {}", e)))?;

    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .trim_matches('"')
        .to_string();
    let input_tokens = json["usage"]["prompt_tokens"].as_u64().unwrap_or(0) as usize;
    let output_tokens = json["usage"]["completion_tokens"].as_u64().unwrap_or(0) as usize;
    Ok((content, input_tokens, output_tokens))
}

/// Returns appropriate max_tokens for a given model to avoid credit waste.
/// Premium/large models get higher limits; fast/nano models get lower limits.
fn get_model_max_tokens(model: &str) -> u32 {
    // Design previews stream large JSX tool args; 8k truncates mid-call and forces retries.
    match model {
        m if m.contains("opus") => 16384,
        m if m.contains("gpt-5") && !m.contains("nano") => 16384,
        m if m.contains("sonnet") => 16384,
        m if m.contains("gemini-2.5-pro") => 16384,
        m if m.contains("nano") => 12288,
        m if m.contains("flash") => 12288,
        _ => 16384,
    }
}

/// OpenRouter reasoning config so thinking-capable models stream into the
/// `reasoning` channel (Shape `<think>` UI) instead of dumping plans into content.
fn reasoning_config_for_model(model: &str) -> Option<Value> {
    let m = model.to_lowercase();
    if m.contains("gemini") {
        // Gemini 2.5 uses thinkingBudget via max_tokens; -1 = dynamic.
        Some(json!({ "max_tokens": 8192 }))
    } else if m.contains("anthropic/") || m.contains("claude") {
        Some(json!({ "effort": "medium" }))
    } else if m.contains("gpt-5") && !m.contains("nano") {
        Some(json!({ "effort": "low" }))
    } else if m.contains("o1") || m.contains("o3") || m.contains("o4") {
        Some(json!({ "effort": "medium" }))
    } else {
        None
    }
}
