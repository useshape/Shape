//! Tighten a long user message before the main model sees it.
//!
//! A cheap model rewrites the same idea so it is shorter and clearer.
//! It must not add facts or correct the user. The chat still shows the
//! original. The rewrite is what the main model receives, and the cheap
//! call is billed on the same turn.

use reqwest::Client;
use tauri::AppHandle;

use super::streaming::{self, ProxyContext};
use crate::core::error::AppError;

pub const WORD_MIN: usize = 40;
pub const OPTIMIZER_MODEL: &str = "qwen/qwen3.8-flash";

pub fn word_count(text: &str) -> usize {
    text.split_whitespace().filter(|word| !word.is_empty()).count()
}

pub fn should_optimize(text: &str, enabled: bool) -> bool {
    enabled && word_count(text) >= WORD_MIN && !text.contains("data:image") && !text.contains("<attached_file")
}

/// Keep a rewrite only when it is a real, shorter version of the same message.
pub fn accept_rewrite(original: &str, rewrite: &str) -> Option<String> {
    let trimmed = rewrite.trim();
    if trimmed.is_empty() {
        return None;
    }
    let bare = trimmed
        .trim_matches('`')
        .trim()
        .trim_matches('"')
        .trim();
    if bare.is_empty() || bare.eq_ignore_ascii_case("skip") {
        return None;
    }
    if bare.chars().count() >= original.chars().count() {
        return None;
    }
    if bare.chars().count() < 12 {
        return None;
    }
    Some(bare.to_string())
}

pub async fn tighten_message(
    client: &Client,
    api_key: &str,
    message: &str,
    target_model: &str,
    proxy: &ProxyContext,
    app: &AppHandle,
    conversation_id: &str,
    cancel: &tokio_util::sync::CancellationToken,
) -> Option<String> {
    if cancel.is_cancelled() {
        return None;
    }
    streaming::emit_chat_status(
        app,
        serde_json::json!({
            "phase": "tool",
            "label": "Tightening the prompt",
            "conversationId": conversation_id,
        }),
    );
    let prompt = format!(
        "Rewrite the message so the same request is clearer and shorter for {target_model}.\n\
Do not add facts, examples, steps, or file contents the user did not write.\n\
Do not correct their claims or change what they asked for.\n\
Keep names, paths, numbers, and quotes exact.\n\
Reply with only the rewritten message.\n\n\
Message:\n{message}"
    );
    let ctx = proxy.clone().with_feature("prompt").fresh_request();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(12),
        streaming::complete_chat_with_max_tokens(
            client,
            api_key,
            &prompt,
            OPTIMIZER_MODEL,
            800,
            &ctx,
        ),
    )
    .await;
    streaming::emit_chat_status(
        app,
        serde_json::json!({
            "phase": "model",
            "conversationId": conversation_id,
        }),
    );
    if cancel.is_cancelled() {
        return None;
    }
    match result {
        Ok(Ok((text, _, _))) => accept_rewrite(message, &text),
        Ok(Err(AppError::Message(err))) => {
            crate::agent::commands::logging::debug("prompt", &err);
            None
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_messages_are_left_alone() {
        assert!(!should_optimize("Fix the button label.", true));
        assert!(!should_optimize("one two three", true));
    }

    #[test]
    fn a_long_message_is_eligible() {
        let text = "please ".repeat(40);
        assert!(word_count(&text) >= WORD_MIN);
        assert!(should_optimize(&text, true));
        assert!(!should_optimize(&text, false));
    }

    #[test]
    fn a_longer_rewrite_is_rejected() {
        let original = "Explain how the sidebar close animation should ease.";
        let longer = format!("{original} Also add a new gesture and change the timing.");
        assert!(accept_rewrite(original, &longer).is_none());
    }

    #[test]
    fn a_shorter_rewrite_is_kept() {
        let original = "Can you please go ahead and make the sidebar close ease out instead of snapping shut when I click it?";
        let rewrite = "Make the sidebar close ease out instead of snapping shut.";
        assert_eq!(accept_rewrite(original, rewrite).as_deref(), Some(rewrite));
    }
}
