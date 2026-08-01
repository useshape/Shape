use reqwest::Client;

use super::streaming::{self, ProxyContext};
use crate::agent::commands::logging;
use crate::core::error::AppError;

const REVIEW_CRITIC_MD: &str = include_str!("../prompts/REVIEW_CRITIC.md");
const REVIEW_SYNTHESIS_MD: &str = include_str!("../prompts/REVIEW_SYNTHESIS.md");
const CRITIC_MODEL: &str = crate::agent::model_router::MODEL_FAST;

pub fn should_run(response: &str) -> bool {
    let trimmed = response.trim();
    if trimmed.is_empty() {
        return false;
    }
    // Always run for substantive Review turns; keyword heuristics alone miss
    // analysis-only reviews that still benefit from adversarial critique.
    if trimmed.len() >= 120 {
        return true;
    }
    response.contains("<edit ")
        || response.contains("<edit>")
        || response.to_lowercase().contains("root cause")
        || response.to_lowercase().contains("security")
        || response.to_lowercase().contains("fix:")
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
        "\n<review_debate>\n{}\n</review_debate>\n",
        escape_xml_text(&synthesis)
    ))
}

fn escape_xml_text(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
