//! One fresh reader for a design-sized request. It sees the request and nothing
//! else from the chat, then a short note goes back to the main turn.

use reqwest::Client;
use tauri::AppHandle;

use super::streaming::{self, ProxyContext};
use crate::core::error::AppError;

const NOTE_CAP: usize = 700;

/// A fresh pass is for a new system, contract, or migration. Ordinary edits,
/// even large ones, stay on the main turn.
pub fn needs_goldfish(message: &str) -> bool {
    let text = message.to_ascii_lowercase();
    if text.chars().count() < 48 {
        return false;
    }
    if is_question_only(&text) {
        return false;
    }
    if !has_design_subject(&text) {
        return false;
    }
    if is_basic_edit(&text) && !has_strong_design(&text) {
        return false;
    }
    true
}

fn is_question_only(text: &str) -> bool {
    let trimmed = text.trim_start();
    let asks = trimmed.starts_with("why ")
        || trimmed.starts_with("what ")
        || trimmed.starts_with("how does")
        || trimmed.starts_with("how do ")
        || trimmed.starts_with("explain ");
    asks && !has_build_verb(text)
}

fn has_build_verb(text: &str) -> bool {
    const VERBS: &[&str] = &[
        "build", "design", "add ", "create", "introduce", "replace", "migrate", "redesign",
        "implement", "rewrite", "architect",
    ];
    VERBS.iter().any(|verb| text.contains(verb))
}

fn has_design_subject(text: &str) -> bool {
    const SUBJECTS: &[&str] = &[
        "architect",
        "redesign",
        "from scratch",
        "new system",
        "new service",
        "new pipeline",
        "migration",
        "schema",
        "data model",
        "breaking change",
        "auth flow",
        "authentication",
        "billing",
        "payment",
        "api contract",
        "protocol",
        "permission model",
        "multi-tenant",
        "rewrite the",
    ];
    SUBJECTS.iter().any(|subject| text.contains(subject))
}

fn has_strong_design(text: &str) -> bool {
    const STRONG: &[&str] = &[
        "architect",
        "redesign",
        "from scratch",
        "new system",
        "new service",
        "migration",
        "schema",
        "data model",
        "breaking change",
        "auth flow",
        "api contract",
        "rewrite the",
    ];
    STRONG.iter().any(|subject| text.contains(subject))
}

fn is_basic_edit(text: &str) -> bool {
    const BASIC: &[&str] = &[
        "fix the",
        "bug",
        "typo",
        "rename",
        "spacing",
        "padding",
        "color",
        "css",
        "copy",
        "wording",
        "lint",
        "format ",
        "tweak",
        "nit",
        "small change",
        "quick ",
        "just update",
        "just change",
        "just fix",
        "button label",
    ];
    BASIC.iter().any(|word| text.contains(word))
}

pub fn clip_note(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.eq_ignore_ascii_case("skip") || trimmed.to_ascii_lowercase().starts_with("skip") {
        return String::new();
    }
    let mut out: String = trimmed.chars().take(NOTE_CAP).collect();
    if trimmed.chars().count() > NOTE_CAP {
        out.push('…');
    }
    out
}

pub async fn review_request(
    client: &Client,
    api_key: &str,
    message: &str,
    model: &str,
    proxy: &ProxyContext,
    app: &AppHandle,
    conversation_id: &str,
    cancel: &tokio_util::sync::CancellationToken,
) -> Option<String> {
    if cancel.is_cancelled() || !needs_goldfish(message) {
        return None;
    }
    streaming::emit_chat_status(
        app,
        serde_json::json!({
            "phase": "tool",
            "label": "Checking the design",
            "conversationId": conversation_id,
        }),
    );
    let prompt = format!(
        "You are a fresh reader. You have not seen any earlier conversation. \
Read only the request below. If it is a small fix, a wording change, or a straightforward code edit, reply with exactly: SKIP\n\
Otherwise list at most 4 concrete gaps a builder would hit: a missing decision, a wrong assumption, or a failure case. No praise. No code.\n\n\
Request:\n{message}"
    );
    let ctx = proxy.clone().with_feature("goldfish").fresh_request();
    let model = if model.trim().is_empty() { "auto" } else { model };
    let result = streaming::complete_chat_with_max_tokens(
        client,
        api_key,
        &prompt,
        model,
        500,
        &ctx,
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
        Ok((text, _, _)) => {
            let note = clip_note(&text);
            if note.is_empty() { None } else { Some(note) }
        }
        Err(AppError::Message(err)) => {
            crate::agent::commands::logging::debug("goldfish", &err);
            None
        }
        Err(_) => None,
    }
}

pub fn context_note(note: &str) -> String {
    format!(
        "\n<goldfish>\nA fresh reader, with no other chat history, found:\n{note}\nAccount for a real gap. Do not mention this check.\n</goldfish>\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_redesign_needs_a_fresh_reader() {
        assert!(needs_goldfish(
            "Redesign the billing pipeline so failed invoices retry without double charging."
        ));
    }

    #[test]
    fn a_schema_migration_needs_a_fresh_reader() {
        assert!(needs_goldfish(
            "Add a migration for the new permission model and rewrite the auth flow around it."
        ));
    }

    #[test]
    fn a_bugfix_does_not() {
        assert!(!needs_goldfish("Fix the off-by-one in the pager and run the tests."));
    }

    #[test]
    fn a_large_style_change_does_not() {
        assert!(!needs_goldfish(
            "Update the spacing, color, and copy across every settings screen so the rows line up."
        ));
    }

    #[test]
    fn a_question_does_not() {
        assert!(!needs_goldfish("Why does the save button stay disabled on the settings page?"));
    }

    #[test]
    fn skip_is_dropped() {
        assert!(clip_note("SKIP").is_empty());
        assert!(clip_note("skip\n").is_empty());
    }

    #[test]
    fn a_real_note_is_kept_and_capped() {
        let note = clip_note("- Retry can double charge if the webhook arrives twice.");
        assert!(note.contains("double charge"));
        let long = "x".repeat(900);
        assert!(clip_note(&long).chars().count() <= NOTE_CAP + 1);
    }
}
