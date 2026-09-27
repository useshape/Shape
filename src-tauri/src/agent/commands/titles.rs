//! Chat title generation helpers.
use super::logging;
use super::streaming;
use crate::agent::models::AgentState;
use regex::Regex;
use reqwest::Client;
use std::sync::OnceLock;
use tauri::{Emitter, Manager};

const MODEL_TITLE_GEN: &str = "auto";

fn attachment_block_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?s)<attached_(?:image|file|asset)\b[^>]*>.*?</attached_(?:image|file|asset)>"#)
            .expect("attachment strip regex")
    })
}

fn attachment_name_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"<attached_(?:image|file|asset)\b[^>]*?\bname="([^"]*)""#)
            .expect("attachment name regex")
    })
}

/// Strip huge attachment payloads before title gen / heuristics.
/// Keeps a short `[image: name]` marker so image-only chats still get a usable title.
pub(crate) fn text_for_title(message: &str) -> String {
    let names: Vec<&str> = attachment_name_re()
        .captures_iter(message)
        .filter_map(|c| c.get(1).map(|m| m.as_str()))
        .collect();
    let mut stripped = attachment_block_re().replace_all(message, "").to_string();
    stripped = stripped.trim().to_string();
    if stripped.is_empty() && !names.is_empty() {
        let kind = if message.contains("<attached_image") {
            "image"
        } else if message.contains("<attached_asset") {
            "asset"
        } else {
            "file"
        };
        let first = names[0];
        let stem = std::path::Path::new(first)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(first);
        return format!("{} {}", capitalize_word(kind), capitalize_word(stem));
    }
    if stripped.len() > 800 {
        stripped = stripped.chars().take(800).collect();
    }
    stripped
}

fn capitalize_word(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

pub(crate) fn title_from_message(message: &str) -> String {
    let stripped = text_for_title(message);
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

pub(crate) fn first_title_prompt(user_text: &str) -> String {
    format!(
        "Name this coding-assistant chat.\n\
         Reply with a 2-5 word topic title in Title Case. No quotes, no period, no explanation.\n\
         Name the task, not the user's sentence.\n\
         Good: \"Fix login redirect\", \"Postgres pool timeout\", \"Button hover styles\".\n\
         Bad: copying the message, \"Help me\", \"Can you\", \"Please\", \"I want\".\n\n\
         User:\n{user_text}"
    )
}

async fn request_model_title(
    client: &Client,
    auth_token: &str,
    title_source: &str,
    provider: &streaming::LlmProvider,
    turn_id: &str,
    conversation_id: &str,
) -> Option<String> {
    for attempt in 0..2 {
        match streaming::complete_chat(
            client,
            auth_token,
            &first_title_prompt(title_source),
            MODEL_TITLE_GEN,
            &streaming::ProxyContext::new("title")
                .with_provider(provider.clone())
                .with_turn(Some(turn_id.to_string()), Some(conversation_id.to_string())),
        )
        .await
        {
            Ok(text) if parse_model_title(&text).is_some() => return Some(text),
            Ok(text) => logging::warn(
                "title",
                &format!("Title attempt {} was not a title: {}", attempt + 1, text.chars().take(80).collect::<String>()),
            ),
            Err(err) => logging::warn(
                "title",
                &format!("Title attempt {} failed: {err}", attempt + 1),
            ),
        }
    }
    None
}

/// A model title, or nothing. Never the chopped user sentence.
fn parse_model_title(raw: &str) -> Option<String> {
    let title = raw
        .trim()
        .trim_matches(|c: char| c == '"' || c == '\'' || c == '`')
        .trim()
        .trim_start_matches("Title:")
        .trim();
    let first_line = title.lines().next().unwrap_or(title).trim();
    let words: Vec<&str> = first_line.split_whitespace().take(5).collect();
    let title = words.join(" ").trim_matches(|c: char| c == '.' || c == ',').to_string();
    let word_count = title.split_whitespace().count();
    let lower = title.to_lowercase();
    let alpha_count = title.chars().filter(|c| c.is_alphabetic()).count();
    let looks_invalid = title.is_empty()
        || word_count < 2
        || title.len() < 4
        || alpha_count < 3
        || lower == "new chat"
        || lower.starts_with("help me")
        || lower.starts_with("can you")
        || lower.starts_with("could you")
        || lower.contains("data:image")
        || lower.contains("base64");
    if looks_invalid {
        None
    } else {
        Some(title)
    }
}

/// Apply a model title onto the conversation that started this turn.
/// The placeholder title is already on screen; this replaces it.
pub(crate) async fn apply_generated_title(
    app: tauri::AppHandle,
    client: Client,
    auth_token: String,
    turn_id: String,
    conversation_id: String,
    title_source: String,
    provider: streaming::LlmProvider,
    cancel: tokio_util::sync::CancellationToken,
    project_path: Option<String>,
) {
    if cancel.is_cancelled() {
        return;
    }
    // Own lifetime: the chat turn's cancel token dies when the user hits Stop,
    // and that was leaving the chopped first-line placeholder on the chat forever.
    let raw = request_model_title(&client, &auth_token, &title_source, &provider, &turn_id, &conversation_id).await;
    let Some(state) = app.try_state::<AgentState>() else {
        return;
    };
    if state.title_locked.load(std::sync::atomic::Ordering::Relaxed) {
        let current = state
            .current_conversation_id
            .lock()
            .ok()
            .and_then(|g| g.clone());
        if current.as_deref() == Some(conversation_id.as_str()) {
            return;
        }
    }
    let Some(title) = raw.and_then(|text| parse_model_title(&text)) else {
        logging::warn(
            "title",
            "Title model returned nothing usable, so the placeholder stayed",
        );
        return;
    };
    if title.eq_ignore_ascii_case(&title_from_message(&title_source)) {
        logging::warn("title", "Title model echoed the user message; keeping placeholder");
        return;
    }
    let user_turns = state
        .history
        .lock()
        .ok()
        .map(|h| h.iter().filter(|m| m.role == "user").count() as u32)
        .unwrap_or(1)
        .max(1);
    let still_viewing = state
        .current_conversation_id
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .as_deref()
        == Some(conversation_id.as_str());
    if still_viewing {
        if state.title_locked.load(std::sync::atomic::Ordering::Relaxed) {
            return;
        }
        if let Ok(mut t) = state.title.lock() {
            *t = Some(title.clone());
        }
        state.set_title_meta(false, user_turns);
        if let Some(path) = project_path.as_deref() {
            let _ = super::history::save_current_conversation(&state, path);
        }
    } else if let Some(path) = project_path.as_deref() {
        let hist = {
            let convs = state.conversations.lock().ok();
            convs
                .as_ref()
                .and_then(|map| map.get(path))
                .and_then(|list| list.iter().find(|c| c.id == conversation_id))
                .map(|c| c.history.clone())
                .unwrap_or_default()
        };
        if !hist.is_empty() {
            let _ = super::history::upsert_conversation_snapshot(
                &state,
                path,
                &conversation_id,
                &title,
                hist,
            );
        }
    }
    let _ = app.emit(
        "chat_title",
        serde_json::json!({
            "title": title,
            "conversationId": conversation_id,
        }),
    );
}

/// Returns the assistant text to store. Unchanged unless the chat has spent
/// ten or more user turns on a different task and the model renames it.
pub(crate) async fn maybe_regenerate_title(
    app_handle: &tauri::AppHandle,
    state: &tauri::State<'_, AgentState>,
    client: &Client,
    auth_token: &str,
    turn_id: &str,
    conversation_id: Option<&str>,
    assistant_content: &str,
) -> String {
    if state.title_locked.load(std::sync::atomic::Ordering::Relaxed) {
        return assistant_content.to_string();
    }
    let user_count = state
        .history
        .lock()
        .ok()
        .map(|h| h.iter().filter(|m| m.role == "user").count() as u32)
        .unwrap_or(0);
    let anchor = state
        .title_anchor_turns
        .lock()
        .map(|g| *g)
        .unwrap_or(0);
    // The opening title stands until ten later user messages exist to judge.
    if user_count < anchor.saturating_add(10) {
        return assistant_content.to_string();
    }

    let (current_title, opening, recent) = {
        let Ok(hist) = state.history.lock() else {
            return assistant_content.to_string();
        };
        let Some(title) = state.title.lock().ok().and_then(|t| t.clone()) else {
            return assistant_content.to_string();
        };
        let user_msgs: Vec<String> = hist
            .iter()
            .filter(|m| m.role == "user")
            .map(|m| text_for_title(&m.content).chars().take(280).collect())
            .collect();
        let opening = user_msgs.iter().take(2).cloned().collect::<Vec<_>>().join("\n---\n");
        let recent = user_msgs
            .iter()
            .rev()
            .take(10)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n---\n");
        (title, opening, recent)
    };

    let prompt = format!(
        "Current title: \"{current_title}\"\n\n\
         How the chat started:\n{opening}\n\n\
         The last 10 user messages:\n{recent}\n\n\
         KEEP unless those last 10 messages are a different task from the title and the opening, \
         and they have stayed on that new task rather than a short aside.\n\
         Follow-ups, bugfixes, and small topic shifts on the same work are KEEP.\n\
         Reply with exactly KEEP or RENAME: <2-5 word title>"
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
        state.set_title_meta(false, user_count);
        return assistant_content.to_string();
    };

    // Asked once per ten new turns, whether or not the name changes.
    state.set_title_meta(false, user_count);

    let trimmed = raw.trim();
    if trimmed.eq_ignore_ascii_case("KEEP") || trimmed.to_ascii_uppercase().starts_with("KEEP") {
        return assistant_content.to_string();
    }
    let Some(rest) = trimmed
        .split_once("RENAME:")
        .map(|(_, rest)| rest.trim())
        .filter(|rest| !rest.is_empty())
    else {
        return assistant_content.to_string();
    };
    let new_title = sanitize_generated_title(rest, rest);
    if new_title.eq_ignore_ascii_case(&current_title) {
        return assistant_content.to_string();
    }
    if let Ok(mut t) = state.title.lock() {
        *t = Some(new_title.clone());
    }
    let _ = app_handle.emit(
        "chat_title",
        serde_json::json!({
            "title": new_title,
            "conversationId": conversation_id,
            "previousTitle": current_title,
        }),
    );
    let _ = app_handle.emit(
        "chat_renamed",
        serde_json::json!({
            "from": current_title,
            "to": new_title,
            "conversationId": conversation_id,
        }),
    );
    format!(
        "<chat_renamed from=\"{}\" />\n{}",
        xml_attr(&current_title),
        assistant_content
    )
}

fn xml_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
}

pub(crate) fn sanitize_generated_title(raw: &str, fallback_message: &str) -> String {
    let title = raw
        .trim()
        .trim_matches(|c: char| c == '"' || c == '\'' || c == '`')
        .trim()
        .trim_start_matches("Title:")
        .trim();

    let first_line = title.lines().next().unwrap_or(title).trim();
    let words: Vec<&str> = first_line.split_whitespace().take(5).collect();
    let title = words.join(" ").trim_matches(|c: char| c == '.' || c == ',').to_string();
    let word_count = title.split_whitespace().count();
    let lower = title.to_lowercase();
    let alpha_count = title.chars().filter(|c| c.is_alphabetic()).count();

    let looks_invalid = title.is_empty()
        || word_count < 2
        || title.len() < 4
        || alpha_count < 3
        || lower == "new chat"
        || lower.starts_with("help me")
        || lower.starts_with("can you")
        || lower.starts_with("could you")
        || lower.contains("data:image")
        || lower.contains("base64");

    if looks_invalid {
        title_from_message(fallback_message)
    } else {
        title
    }
}

pub(crate) fn short_fallback_title(message: &str) -> String {
    let chars: Vec<char> = message.chars().collect();
    if chars.len() > 30 {
        let truncated: String = chars.into_iter().take(27).collect();
        format!("{}...", truncated)
    } else {
        message.to_string()
    }
}

