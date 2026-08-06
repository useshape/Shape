//! Primary chat turn entrypoint.
use crate::agent::context::{
    build_context_breakdown, build_context_with_options, context_options_for_query,
};
use super::adversarial_review;
use super::history;
use super::journals;
use super::logging;
use super::messages;
use super::run_turn;
use super::streaming;
use super::titles::{
    estimate_cost_per_token, estimate_credits_charged, maybe_regenerate_title,
    sanitize_generated_title, title_from_message,
};
use crate::agent::tools::schema;
use crate::agent::model_router;
use crate::agent::models::{AgentState, AutoRunMode, ChatMessage, TurnPolicy};
use crate::agent::prompts;
use crate::app_state::AppState;
use crate::commands::pty::PtyState;
use crate::core::error::AppError;
use reqwest::Client;
use serde_json::json;
use tauri::{Emitter, Manager};

use history::now_f64;

const MODEL_DEFAULT: &str = "anthropic/claude-sonnet-4.6";
const MODEL_TITLE_GEN: &str = model_router::MODEL_FAST;

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
    auto_run_mode: Option<String>,
    require_edit_approval: Option<bool>,
    protect_destructive_git: Option<bool>,
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

    let family = model_router::model_family(&model_to_use);
    let family_prompt = prompts::family_prompt(family);

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

    // Mid-chat model switch: prior turns may carry a different family.
    let switch_hint = {
        let hist = state.history.lock()?;
        let prev_family = hist
            .iter()
            .rev()
            .skip(1) // skip the user message we just pushed
            .find_map(|m| m.model.as_deref().map(model_router::model_family));
        prev_family.and_then(|prev| model_router::mid_chat_switch_hint(prev, family))
    };

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
    // Stale approvals from an earlier turn must never resolve this turn's items.
    state.clear_pending_approvals();
    state.set_turn_policy(TurnPolicy {
        auto_run_mode: AutoRunMode::from_setting(auto_run_mode.as_deref()),
        require_edit_approval: require_edit_approval.unwrap_or(false),
        protect_destructive_git: protect_destructive_git.unwrap_or(true),
    });
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
    if !family_prompt.trim().is_empty() {
        prompt_parts.push(format!("\n{}", family_prompt.trim()));
    }
    if let Some(hint) = &switch_hint {
        prompt_parts.push(hint.clone());
    }
    // Legacy "system instructions" are folded into rules — one concept for user guidance.
    let merged_rules = [custom_rules.as_deref(), custom_system_prompt.as_deref()]
        .iter()
        .filter_map(|s| s.map(str::trim).filter(|s| !s.is_empty()))
        .collect::<Vec<_>>()
        .join("\n\n");
    if !merged_rules.is_empty() {
        prompt_parts.push(format!("\n<user_rules>\n{}\n</user_rules>", merged_rules));
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
                let spill_note = crate::agent::tools::spill::spill_history_transcript(
                    current_proj_path.as_deref().unwrap_or(""),
                    &middle,
                );
                let prompt = format!(
                    "Summarize this coding assistant conversation for future context. Preserve goals, decisions, files changed, errors fixed, and what the user is working on now. Be concise.\n\n{}",
                    middle
                );
                if let Ok((summary, _, _)) = streaming::complete_chat_with_max_tokens(
                    &client,
                    &auth_token,
                    &prompt,
                    MODEL_TITLE_GEN,
                    800,
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
                    let merged = match &spill_note {
                        Some(path) => format!(
                            "{merged}\n\n[Full pre-summary transcript spilled to `{path}` — read_file/grep that path if you need details lost in this summary.]"
                        ),
                        None => merged,
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
    let tools = schema::tools_for_mode_and_family(&mode_to_use, family, mcp_tools);

    let summarized = state.history_summary.lock().ok().and_then(|g| g.clone());
    let conversation_json =
        serde_json::to_string(&messages::build_api_history(&history_snapshot)).unwrap_or_default();
    let breakdown = build_context_breakdown(
        prompts::SYSTEM_MD,
        family_prompt,
        &merged_rules,
        mode_prompt,
        &context_string,
        &tools,
        &conversation_json,
        summarized.as_deref(),
        &model_to_use,
    );
    let proxy_base = proxy_base.with_context_breakdown(Some(breakdown));

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
        max_loops: run_turn::max_loops_for_mode(&mode_to_use),
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

    // Keep the codebase index fresh after turns that changed files. The scan is
    // incremental (mtime manifest) and skipped when a job is already running.
    // Defer briefly so the next user turn isn't fighting disk I/O immediately,
    // and skip entirely if another turn has already started.
    if turn_outcome.wrote_files && !project_path.is_empty() {
        let app_for_index = app_handle.clone();
        let path_for_index = project_path.clone();
        let index_clone: crate::agent::index::IndexState = (*index_state).clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(750)).await;
            // Don't contend with an active agent turn.
            let busy = app_for_index
                .try_state::<AgentState>()
                .map(|s| {
                    s.in_flight
                        .lock()
                        .map(|g| g.is_some())
                        .unwrap_or(false)
                })
                .unwrap_or(false);
            if busy {
                return;
            }
            let _ = index_clone.spawn_background_index(app_for_index, path_for_index);
        });
    }

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
        stats: Some(crate::agent::models::MessageStats {
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
