use reqwest::Client;

use super::streaming::{self, ProxyContext};
use crate::agent::commands::logging;
use crate::core::error::AppError;

const REVIEW_CRITIC_MD: &str = include_str!("../prompts/REVIEW_CRITIC.md");
const REVIEW_SYNTHESIS_MD: &str = include_str!("../prompts/REVIEW_SYNTHESIS.md");
const CRITIC_MODEL: &str = crate::agent::model_router::MODEL_FAST;

/// Only after a *large* write: several files or a bulky edit payload.
/// Sidebar nits, copy tweaks, and single-file polish must not trigger this.
pub fn should_run(response: &str, wrote_files: bool) -> bool {
    if !wrote_files {
        return false;
    }
    let trimmed = response.trim();
    if trimmed.is_empty() {
        return false;
    }

    let edit_blocks = count_tag(trimmed, "<edit")
        + count_tag(trimmed, "<edit_pending")
        + count_tag(trimmed, "<create_file");
    if edit_blocks >= 5 {
        return true;
    }
    if edit_blocks < 3 {
        return false;
    }
    edit_payload_chars(trimmed) >= 2_500
}

fn count_tag(hay: &str, tag: &str) -> usize {
    hay.match_indices(tag).count()
}

fn edit_payload_chars(hay: &str) -> usize {
    let mut total = 0usize;
    let mut rest = hay;
    while let Some(start) = rest.find("<edit") {
        let after = &rest[start..];
        let close = after.find("</edit>").or_else(|| after.find("</edit_pending>"));
        match close {
            Some(end) => {
                total = total.saturating_add(end);
                rest = &after[end + 1..];
            }
            None => break,
        }
    }
    total
}

pub async fn run_adversarial_review(
    client: &Client,
    api_key: &str,
    implementer_output: &str,
    project_path: &str,
    proxy: &ProxyContext,
) -> Result<String, AppError> {
    let context = format!(
        "Project path: {}\n\nImplementer review output:\n{}",
        project_path, implementer_output
    );

    let critic_a_prompt = format!(
        "{}\n\n{}\n\nAssume this review is wrong until you prove issues from the evidence above.",
        REVIEW_CRITIC_MD, context
    );
    let critic_b_prompt = format!(
        "{}\n\n{}\n\nTake a different angle than a typical reviewer. Hunt for missed regressions, false fixes, and security gaps.",
        REVIEW_CRITIC_MD, context
    );

    let (critic_a, critic_b) = tokio::join!(
        streaming::complete_chat(client, api_key, &critic_a_prompt, CRITIC_MODEL, proxy),
        streaming::complete_chat(client, api_key, &critic_b_prompt, CRITIC_MODEL, proxy),
    );

    let critic_a = critic_a.unwrap_or_else(|e| format!("Critic A failed: {e}"));
    let critic_b = critic_b.unwrap_or_else(|e| format!("Critic B failed: {e}"));

    let synth_prompt = format!(
        "{}\n\n<implementer>\n{}\n</implementer>\n<critic_a>\n{}\n</critic_a>\n<critic_b>\n{}\n</critic_b>",
        REVIEW_SYNTHESIS_MD, implementer_output, critic_a, critic_b
    );

    let synthesis = streaming::complete_chat(
        client,
        api_key,
        &synth_prompt,
        CRITIC_MODEL,
        proxy,
    )
    .await
    .unwrap_or_else(|e| format!("Synthesis failed: {e}"));

    logging::info("review", "Adversarial review synthesis complete");

    Ok(format!(
        "\n<review_debate model=\"{}\">\n{}\n</review_debate>\n",
        CRITIC_MODEL,
        escape_xml_text(&synthesis)
    ))
}

fn escape_xml_text(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_when_nothing_was_written() {
        let big = "<edit path=\"a.ts\">".to_string() + &"x".repeat(4000) + "</edit>";
        assert!(!should_run(&big, false));
    }

    #[test]
    fn skips_one_or_two_small_edits() {
        let one = "<edit path=\"sidebar.tsx\">padding</edit>";
        assert!(!should_run(one, true));
        let two = format!("{one}{one}");
        assert!(!should_run(&two, true));
    }

    #[test]
    fn runs_five_file_edits() {
        let mut s = String::new();
        for i in 0..5 {
            s.push_str(&format!("<edit path=\"f{i}.ts\">ok</edit>"));
        }
        assert!(should_run(&s, true));
    }

    #[test]
    fn runs_three_large_edits() {
        let chunk = "a".repeat(900);
        let mut s = String::new();
        for i in 0..3 {
            s.push_str(&format!("<edit path=\"f{i}.ts\">{chunk}</edit>"));
        }
        assert!(should_run(&s, true));
    }
}
