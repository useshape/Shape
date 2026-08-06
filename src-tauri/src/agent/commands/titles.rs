//! Chat title generation helpers.
use super::streaming;
use crate::agent::model_router;
use crate::agent::models::AgentState;
use reqwest::Client;

const MODEL_TITLE_GEN: &str = model_router::MODEL_FAST;

pub(crate) fn estimate_credits_charged(input_tokens: usize, output_tokens: usize) -> f64 {
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

pub(crate) fn estimate_cost_per_token(model: &str) -> f64 {
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

pub(crate) fn title_from_message(message: &str) -> String {
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

pub(crate) async fn maybe_regenerate_title(
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
        || lower == "new chat";

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

