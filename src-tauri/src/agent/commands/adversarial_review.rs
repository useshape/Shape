use reqwest::Client;
use tauri::AppHandle;

use super::streaming::{self, ProxyContext};
use crate::agent::commands::logging;
use crate::core::error::AppError;

const REVIEW_CRITIC_MD: &str = include_str!("../prompts/REVIEW_CRITIC.md");
const REVIEW_SYNTHESIS_MD: &str = include_str!("../prompts/REVIEW_SYNTHESIS.md");
const CRITIC_MODEL: &str = "auto";

/// Large writes, or any real edit on a high-impact path.
/// Copy, styling, and docs do not qualify on their own.
pub fn should_run(response: &str, wrote_files: bool) -> bool {
    if !wrote_files {
        return false;
    }
    let trimmed = response.trim();
    if trimmed.is_empty() {
        return false;
    }

    let paths = edited_paths(trimmed);
    if paths.iter().any(|path| path_is_sensitive(path)) {
        return true;
    }
    if !paths.is_empty() && paths.iter().all(|path| trivial_path(path)) {
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

fn edited_paths(hay: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = hay;
    while let Some(idx) = rest.find("file=\"") {
        let after = &rest[idx + 6..];
        let Some(end) = after.find('"') else {
            break;
        };
        out.push(after[..end].replace('\\', "/").to_ascii_lowercase());
        rest = &after[end + 1..];
    }
    out
}

fn path_is_sensitive(path: &str) -> bool {
    const NEEDLES: &[&str] = &[
        "auth",
        "oauth",
        "session",
        "permission",
        "rbac",
        "/acl",
        "billing",
        "stripe",
        "webhook",
        "payment",
        "secret",
        "password",
        "credential",
        "migration",
        "schema",
        "idempoten",
        "middleware",
        "/agent/",
    ];
    NEEDLES.iter().any(|needle| path.contains(needle))
}

fn trivial_path(path: &str) -> bool {
    path.ends_with(".css")
        || path.ends_with(".md")
        || path.ends_with(".mdx")
        || path.ends_with(".svg")
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

pub struct ReviewRun {
    /// Final card markup. Replaces the running card already streamed.
    pub markup: String,
    /// Synthesis prose when the review actually finished. None on failure.
    pub synthesis: Option<String>,
}

pub async fn run_adversarial_review(
    client: &Client,
    api_key: &str,
    implementer_output: &str,
    project_path: &str,
    proxy: &ProxyContext,
    app_handle: &AppHandle,
    cancel: &tokio_util::sync::CancellationToken,
) -> Result<ReviewRun, AppError> {
    let running = review_tag("running", "");
    streaming::emit_stream_token(app_handle, proxy, running);

    if cancel.is_cancelled() {
        return Ok(finished("cancelled", "Cancelled", None));
    }

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

    // Each call bills its own request. Sharing the turn id makes the second a 409.
    let critic_a_ctx = review_proxy(proxy);
    let critic_b_ctx = review_proxy(proxy);
    let (critic_a, critic_b) = tokio::join!(
        review_completion(client, api_key, &critic_a_prompt, &critic_a_ctx),
        review_completion(client, api_key, &critic_b_prompt, &critic_b_ctx),
    );

    if cancel.is_cancelled() {
        return Ok(finished("cancelled", "Cancelled", None));
    }

    let critic_a = match critic_a {
        Ok(text) => text,
        Err(e) => return Ok(finished("error", &e.to_string(), None)),
    };
    let critic_b = match critic_b {
        Ok(text) => text,
        Err(e) => return Ok(finished("error", &e.to_string(), None)),
    };

    let synth_prompt = format!(
        "{}\n\n<implementer>\n{}\n</implementer>\n<critic_a>\n{}\n</critic_a>\n<critic_b>\n{}\n</critic_b>",
        REVIEW_SYNTHESIS_MD, implementer_output, critic_a, critic_b
    );
    let synth_ctx = review_proxy(proxy);
    let synthesis = match review_completion(client, api_key, &synth_prompt, &synth_ctx).await {
        Ok(text) => text,
        Err(e) => return Ok(finished("error", &e.to_string(), None)),
    };

    logging::info("review", "Adversarial review synthesis complete");
    let markup_body = synthesis.clone();
    Ok(finished("done", &markup_body, Some(synthesis)))
}

fn review_proxy(proxy: &ProxyContext) -> ProxyContext {
    proxy.clone().with_feature("review").fresh_request()
}

async fn review_completion(
    client: &Client,
    api_key: &str,
    prompt: &str,
    proxy: &ProxyContext,
) -> Result<String, AppError> {
    let (text, _, _) = streaming::complete_chat_with_max_tokens(
        client,
        api_key,
        prompt,
        CRITIC_MODEL,
        1_200,
        proxy,
    )
    .await?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err(AppError::Message(
            "Review completion returned no text.".to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

fn finished(status: &str, body: &str, synthesis: Option<String>) -> ReviewRun {
    ReviewRun {
        markup: review_tag(status, body),
        synthesis,
    }
}

fn review_tag(status: &str, body: &str) -> String {
    format!(
        "\n<review_debate model=\"{CRITIC_MODEL}\" status=\"{status}\">\n{}\n</review_debate>\n",
        escape_xml_text(body)
    )
}

/// Confirmed findings the implementer should fix. "None" is not actionable.
pub fn has_actionable_findings(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    let Some(start) = lower.find("confirmed") else {
        return false;
    };
    let end = lower[start..]
        .find("disputed")
        .map(|offset| start + offset)
        .unwrap_or(lower.len().min(start + 500));
    let section = &lower[start..end];
    if section.contains("\n- none")
        || section.contains("\n* none")
        || section.contains("no confirmed")
        || section.contains("nothing confirmed")
        || section.contains("no issues")
    {
        return false;
    }
    section.contains("\n- ") || section.contains("\n* ")
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
    fn runs_a_single_auth_edit() {
        let one = "<edit file=\"src/auth/session.ts\"><original>a</original><replacement>check()</replacement></edit>";
        assert!(should_run(one, true));
    }

    #[test]
    fn skips_stylesheet_batches() {
        let mut s = String::new();
        for i in 0..6 {
            s.push_str(&format!("<edit file=\"app/styles/part{i}.css\">color</edit>"));
        }
        assert!(!should_run(&s, true));
    }

    #[test]
    fn none_is_not_actionable() {
        let text = "**Confirmed issues**\n- None\n\n**Disputed points**\n- tone";
        assert!(!has_actionable_findings(text));
    }

    #[test]
    fn a_confirmed_bug_is_actionable() {
        let text = "**Confirmed issues**\n- session check is skipped on refresh\n\n**Disputed points**\n- naming";
        assert!(has_actionable_findings(text));
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
