pub mod adversarial_review;
pub mod checkpoints;
pub mod history;
pub mod indexing;
pub mod journals;
pub mod logging;
pub mod mcp_cmds;
pub mod messages;
pub mod run_turn;
pub mod streaming;
pub mod terminal;
pub mod tool_call_leak_parser;

use reqwest::Client;
use serde_json::json;
use tauri::{Emitter, Manager};

use super::context::{build_context_with_options, context_options_for_query};
use super::models::{AgentState, ChatMessage};
use super::prompts;
use super::tools::schema;
use crate::agent::model_router;
use crate::app_state::AppState;
use crate::commands::git;
use crate::commands::preview_render::PreviewCaptureState;
use crate::commands::pty::PtyState;
use crate::core::error::AppError;

use history::now_f64;

const MODEL_DEFAULT: &str = "anthropic/claude-sonnet-4.6";
const MODEL_TITLE_GEN: &str = model_router::MODEL_FAST;
const MAX_TOOL_LOOPS: usize = run_turn::MAX_TOOL_LOOPS;

#[tauri::command]
pub async fn send_chat_message(
    message: String,
    model: Option<String>,
    mode: Option<String>,
    custom_system_prompt: Option<String>,
    custom_rules: Option<String>,
    access_token: Option<String>,
    _design_options: Option<crate::commands::preview_render::DesignAgentOptions>,
    review_adversarial_enabled: Option<bool>,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
    index_state: tauri::State<'_, crate::agent::index::IndexState>,
    mcp_state: tauri::State<'_, crate::mcp::McpState>,
    pty_state: tauri::State<'_, PtyState>,
    app_handle: tauri::AppHandle,
) -> Result<String, AppError> {
    let auth_token = access_token.filter(|t| !t.trim().is_empty()).ok_or_else(|| {
        AppError::Env("Sign in to Shape to use AI chat.".to_string())
    })?;

    let client = Client::new();
    let current_proj_path = app_state.0.lock()?.project_path.clone();

    let raw_model = model.unwrap_or_else(|| MODEL_DEFAULT.to_string());
    let selected_auto = model_router::is_auto_selection(&raw_model);
    let model_to_use = model_router::normalize_model(&raw_model);
    let mode_to_use = mode.unwrap_or_else(|| "Ask".to_string());

    logging::info(
        "chat",
        &format!(
            "send_chat_message: model={} (selected={}), mode={}, msg_len={}",
            model_to_use,
            if selected_auto { "auto" } else { &raw_model },
            mode_to_use,
            message.len()
        ),
    );

    // Case-insensitive so "visual" / "Visual" (and legacy "design") both attach DESIGN.md.
    let mode_prompt = match mode_to_use.to_ascii_lowercase().as_str() {
        "plan" => prompts::PLAN_MD,
        "visual" | "design" => prompts::DESIGN_MD,
        "review" => prompts::REVIEW_MD,
        _ => "",
    };
    if matches!(
        mode_to_use.to_ascii_lowercase().as_str(),
        "visual" | "design"
    ) {
        logging::info(
            "chat",
            &format!(
                "Visual mode: attaching DESIGN.md ({} chars) to system prompt",
                prompts::DESIGN_MD.len()
            ),
        );
    }

    // Project switching: clear history when the user opens a different project.
    {
        let mut active_proj = state.current_project.lock()?;
        if *active_proj != current_proj_path {
            logging::info(
                "chat",
                &format!("Project switched from {:?} to {:?}", active_proj, current_proj_path),
            );
            if let Some(old_path) = active_proj.as_ref() {
                let _ = history::save_current_conversation(&state, old_path);
            }
            state.history.lock()?.clear();
            state.title.lock()?.take();
            *state.history_summary.lock()? = None;
            *state.current_conversation_id.lock()? = None;
            state.clear_design_preview_state();
            state.clear_file_checkpoints();
            *active_proj = current_proj_path.clone();
        }
    }

    {
        let mut hist = state.history.lock()?;
        hist.push(ChatMessage {
            role: "user".to_string(),
            content: message.clone(),
            timestamp: now_f64(),
            stats: None,
            model: Some(model_to_use.clone()),
        });
    }

    // Promote draft chats immediately (id + title) so switching away mid-generation
    // cannot drop the conversation while the backend is still working.
    let owned_conversation_id = {
        let mut guard = state.current_conversation_id.lock()?;
        if guard.is_none() {
            *guard = Some(format!("{}", now_f64() as u64));
        }
        guard.clone().expect("conversation id just ensured")
    };

    let turn_id = uuid::Uuid::new_v4().to_string();
    let conversation_id = Some(owned_conversation_id.clone());
    state.reset_turn_meter();
    if !state.try_begin_in_flight(turn_id.clone(), Some(owned_conversation_id.clone())) {
        // Roll back the optimistic user message we just pushed.
        if let Ok(mut hist) = state.history.lock() {
            if hist
                .last()
                .map(|m| m.role == "user" && m.content == message)
                .unwrap_or(false)
            {
                hist.pop();
            }
        }
        return Err(AppError::Message(
            "A generation is already in progress. Stop it or wait before sending another message."
                .to_string(),
        ));
    }

    if let Some(ref project) = current_proj_path {
        crate::commands::stats::bump_event(project, "ai_chat_turns");
    }

    journals::save_turn_journal(&journals::TurnJournal {
        conversation_id: owned_conversation_id.clone(),
        turn_id: turn_id.clone(),
        project_path: state.current_project.lock().ok().and_then(|p| p.clone()),
        status: "running".to_string(),
        updated_at: now_f64(),
        subagent_ids: Vec::new(),
        note: None,
    });

    // Fresh cancel token for this turn (covers title gen + agent loop).
    let cancel = {
        let mut t = state
            .cancellation_token
            .lock()
            .map_err(|e| AppError::Poison(e.to_string()))?;
        *t = tokio_util::sync::CancellationToken::new();
        t.clone()
    };

    let needs_title = state.title.lock()?.is_none();
    let provisional_title = if needs_title {
        let provisional = title_from_message(&message);
        *state.title.lock()? = Some(provisional.clone());
        provisional
    } else {
        state
            .title
            .lock()?
            .clone()
            .unwrap_or_else(|| title_from_message(&message))
    };

    let _ = app_handle.emit(
        "chat_title",
        json!({
            "title": &provisional_title,
            "conversationId": &owned_conversation_id,
        }),
    );
    let _ = app_handle.emit(
        "chat_started",
        json!({
            "turnId": &turn_id,
            "conversationId": &owned_conversation_id,
            "title": &provisional_title,
        }),
    );
    if let Some(path) = &current_proj_path {
        let _ = history::save_current_conversation(&state, path);
    }

    let mut owned_title = provisional_title.clone();

    if needs_title {
        streaming::emit_chat_status(
            &app_handle,
            json!({ "phase": "title", "label": "Naming chat…" }),
        );
        logging::debug("chat", "Generating title before agent turn");
        let raw_title = streaming::complete_chat(
            &client,
            &auth_token,
            &format!(
                "Write a short chat title (2-5 words) for a coding assistant conversation that starts with this message. Use nouns and verbs from the user's intent, not filler words like \"and\", \"tell\", or \"please\". Reply with only the title.\n\nUser message: {}",
                message
            ),
            MODEL_TITLE_GEN,
            &streaming::ProxyContext::new("title")
                .with_turn(Some(turn_id.clone()), Some(owned_conversation_id.clone())),
        )
        .await
        .ok();
        // Only Stop (cancel token) aborts — switching chats keeps the turn running.
        if cancel.is_cancelled() {
            state.clear_in_flight_if(&turn_id);
            let _ = app_handle.emit(
                "chat_complete",
                json!({
                    "model": model_to_use,
                    "turnId": &turn_id,
                    "conversationId": &owned_conversation_id,
                }),
            );
            return Ok(String::new());
        }
        let title = raw_title
            .map(|t| sanitize_generated_title(&t, &message))
            .unwrap_or_else(|| title_from_message(&message));
        owned_title = title.clone();
        let still_viewing = state.current_conversation_id.lock()?.as_deref()
            == Some(owned_conversation_id.as_str());
        if still_viewing {
            *state.title.lock()? = Some(title.clone());
        } else if let Some(path) = &current_proj_path {
            // Update the background conversation's title without touching the live chat.
            let hist = {
                let convs = state.conversations.lock()?;
                convs
                    .get(path)
                    .and_then(|list| list.iter().find(|c| c.id == owned_conversation_id))
                    .map(|c| c.history.clone())
                    .unwrap_or_default()
            };
            if !hist.is_empty() {
                let _ = history::upsert_conversation_snapshot(
                    &state,
                    path,
                    &owned_conversation_id,
                    &title,
                    hist,
                );
            }
        }
        let _ = app_handle.emit(
            "chat_title",
            json!({
                "title": &title,
                "conversationId": &owned_conversation_id,
            }),
        );
        if still_viewing {
            if let Some(path) = &current_proj_path {
                let _ = history::save_current_conversation(&state, path);
            }
        }
    }

    index_state.set_api_context(
        Some(auth_token.clone()),
        Some(turn_id.clone()),
        conversation_id.clone(),
    );
    let proxy_base = streaming::ProxyContext::new("chat")
        .with_turn(Some(turn_id.clone()), conversation_id.clone())
        .with_project_path(current_proj_path.clone());

    let (context_string, _active_file, _project_root) = build_context_with_options(
        &app_state,
        context_options_for_query(message.clone(), (*index_state).clone()),
    )
    .await?;
    logging::debug("chat", &format!("Context built: {} chars", context_string.len()));

    let mut prompt_parts = vec![prompts::SYSTEM_MD.to_string()];
    if let Some(rules) = custom_rules.as_ref().filter(|s| !s.trim().is_empty()) {
        prompt_parts.push(format!("\n<user_rules>\n{}\n</user_rules>", rules.trim()));
    }
    if !mode_prompt.is_empty() {
        prompt_parts.push(mode_prompt.to_string());
    }
    if matches!(
        mode_to_use.to_ascii_lowercase().as_str(),
        "visual" | "design"
    ) {
        // No design-options UI anymore — always start a sandbox session for optional previews.
        state.begin_design_turn(None, &message);
    }
    if let Some(custom) = custom_system_prompt.as_ref().filter(|s| !s.trim().is_empty()) {
        prompt_parts.push(format!("\n<custom_instructions>\n{}\n</custom_instructions>", custom.trim()));
    }

    let final_system_prompt = format!(
        "{}\n\nCURRENT CONTEXT:\n{}",
        prompt_parts.join("\n"),
        context_string
    );

    let history_snapshot = {
        let mut snapshot = state.history.lock()?.clone();
        if messages::history_char_count(&snapshot) > messages::HISTORY_CHAR_BUDGET {
            let existing = state.history_summary.lock()?.clone();
            let middle = messages::slice_for_compression(&snapshot);
            if !middle.is_empty() {
                let prompt = format!(
                    "Summarize this coding assistant conversation for future context. Preserve goals, decisions, files changed, errors fixed, and what the user is working on now. Be concise.\n\n{}",
                    middle
                );
                if let Ok(summary) = streaming::complete_chat(
                    &client,
                    &auth_token,
                    &prompt,
                    MODEL_TITLE_GEN,
                    &proxy_base
                        .clone()
                        .with_turn(Some(turn_id.clone()), conversation_id.clone()),
                )
                .await
                {
                    let merged = match existing {
                        Some(prev) => format!("{}\n\n{}", prev, summary),
                        None => summary,
                    };
                    *state.history_summary.lock()? = Some(merged.clone());
                    snapshot = messages::apply_summary(&snapshot, Some(&merged));
                    logging::info("chat", "Compressed older chat history into summary");
                    let _ = app_handle.emit(
                        "chat_context_summarized",
                        json!({ "conversationId": conversation_id }),
                    );
                }
            } else if let Some(ref s) = existing {
                snapshot = messages::apply_summary(&snapshot, Some(s));
                let _ = app_handle.emit(
                    "chat_context_summarized",
                    json!({ "conversationId": conversation_id }),
                );
            }
        }
        snapshot
    };
    let mut api_messages =
        messages::build_messages_json(&final_system_prompt, &messages::build_api_history(&history_snapshot), &model_to_use);

    let mcp_tools = mcp_state.tools_as_openai_schema().unwrap_or_default();
    let tools = schema::tools_for_mode(&mode_to_use, mcp_tools);

    let project_path = current_proj_path.clone().unwrap_or_default();
    if !project_path.is_empty() && index_state.should_background_index(&project_path) {
        let _ = index_state.spawn_background_index(app_handle.clone(), project_path.clone());
    }

    if cancel.is_cancelled() {
        state.clear_in_flight_if(&turn_id);
        let _ = app_handle.emit(
            "chat_complete",
            json!({
                "model": model_to_use,
                "turnId": &turn_id,
                "conversationId": &owned_conversation_id,
            }),
        );
        if let Some(path) = &current_proj_path {
            let _ = history::save_current_conversation(&state, path);
        }
        return Ok(String::new());
    }

    let start_time = std::time::Instant::now();

    let turn_outcome = match run_turn::run_agent_turn(run_turn::AgentTurnConfig {
        client: &client,
        api_key: &auth_token,
        api_messages: &mut api_messages,
        tools: &tools,
        model: &model_to_use,
        mode: &mode_to_use,
        project_path: &project_path,
        app_handle: &app_handle,
        agent_state: &*state,
        index_state: Some(&*index_state),
        mcp_state: Some(&*mcp_state),
        pty_state: Some(&*pty_state),
        cancel: cancel.clone(),
        proxy_ctx: proxy_base.clone(),
        max_loops: MAX_TOOL_LOOPS,
        emit_complete: true,
    })
    .await
    {
        Ok(outcome) => outcome,
        Err(e) => {
            state.clear_in_flight_if(&turn_id);
            // Always release the UI: without this a failed turn left the frontend
            // waiting for a chat_complete that never arrived.
            let _ = app_handle.emit(
                "chat_complete",
                json!({
                    "error": e.to_string(),
                    "model": model_to_use,
                    "turnId": &turn_id,
                    "conversationId": &owned_conversation_id,
                }),
            );
            return Err(e);
        }
    };

    let mut final_full_response = turn_outcome.response_text;
    let loop_count = turn_outcome.loop_count;
    let interrupt_error = turn_outcome.interrupt_error;

    if mode_to_use.eq_ignore_ascii_case("review")
        && review_adversarial_enabled.unwrap_or(true)
        && adversarial_review::should_run(&final_full_response)
    {
        streaming::emit_chat_status(
            &app_handle,
            json!({ "phase": "review", "label": "Adversarial review…" }),
        );
        match adversarial_review::run_adversarial_review(
            &client,
            &auth_token,
            &final_full_response,
            &project_path,
            &proxy_base,
        )
        .await
        {
            Ok(debate_chunk) if !debate_chunk.trim().is_empty() => {
                final_full_response.push_str(&debate_chunk);
                let _ = app_handle.emit(
                    "chat_token",
                    json!({
                        "chunk": debate_chunk,
                        "turnId": &turn_id,
                        "conversationId": &owned_conversation_id,
                    }),
                );
            }
            Err(e) => {
                logging::warn("review", &format!("Adversarial review failed: {e}"));
            }
            _ => {}
        }
    }
    let (total_input_tokens, total_output_tokens) = state.turn_meter_totals();
    let billed_tokens = total_input_tokens + total_output_tokens;
    let duration_ms = start_time.elapsed().as_millis() as f64;
    let cost_per_token = estimate_cost_per_token(&model_to_use);
    let estimated_cost = (billed_tokens as f64) * cost_per_token;

    let used_auto = selected_auto;
    let credits_charged = if used_auto {
        None
    } else {
        Some(estimate_credits_charged(total_input_tokens, total_output_tokens))
    };

    let assistant_message = ChatMessage {
        role: "assistant".to_string(),
        content: final_full_response.clone(),
        timestamp: now_f64(),
        stats: Some(super::models::MessageStats {
            time_ms: duration_ms,
            cost: estimated_cost,
            tokens: billed_tokens,
            input_tokens: total_input_tokens,
            output_tokens: total_output_tokens,
            credits_charged,
            used_auto: Some(used_auto),
        }),
        model: Some(model_to_use.clone()),
    };

    let still_current = {
        let current = state.current_conversation_id.lock()?.clone();
        current.as_deref() == Some(owned_conversation_id.as_str())
    };
    let still_this_turn = state.in_flight_turn_id().as_deref() == Some(turn_id.as_str());
    let was_cancelled = cancel.is_cancelled();

    logging::info(
        "chat",
        &format!(
            "Response complete: {} chars, {} tool loops, {} tokens ({} in / {} out){}",
            final_full_response.len(),
            loop_count,
            billed_tokens,
            total_input_tokens,
            total_output_tokens,
            if was_cancelled { " (cancelled)" } else { "" }
        ),
    );

    // Stopped / restored turns must not append — history may already be truncated.
    if still_current && still_this_turn && !was_cancelled {
        {
            let mut hist = state.history.lock()?;
            hist.push(assistant_message);
        }

        let _ = app_handle.emit(
            "chat_complete",
            json!({
                "stats": {
                    "timeMs": duration_ms,
                    "cost": estimated_cost,
                    "tokens": billed_tokens,
                    "inputTokens": total_input_tokens,
                    "outputTokens": total_output_tokens,
                    "creditsCharged": credits_charged,
                    "usedAuto": used_auto,
                },
                "model": model_to_use,
                "turnId": &turn_id,
                "conversationId": &owned_conversation_id,
                "error": interrupt_error,
            }),
        );

        maybe_regenerate_title(
            &state,
            &client,
            &auth_token,
            &turn_id,
            conversation_id.as_deref(),
        )
        .await;

        if let Some(path) = &current_proj_path {
            let _ = history::save_current_conversation(&state, path);
        }
    } else if still_this_turn && !was_cancelled {
        // User started a new chat or switched conversations while this turn was
        // finishing — persist under the original id without touching live state.
        logging::info(
            "chat",
            "Turn finished after conversation switch — persisting to original conversation only",
        );
        if let Some(path) = &current_proj_path {
            let mut hist = {
                let convs = state.conversations.lock()?;
                convs
                    .get(path)
                    .and_then(|list| list.iter().find(|c| c.id == owned_conversation_id))
                    .map(|c| c.history.clone())
                    .unwrap_or_default()
            };
            if hist
                .last()
                .map(|m| m.role == "assistant" && m.content == final_full_response)
                .unwrap_or(false)
            {
                // already saved via in-flight merge
            } else {
                hist.push(assistant_message);
            }
            let _ = history::upsert_conversation_snapshot(
                &state,
                path,
                &owned_conversation_id,
                &owned_title,
                hist,
            );
        }
        // Release any UI still keyed to this turn (e.g. agent window that did not switch).
        let _ = app_handle.emit(
            "chat_complete",
            json!({
                "model": model_to_use,
                "turnId": &turn_id,
                "conversationId": &owned_conversation_id,
                "error": interrupt_error,
            }),
        );
    } else if still_this_turn {
        // Cancelled (Stop / Redo / Restore) — keep any streamed tool/UI transcript so
        // Stop does not wipe the assistant message the user was looking at.
        if !final_full_response.trim().is_empty() {
            {
                let mut hist = state.history.lock()?;
                let already = hist
                    .last()
                    .map(|m| m.role == "assistant" && m.content == final_full_response)
                    .unwrap_or(false);
                if !already {
                    hist.push(assistant_message);
                }
            }
            if let Some(path) = &current_proj_path {
                let _ = history::save_current_conversation(&state, path);
            }
        }
        let _ = app_handle.emit(
            "chat_complete",
            json!({
                "stats": {
                    "timeMs": duration_ms,
                    "cost": estimated_cost,
                    "tokens": billed_tokens,
                    "inputTokens": total_input_tokens,
                    "outputTokens": total_output_tokens,
                    "creditsCharged": credits_charged,
                    "usedAuto": used_auto,
                },
                "model": model_to_use,
                "turnId": &turn_id,
                "conversationId": &owned_conversation_id,
                "error": interrupt_error.or_else(|| Some("Cancelled".to_string())),
            }),
        );
    }

    state.clear_in_flight_if(&turn_id);
    journals::clear_turn_journal(&owned_conversation_id, &turn_id);

    Ok(final_full_response)
}

// ----- helpers --------------------------------------------------------------------------

fn estimate_credits_charged(input_tokens: usize, output_tokens: usize) -> f64 {
    const INPUT_COST_PER_M: f64 = 3.0;
    const OUTPUT_COST_PER_M: f64 = 15.0;
    const PROVIDER_COST_PER_CREDIT: f64 = 0.02;
    const MIN_CHARGE_USD: f64 = 0.005;

    let cost = (input_tokens as f64 / 1_000_000.0) * INPUT_COST_PER_M
        + (output_tokens as f64 / 1_000_000.0) * OUTPUT_COST_PER_M;
    if cost < MIN_CHARGE_USD {
        return 0.0;
    }
    let credits = cost / PROVIDER_COST_PER_CREDIT;
    (credits * 100.0).round() / 100.0
}

fn estimate_cost_per_token(model: &str) -> f64 {
    let m = model.to_ascii_lowercase();
    if m.contains("opus") || m.contains("gpt-5.6-sol") || m.contains("gpt-5.5") {
        0.000015
    } else if m.contains("gpt-5") && !m.contains("nano") && !m.contains("mini") {
        0.000012
    } else if m.contains("sonnet") || m.contains("grok") || m.contains("gemini") {
        0.000003
    } else {
        0.0000006
    }
}

fn capitalize_word(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

fn title_from_message(message: &str) -> String {
    let stripped = message
        .replace("<attached_image", "")
        .replace("</attached_image>", "");
    let first_line = stripped
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("New Chat");

    let lowered = first_line.to_lowercase();
    let mut line = first_line;
    for prefix in [
        "please ",
        "can you ",
        "could you ",
        "would you ",
        "i want to ",
        "i need to ",
        "help me ",
    ] {
        if lowered.starts_with(prefix) {
            line = &first_line[prefix.len()..];
            break;
        }
    }

    let sentence = line
        .split(['.', '?', '!'])
        .next()
        .unwrap_or(line)
        .trim();

    const STOP: &[&str] = &[
        "a", "an", "the", "my", "me", "and", "or", "to", "for", "of", "in", "on", "with", "about",
        "tell", "show", "please", "can", "could", "would", "you", "i", "we", "it", "is", "are",
        "be", "do", "does", "this", "that", "what", "how", "why",
    ];

    let meaningful: Vec<String> = sentence
        .split_whitespace()
        .filter_map(|word| {
            let clean: String = word.chars().filter(|c| c.is_alphanumeric()).collect();
            let lower = clean.to_lowercase();
            if clean.is_empty() || STOP.contains(&lower.as_str()) {
                None
            } else {
                Some(capitalize_word(&clean))
            }
        })
        .take(5)
        .collect();

    if meaningful.len() >= 2 {
        return meaningful.join(" ");
    }
    if meaningful.len() == 1 {
        return meaningful[0].clone();
    }

    short_fallback_title(sentence)
}

async fn maybe_regenerate_title(
    state: &tauri::State<'_, AgentState>,
    client: &Client,
    auth_token: &str,
    turn_id: &str,
    conversation_id: Option<&str>,
) {
    let user_count = state
        .history
        .lock()
        .ok()
        .map(|h| h.iter().filter(|m| m.role == "user").count())
        .unwrap_or(0);
    if user_count < 4 || user_count % 4 != 0 {
        return;
    }

    let (current_title, recent_user) = {
        let Ok(hist) = state.history.lock() else {
            return;
        };
        let title = state.title.lock().ok().and_then(|t| t.clone());
        let Some(title) = title else {
            return;
        };
        let recent: Vec<String> = hist
            .iter()
            .filter(|m| m.role == "user")
            .rev()
            .take(3)
            .map(|m| m.content.chars().take(500).collect())
            .collect();
        (title, recent.join("\n---\n"))
    };

    let prompt = format!(
        "Current chat title: \"{}\"\n\nRecent user messages:\n{}\n\nHas the MAIN topic of this conversation shifted to something substantially different? \
         Do NOT rename for brief side questions while building the same project.\n\
         Reply with exactly KEEP or RENAME: <new title>",
        current_title, recent_user
    );

    let Ok(raw) = streaming::complete_chat(
        client,
        auth_token,
        &prompt,
        MODEL_TITLE_GEN,
        &streaming::ProxyContext::new("title")
            .with_turn(Some(turn_id.to_string()), conversation_id.map(|s| s.to_string())),
    )
    .await
    else {
        return;
    };

    let trimmed = raw.trim();
    if let Some(rest) = trimmed.strip_prefix("RENAME:").map(str::trim) {
        if !rest.is_empty() && rest.to_lowercase() != current_title.to_lowercase() {
            let new_title = sanitize_generated_title(rest, rest);
            if let Ok(mut t) = state.title.lock() {
                *t = Some(new_title);
            }
        }
    }
}

fn sanitize_generated_title(raw: &str, fallback_message: &str) -> String {
    let title = raw
        .trim()
        .trim_matches(|c: char| c == '"' || c == '\'' || c == '`')
        .trim()
        .trim_start_matches("Title:")
        .trim();

    let word_count = title.split_whitespace().count();
    let lower = title.to_lowercase();
    let alpha_count = title.chars().filter(|c| c.is_alphabetic()).count();

    let looks_invalid = title.is_empty()
        || word_count < 2
        || word_count > 8
        || title.len() < 4
        || alpha_count < 3
        || lower.starts_with("and ")
        || lower.starts_with("or ")
        || lower.starts_with("the ")
        || lower.starts_with("to ")
        || lower == "and tell"
        || lower == "new chat";

    if looks_invalid {
        title_from_message(fallback_message)
    } else {
        title.to_string()
    }
}

fn short_fallback_title(message: &str) -> String {
    let chars: Vec<char> = message.chars().collect();
    if chars.len() > 30 {
        let truncated: String = chars.into_iter().take(27).collect();
        format!("{}...", truncated)
    } else {
        message.to_string()
    }
}

// ----- Tauri command surface (unchanged from prior version) ----------------------------

fn staged_paths_from_diff(diff: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for line in diff.lines() {
        // diff --git a/path b/path
        if let Some(rest) = line.strip_prefix("diff --git ") {
            let mut parts = rest.split_whitespace();
            let _a = parts.next();
            if let Some(b) = parts.next() {
                let path = b.strip_prefix("b/").unwrap_or(b).to_string();
                if !path.is_empty() && !paths.iter().any(|p| p == &path) {
                    paths.push(path);
                }
            }
        }
    }
    paths
}

fn load_project_commit_guide(project_path: &str) -> Option<String> {
    const CANDIDATES: &[&str] = &["COMMIT.md", "commit.md", "COMMIT.MD", ".github/COMMIT.md"];
    for name in CANDIDATES {
        let path = std::path::Path::new(project_path).join(name);
        if let Ok(text) = std::fs::read_to_string(&path) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                // Cap so the prompt stays focused on the diff.
                let excerpt: String = trimmed.chars().take(6_000).collect();
                return Some(excerpt);
            }
        }
    }
    None
}

/// Only include chat when recent turns mention the same paths as the staged diff.
fn related_chat_for_commit(
    history: &[ChatMessage],
    summary: Option<&str>,
    staged_paths: &[String],
) -> Option<String> {
    if staged_paths.is_empty() {
        return None;
    }
    let path_needles: Vec<String> = staged_paths
        .iter()
        .flat_map(|p| {
            let slash = p.replace('\\', "/");
            let file = slash.rsplit('/').next().unwrap_or(slash.as_str()).to_string();
            vec![slash.to_lowercase(), file.to_lowercase()]
        })
        .collect();

    let mut matched = Vec::new();
    for msg in history.iter().rev().take(16) {
        let lower = msg.content.to_lowercase();
        let hits = path_needles.iter().any(|n| !n.is_empty() && lower.contains(n));
        if !hits {
            continue;
        }
        let body = messages::strip_heavy_content_for_summary(&msg.content);
        let excerpt: String = body.chars().take(800).collect();
        matched.push(format!("[{}] {}", msg.role, excerpt));
        if matched.len() >= 6 {
            break;
        }
    }

    if matched.is_empty() {
        // Summary only if it also mentions staged paths.
        if let Some(s) = summary {
            let lower = s.to_lowercase();
            if path_needles.iter().any(|n| !n.is_empty() && lower.contains(n)) {
                let excerpt: String = s.chars().take(1_200).collect();
                return Some(excerpt);
            }
        }
        return None;
    }

    matched.reverse();
    Some(matched.join("\n\n"))
}

#[tauri::command]
pub async fn generate_commit_message(
    access_token: Option<String>,
    app_state: tauri::State<'_, AppState>,
    agent_state: tauri::State<'_, AgentState>,
) -> Result<String, AppError> {
    let auth_token = access_token.filter(|t| !t.trim().is_empty()).ok_or_else(|| {
        AppError::Env("Sign in to Shape to use AI chat.".to_string())
    })?;
    let client = Client::new();
    let model = MODEL_TITLE_GEN;

    let project_path = app_state
        .0
        .lock()?
        .project_path
        .clone()
        .ok_or(AppError::Message("No project open".to_string()))?;

    let diff = git::git_staged_diff(project_path.clone()).unwrap_or_default();
    if diff.trim().is_empty() {
        return Err(AppError::Message(
            "No checked/staged changes detected. Please check the files you want to commit."
                .to_string(),
        ));
    }

    let logs = git::git_log(project_path.clone(), Some(10)).unwrap_or_default();
    let recent_commits = logs
        .iter()
        .take(10)
        .map(|log| format!("- {}: {}", log.hash, log.message))
        .collect::<Vec<_>>()
        .join("\n");

    let staged_paths = staged_paths_from_diff(&diff);
    let staged_list = if staged_paths.is_empty() {
        "Unavailable".to_string()
    } else {
        staged_paths
            .iter()
            .map(|p| format!("- {}", p))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let project_guide = load_project_commit_guide(&project_path);
    let (history, summary) = {
        let hist = agent_state.history.lock()?.clone();
        let sum = agent_state.history_summary.lock()?.clone();
        (hist, sum)
    };
    let chat_excerpt = related_chat_for_commit(&history, summary.as_deref(), &staged_paths);

    let diff_trimmed = if diff.len() > 14000 {
        format!("{}... [truncated]", &diff[..14000])
    } else {
        diff
    };

    let mut prompt = format!("{}\n\n", prompts::COMMIT_MD);
    if let Some(guide) = project_guide {
        prompt.push_str("## Project commit guide\n");
        prompt.push_str(&guide);
        prompt.push_str("\n\n");
    }
    prompt.push_str("## Recent commits\n");
    prompt.push_str(if recent_commits.is_empty() {
        "None"
    } else {
        &recent_commits
    });
    prompt.push_str("\n\n## Staged files\n");
    prompt.push_str(&staged_list);
    if let Some(chat) = chat_excerpt {
        prompt.push_str("\n\n## Related chat context (only if it matches this diff)\n");
        prompt.push_str(&chat);
    }
    prompt.push_str("\n\n## Git diff\n");
    prompt.push_str(&diff_trimmed);

    let commit_turn_id = uuid::Uuid::new_v4().to_string();
    let commit_ctx = streaming::ProxyContext::new("commit").with_turn(Some(commit_turn_id), None);

    let (message, _, _) =
        streaming::complete_chat_with_max_tokens(&client, &auth_token, &prompt, model, 220, &commit_ctx).await?;
    if message.is_empty() {
        return Err(AppError::Message(
            "Failed to generate commit message".to_string(),
        ));
    }
    Ok(message)
}

fn require_shape_token(access_token: Option<String>) -> Result<String, AppError> {
    access_token
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| AppError::Env("Sign in to Shape to use AI.".to_string()))
}

fn truncate_for_prompt(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max.min(s.len());
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}… [truncated]", &s[..end])
}

/// One-shot AI summary of a pull request for the Git Manager detail pane.
#[tauri::command]
pub async fn summarize_pull_request(
    access_token: Option<String>,
    owner: String,
    repo: String,
    number: u64,
) -> Result<String, AppError> {
    let auth_token = require_shape_token(access_token)?;
    let client = Client::new();
    let model = MODEL_TITLE_GEN;
    let slug = format!("{owner}/{repo}");

    let pr_path = format!("repos/{slug}/pulls/{number}");
    let files_path = format!("repos/{slug}/pulls/{number}/files?per_page=100");
    let pr_raw = crate::commands::github_auth::api_get(&pr_path)?;
    let files_raw = crate::commands::github_auth::api_get(&files_path).unwrap_or_else(|_| "[]".into());

    let pr: serde_json::Value =
        serde_json::from_str(&pr_raw).map_err(|e| AppError::Message(e.to_string()))?;
    let files: serde_json::Value =
        serde_json::from_str(&files_raw).unwrap_or_else(|_| serde_json::json!([]));

    let title = pr.get("title").and_then(|v| v.as_str()).unwrap_or("(no title)");
    let body = pr.get("body").and_then(|v| v.as_str()).unwrap_or("");
    let state = pr.get("state").and_then(|v| v.as_str()).unwrap_or("");
    let base = pr
        .pointer("/base/ref")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let head = pr
        .pointer("/head/ref")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let user = pr
        .pointer("/user/login")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let additions = pr.get("additions").and_then(|v| v.as_u64()).unwrap_or(0);
    let deletions = pr.get("deletions").and_then(|v| v.as_u64()).unwrap_or(0);

    let mut file_lines = Vec::new();
    if let Some(arr) = files.as_array() {
        for f in arr.iter().take(80) {
            let name = f.get("filename").and_then(|v| v.as_str()).unwrap_or("?");
            let status = f.get("status").and_then(|v| v.as_str()).unwrap_or("modified");
            let a = f.get("additions").and_then(|v| v.as_u64()).unwrap_or(0);
            let d = f.get("deletions").and_then(|v| v.as_u64()).unwrap_or(0);
            file_lines.push(format!("- [{status}] {name} (+{a}/−{d})"));
        }
        if arr.len() > 80 {
            file_lines.push(format!("- … and {} more files", arr.len() - 80));
        }
    }

    let mut prompt = format!("{}\n\n", prompts::PR_SUMMARY_MD);
    prompt.push_str(&format!(
        "## PR\n- Repo: {slug}\n- Number: #{number}\n- Author: {user}\n- State: {state}\n- Base ← Head: {base} ← {head}\n- Diffstat: +{additions} −{deletions}\n\n## Title\n{title}\n\n## Body\n{}\n\n## Files\n{}\n",
        truncate_for_prompt(body, 8_000),
        if file_lines.is_empty() {
            "(none)".to_string()
        } else {
            file_lines.join("\n")
        }
    ));

    let turn_id = uuid::Uuid::new_v4().to_string();
    let ctx = streaming::ProxyContext::new("pr_summary").with_turn(Some(turn_id), None);
    let (message, _, _) =
        streaming::complete_chat_with_max_tokens(&client, &auth_token, &prompt, model, 700, &ctx)
            .await?;
    if message.trim().is_empty() {
        return Err(AppError::Message("Failed to summarize pull request".into()));
    }
    Ok(message)
}

/// One-shot AI explanation of a CI / Actions log for the Git Manager logs pane.
#[tauri::command]
pub async fn explain_ci_log(
    access_token: Option<String>,
    log_text: String,
    context: Option<String>,
) -> Result<String, AppError> {
    let auth_token = require_shape_token(access_token)?;
    let client = Client::new();
    let model = MODEL_TITLE_GEN;

    let trimmed = log_text.trim();
    if trimmed.is_empty() {
        return Err(AppError::Message(
            "No log text to explain. Load job logs first.".into(),
        ));
    }

    let mut prompt = format!("{}\n\n", prompts::CI_EXPLAIN_MD);
    if let Some(ctx_line) = context.filter(|s| !s.trim().is_empty()) {
        prompt.push_str("## Job context\n");
        prompt.push_str(&ctx_line);
        prompt.push_str("\n\n");
    }
    prompt.push_str("## Log\n");
    prompt.push_str(&truncate_for_prompt(trimmed, 16_000));

    let turn_id = uuid::Uuid::new_v4().to_string();
    let ctx = streaming::ProxyContext::new("ci_explain").with_turn(Some(turn_id), None);
    let (message, _, _) =
        streaming::complete_chat_with_max_tokens(&client, &auth_token, &prompt, model, 700, &ctx)
            .await?;
    if message.trim().is_empty() {
        return Err(AppError::Message("Failed to explain CI log".into()));
    }
    Ok(message)
}

#[tauri::command]
pub fn get_chat_title(state: tauri::State<'_, AgentState>) -> Result<String, AppError> {
    Ok(state
        .title
        .lock()?
        .clone()
        .unwrap_or_else(|| "New Chat".to_string()))
}

#[tauri::command]
pub fn get_current_conversation_id(state: tauri::State<'_, AgentState>) -> Result<Option<String>, AppError> {
    Ok(state.current_conversation_id.lock()?.clone())
}

#[tauri::command]
pub fn get_chat_history(
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<ChatMessage>, AppError> {
    let proj_path = app_state.0.lock()?.project_path.clone();
    let mut current_project_lock = state.current_project.lock()?;

    if !history::project_paths_equal(&proj_path, &*current_project_lock) {
        logging::info(
            "chat",
            &format!(
                "Switching chat project from {:?} to {:?}",
                current_project_lock, proj_path
            ),
        );

        if let Some(old_path) = current_project_lock.as_ref() {
            let _ = history::save_current_conversation(&state, old_path);
        }

        state.history.lock()?.clear();
        state.title.lock()?.take();
        *state.history_summary.lock()? = None;
        *state.current_conversation_id.lock()? = None;
        *current_project_lock = proj_path;
    }

    Ok(state.merge_in_flight_into_history(state.history.lock()?.clone()))
}

#[tauri::command]
pub fn get_chat_generation_state(
    state: tauri::State<'_, AgentState>,
) -> Result<super::models::ChatGenerationState, AppError> {
    Ok(state.generation_state())
}

#[tauri::command]
pub fn get_conversations(
    _state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
    project_path: Option<String>,
) -> Result<Vec<super::models::Conversation>, AppError> {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("Shape");
    path.push("chat_history");

    let filter_path =
        project_path.or_else(|| app_state.0.lock().ok().and_then(|s| s.project_path.clone()));

    let mut all_convs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = std::fs::read_to_string(entry.path()) {
                    if let Ok(mut convs) =
                        serde_json::from_str::<Vec<super::models::Conversation>>(&content)
                    {
                        all_convs.append(&mut convs);
                    }
                }
            }
        }
    }

    if let Some(ref fp) = filter_path {
        let normalized = fp.replace('\\', "/").to_lowercase();
        all_convs.retain(|c| {
            let conv_normalized = c.project_path.replace('\\', "/").to_lowercase();
            conv_normalized == normalized
        });
    }

    all_convs.sort_by(|a, b| {
        b.timestamp
            .partial_cmp(&a.timestamp)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(all_convs)
}

#[tauri::command]
pub fn clear_chat_history(state: tauri::State<'_, AgentState>) -> Result<(), AppError> {
    state.history.lock()?.clear();
    state.title.lock()?.take();
    *state.history_summary.lock()? = None;
    *state.current_conversation_id.lock()? = None;
    state.clear_design_preview_state();
    state.clear_file_checkpoints();
    Ok(())
}

/// Restore both chat history and any file edits made from `index` onward. This is
/// what powers the "restore to here" / redo flow: rewinding a turn should undo the
/// file changes it made, not just hide the messages describing them.
///
/// Always cancels any in-flight generation first — otherwise Redo truncates the
/// transcript while the old turn keeps running (ghost approvals / missing messages).
#[tauri::command]
pub async fn restore_checkpoint(
    index: usize,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
    pty_state: tauri::State<'_, crate::commands::pty::PtyState>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    let aborted_turn = {
        let turn_id = state.in_flight_turn_id();
        let conv_id = state
            .in_flight_conversation_id()
            .or_else(|| state.current_conversation_id.lock().ok().and_then(|g| g.clone()));
        if turn_id.is_some() {
            logging::info("chat", "Restore/redo cancelling in-flight generation");
            if let Ok(token) = state.cancellation_token.lock() {
                token.cancel();
            }
            state.clear_in_flight();
            turn_id.zip(conv_id)
        } else {
            None
        }
    };
    state.kill_active_terminal(&pty_state).await;
    if let Some((turn_id, conv_id)) = aborted_turn {
        let _ = app_handle.emit(
            "chat_complete",
            json!({
                "turnId": turn_id,
                "conversationId": conv_id,
                "error": "Cancelled",
            }),
        );
    }

    {
        let mut history = state.history.lock()?;
        if index < history.len() {
            history.truncate(index);
        }
    }
    // Drop design gate / sandbox so restore past Continue does not leave writes blocked.
    state.clear_design_preview_state();

    let project_path = app_state.0.lock()?.project_path.clone().unwrap_or_default();
    let snapshots = state.take_checkpoints_from(index);
    for snap in snapshots {
        let abs_path = if std::path::Path::new(&snap.path).is_absolute() {
            snap.path.clone()
        } else {
            std::path::Path::new(&project_path)
                .join(&snap.path)
                .to_string_lossy()
                .into_owned()
        };
        let result = match &snap.original_content {
            Some(content) => {
                if let Some(parent) = std::path::Path::new(&abs_path).parent() {
                    let _ = tokio::fs::create_dir_all(parent).await;
                }
                tokio::fs::write(&abs_path, content).await
            }
            None => match tokio::fs::remove_file(&abs_path).await {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(e),
            },
        };
        if let Err(e) = result {
            logging::warn(
                "checkpoints",
                &format!("Failed to restore checkpoint for {}: {}", snap.path, e),
            );
            continue;
        }
        let _ = app_handle.emit("shape-file-edited", &abs_path);
    }

    if let Some(conv_id) = state.current_conversation_id.lock()?.clone() {
        checkpoints::save_checkpoints(&conv_id, &state.file_checkpoints_snapshot());
    }

    Ok(())
}

#[tauri::command]
pub fn new_chat(
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
    index_state: tauri::State<'_, crate::agent::index::IndexState>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    // Keep any in-flight turn running in the background — only Stop cancels.
    let active_proj = state.current_project.lock()?.clone();

    if let Some(path) = active_proj {
        let _ = history::save_current_conversation(&state, &path);
    } else {
        let proj_path = app_state.0.lock()?.project_path.clone();
        if let Some(path) = proj_path {
            let _ = history::save_current_conversation(&state, &path);
            *state.current_project.lock()? = Some(path);
        }
    }

    state.history.lock()?.clear();
    state.title.lock()?.take();
    *state.history_summary.lock()? = None;
    *state.current_conversation_id.lock()? = None;
    state.clear_design_preview_state();
    state.clear_file_checkpoints();

    if let Some(path) = app_state.0.lock()?.project_path.clone() {
        let _ = index_state.spawn_background_index(app_handle, path);
    }

    Ok(())
}

#[tauri::command]
pub fn load_conversation(
    id: String,
    project_path: Option<String>,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    if let Some(active_path) = state.current_project.lock()?.as_ref() {
        let _ = history::save_current_conversation(&state, active_path);
    }

    let preferred_proj = project_path
        .or_else(|| app_state.0.lock().ok().and_then(|s| s.project_path.clone()))
        .filter(|p| !p.is_empty());

    let (load_proj, conv) = history::find_conversation_by_id(
        &id,
        preferred_proj.as_deref(),
    )
    .ok_or(AppError::Message("Conversation not found".to_string()))?;

    {
        let mut convs = state.conversations.lock()?;
        if !convs.contains_key(&load_proj) {
            convs.insert(load_proj.clone(), history::load_conversations(&load_proj));
        }
    }

    *state.current_project.lock()? = Some(load_proj);
    *state.history.lock()? = conv.history;
    *state.title.lock()? = Some(conv.title);
    *state.current_conversation_id.lock()? = Some(id.clone());
    state.clear_design_preview_state();
    state.replace_file_checkpoints(checkpoints::load_checkpoints(&id));

    Ok(())
}

#[tauri::command]
pub fn delete_conversation(
    id: String,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let proj_path = app_state.0.lock()?.project_path.clone().unwrap_or_default();
    let mut convs = state.conversations.lock()?;
    if !convs.contains_key(&proj_path) {
        convs.insert(proj_path.clone(), history::load_conversations(&proj_path));
    }
    if let Some(list) = convs.get_mut(&proj_path) {
        list.retain(|c| c.id != id);
        history::save_conversations(&proj_path, list);
    }
    checkpoints::delete_checkpoints(&id);
    for j in journals::list_open_turn_journals()
        .into_iter()
        .filter(|j| j.conversation_id == id)
    {
        journals::clear_turn_journal(&j.conversation_id, &j.turn_id);
    }
    Ok(())
}

#[tauri::command]
pub fn get_turn_journal(conversation_id: String, turn_id: String) -> Option<journals::TurnJournal> {
    journals::load_turn_journal(&conversation_id, &turn_id)
}

#[tauri::command]
pub fn get_open_turn_journals() -> Vec<journals::TurnJournal> {
    journals::list_open_turn_journals()
}

#[tauri::command]
pub async fn stop_chat_message(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentState>,
    pty_state: tauri::State<'_, crate::commands::pty::PtyState>,
) -> Result<(), AppError> {
    let already_cancelled = {
        let token = state
            .cancellation_token
            .lock()
            .map_err(|e| AppError::Poison(e.to_string()))?;
        token.is_cancelled()
    };
    if already_cancelled {
        logging::debug("chat", "Stop ignored — generation already stopping");
    } else {
        logging::info("chat", "Stop requested by user");
        state
            .cancellation_token
            .lock()
            .map_err(|e| AppError::Poison(e.to_string()))?
            .cancel();
        if let Some(turn_id) = state.in_flight_turn_id() {
            let conv_id = state
                .in_flight_conversation_id()
                .or_else(|| state.current_conversation_id.lock().ok().and_then(|g| g.clone()));
            let project_path = state.current_project.lock().ok().and_then(|p| p.clone());
            if let Some(ref project) = project_path {
                crate::commands::stats::bump_event(project, "chat_stops");
            }
            if let Some(conv_id) = conv_id {
                journals::save_turn_journal(&journals::TurnJournal {
                    conversation_id: conv_id,
                    turn_id,
                    project_path,
                    status: "interrupted".to_string(),
                    updated_at: now_f64(),
                    subagent_ids: Vec::new(),
                    note: Some("Stopped by user".to_string()),
                });
            }
        }
    }

    // Abort any in-flight design-preview capture and give the frontend
    // capture host a moment to tear down its offscreen iframe *before* we
    // kill the PTY. Doing this concurrently raced WebView2 teardown against
    // process teardown and surfaced as "invalid window handle" on Windows.
    app.state::<PreviewCaptureState>()
        .abort_and_drain(&app, "Preview capture cancelled")
        .await;

    state.kill_active_terminal(&pty_state).await;
    Ok(())
}

#[tauri::command]
pub async fn apply_file_edit(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
    original: String,
    replacement: String,
) -> Result<(), AppError> {
    logging::info("edit", &format!("Manual apply_file_edit: path={}", path));
    let proj_path = state.0.lock()?.project_path.clone().unwrap_or_default();
    let abs_path = if std::path::Path::new(&path).is_absolute() {
        path
    } else {
        std::path::Path::new(&proj_path)
            .join(&path)
            .to_string_lossy()
            .into_owned()
    };

    // For manual edits from the UI we use a deterministic full-overwrite path: if the
    // caller provided an `original` block we honour it (search-and-replace), otherwise
    // we treat `replacement` as the full new content. No LLM round-trip needed.
    let current = tokio::fs::read_to_string(&abs_path).await.unwrap_or_default();
    let new_content = if original.trim().is_empty() {
        replacement
    } else {
        current.replacen(&original, &replacement, 1)
    };

    if let Some(parent) = std::path::Path::new(&abs_path).parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    crate::domain::filesystem::service::save_file(
        app.clone(),
        abs_path.clone(),
        new_content,
    )
    .await?;
    let _ = app.emit("shape-file-edited", abs_path);
    Ok(())
}

#[tauri::command]
pub async fn approve_terminal_command(
    id: String,
    state: tauri::State<'_, AgentState>,
    app_state: tauri::State<'_, AppState>,
    pty_state: tauri::State<'_, crate::commands::pty::PtyState>,
    app: tauri::AppHandle,
) -> Result<String, AppError> {
    logging::info("terminal", &format!("Command approved: {}", id));
    let pending = {
        let pending_cmds = state.pending_commands.lock()?;
        pending_cmds.get(&id).cloned()
    };

    let Some(cmd) = pending else {
        return Err(AppError::Message(
            "Command not found or already processed".to_string(),
        ));
    };

    let project_path = app_state
        .0
        .lock()?
        .project_path
        .clone()
        .unwrap_or_else(|| ".".to_string());

    let cancel = state
        .cancellation_token
        .lock()
        .map_err(|e| AppError::Poison(e.to_string()))?
        .clone();

    let output = match terminal::classify_command(&cmd.command) {
        terminal::CommandExecutionMode::LongRunning => {
            terminal::execute_long_running_in_pty(
                &cmd.command,
                &project_path,
                &app,
                &pty_state,
                &state,
            )
            .await
        }
        terminal::CommandExecutionMode::Quick => {
            terminal::execute_terminal_command(
                &cmd.command,
                &project_path,
                Some(&app),
                Some(cancel),
                Some(&state),
            )
            .await
        }
    };

    state.command_results.lock()?.insert(id.clone(), output.clone());
    // Allow the approval waiter to observe completion and exit cleanly.
    state.pending_commands.lock()?.remove(&id);

    Ok(output)
}

#[tauri::command]
pub fn reject_terminal_command(
    id: String,
    state: tauri::State<'_, AgentState>,
) -> Result<(), AppError> {
    logging::info("terminal", &format!("Command rejected: {}", id));
    state.pending_commands.lock()?.remove(&id);
    Ok(())
}
