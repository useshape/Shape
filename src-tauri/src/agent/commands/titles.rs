//! Chat title generation helpers.
use super::streaming;
use crate::agent::models::AgentState;
use regex::Regex;
use reqwest::Client;
use std::sync::OnceLock;
use tauri::Emitter;

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

pub(crate) async fn maybe_regenerate_title(
    app_handle: &tauri::AppHandle,
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
    // Cheap gate: only reconsider after enough turns, and not on every message.
    // The model still decides KEEP vs RENAME — this just throttles how often we ask.
    if user_count < 5 || user_count % 5 != 0 {
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
            .take(4)
            .map(|m| text_for_title(&m.content).chars().take(500).collect())
            .collect();
        (title, recent.join("\n---\n"))
    };

    let prompt = format!(
        "Current chat title: \"{}\"\n\nRecent user messages:\n{}\n\nDecide if the MAIN topic of this conversation has shifted to something substantially different from the title. \
         Prefer KEEP. Only RENAME when the title would mislead someone scanning the chat list. \
         Do NOT rename for brief side questions, follow-ups, or continued work on the same project/feature.\n\
         Reply with exactly KEEP or RENAME: <new title (2-5 words)>",
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
    if trimmed.eq_ignore_ascii_case("KEEP") || trimmed.to_ascii_uppercase().starts_with("KEEP") {
        return;
    }
    if let Some(rest) = trimmed.strip_prefix("RENAME:").map(str::trim) {
        if !rest.is_empty() && rest.to_lowercase() != current_title.to_lowercase() {
            let new_title = sanitize_generated_title(rest, rest);
            if let Ok(mut t) = state.title.lock() {
                *t = Some(new_title.clone());
            }
            let _ = app_handle.emit(
                "chat_title",
                serde_json::json!({
                    "title": new_title,
                    "turnId": turn_id,
                    "conversationId": conversation_id,
                }),
            );
        }
    }
}

pub(crate) fn sanitize_generated_title(raw: &str, fallback_message: &str) -> String {
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
        || lower == "new chat"
        || lower.contains("nameimage")
        || lower.contains("data:image")
        || lower.contains("base64");

    if looks_invalid {
        title_from_message(fallback_message)
    } else {
        title.to_string()
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

