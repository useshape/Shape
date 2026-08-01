/// Fast-apply LLM fallback for `edit_file` when the deterministic resolver can't splice
/// the edit. A small/cheap model is asked to merge the marker-style `code_edit` onto the
/// `original` file and return the full merged file. We then run sanity checks before
/// trusting the output (no ellipsis markers leaked through, file didn't collapse to
/// nothing, the model didn't drop a huge chunk silently).

use reqwest::Client;
use serde_json::{json, Value};

use crate::core::error::AppError;
use super::super::commands::logging;

/// Default fast-apply fallback chain. Configurable via env `SHAPE_APPLY_MODEL`.
///
/// `x-ai/grok-4-fast` used to be the default here, but OpenRouter now returns 404 for it.
/// Keep a small ordered chain so one provider deprecation does not break every edit.
const DEFAULT_APPLY_MODELS: &[&str] = &[
    "x-ai/grok-4.3",
    "openai/gpt-5.4-nano",
    "deepseek/deepseek-v4-flash",
];

const APPLY_SYSTEM_PROMPT: &str = "You are a code-merging tool. You receive an ORIGINAL file and a code EDIT that describes a change to it. The EDIT uses markers like `// ... existing code ...` (or `# ...`, `<!-- ... -->`) to indicate regions of the original that stay unchanged. Your job is to produce the FULL merged file.

Strict rules:
- Output ONLY the final file content. No markdown fences, no commentary, no preamble, no explanation.
- Preserve every line that is not explicitly changed. Markers mean 'keep this region exactly as it is in the original'.
- Apply the changes exactly as written. Do not add, refactor, or improve anything beyond what the EDIT shows.
- Preserve indentation and whitespace style.
- If the EDIT is ambiguous, prefer the smallest possible change.";

pub async fn fast_apply(
    client: &Client,
    api_key: &str,
    original: &str,
    code_edit: &str,
    instructions: &str,
) -> Result<String, AppError> {
    let user_prompt = format!(
        "INSTRUCTIONS: {}\n\nORIGINAL FILE:\n```\n{}\n```\n\nEDIT:\n```\n{}\n```\n\nReturn ONLY the final merged file content. No markdown fences.",
        instructions.trim(),
        original,
        code_edit
    );

    let mut models: Vec<String> = match std::env::var("SHAPE_APPLY_MODEL") {
        Ok(model) if !model.trim().is_empty() => vec![model],
        _ => DEFAULT_APPLY_MODELS.iter().map(|m| (*m).to_string()).collect(),
    };

    // If the user configured the old deprecated model, transparently append the safe
    // defaults instead of failing the edit.
    if models.len() == 1 && models[0] == "x-ai/grok-4-fast" {
        models.extend(DEFAULT_APPLY_MODELS.iter().map(|m| (*m).to_string()));
    }

    let mut last_error = String::new();
    for model in models {
        logging::info(
            "apply",
            &format!(
                "Calling fast-apply: model={}, original={} chars, edit={} chars",
                model,
                original.len(),
                code_edit.len()
            ),
        );

        match call_fast_apply_model(client, api_key, &model, &user_prompt).await {
            Ok(raw) => {
                let cleaned = strip_codefence(&raw);
                sanity_check(&cleaned, original, code_edit)?;
                logging::info(
                    "apply",
                    &format!(
                        "fast-apply produced {} chars (was {}) via {}",
                        cleaned.len(),
                        original.len(),
                        model
                    ),
                );
                return Ok(cleaned);
            }
            Err(e) => {
                last_error = e.to_string();
                logging::warn(
                    "apply",
                    &format!("fast-apply model {} failed: {}", model, last_error),
                );
                if !is_retryable_model_error(&last_error) {
                    break;
                }
            }
        }
    }

    Err(AppError::Message(format!(
        "fast-apply failed for all configured models: {}",
        last_error
    )))
}

async fn call_fast_apply_model(
    client: &Client,
    api_key: &str,
    model: &str,
    user_prompt: &str,
) -> Result<String, AppError> {
    let body = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": APPLY_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        "max_tokens": 32000,
        "temperature": 0.0,
    });

    let resp = super::super::commands::streaming::shape_proxy_request(
        client,
        api_key,
        &super::super::commands::streaming::ProxyContext::new("fast_apply"),
    )
        .header("HTTP-Referer", "https://shape-ide.local")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Message(format!("fast-apply request failed: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Message(format!(
            "fast-apply API error {}: {}",
            status,
            &text[..text.len().min(500)]
        )));
    }

    let parsed: Value = resp
        .json()
        .await
        .map_err(|e| AppError::Message(format!("fast-apply parse: {}", e)))?;

    parsed["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::Message("fast-apply: empty content".to_string()))
}

fn is_retryable_model_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("404")
        || lower.contains("deprecated")
        || lower.contains("not found")
        || lower.contains("does not exist")
        || lower.contains("not support")
}

/// Strip ```lang ... ``` fences that some models stubbornly add despite the prompt.
fn strip_codefence(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.starts_with("```") {
        // Drop the first line (```lang or ```) and the trailing ``` if present.
        if let Some(first_newline) = trimmed.find('\n') {
            let after_first = &trimmed[first_newline + 1..];
            let body = if let Some(idx) = after_first.rfind("```") {
                &after_first[..idx]
            } else {
                after_first
            };
            return body.trim_end_matches('\n').to_string();
        }
    }
    text.trim_end_matches('\n').to_string()
}

fn sanity_check(merged: &str, original: &str, code_edit: &str) -> Result<(), AppError> {
    if merged.trim().is_empty() {
        return Err(AppError::Message(
            "fast-apply returned an empty file".to_string(),
        ));
    }

    // The merged output must not still contain ellipsis markers — if it does, the model
    // failed to expand them.
    for line in merged.lines() {
        if super::speculative::is_marker_line_pub(line) {
            return Err(AppError::Message(
                "fast-apply leaked ellipsis markers into the output — refusing to save"
                    .to_string(),
            ));
        }
    }

    // Catastrophic shrink check: if the original was non-trivial AND the edit didn't
    // suggest a wholesale delete, refuse outputs that dropped more than 60% of lines.
    let original_lines = original.lines().count();
    let merged_lines = merged.lines().count();
    if original_lines > 20 {
        let edit_lines = code_edit.lines().count();
        let intentional_full_rewrite = edit_lines as f64 / original_lines as f64 > 0.6;
        if !intentional_full_rewrite {
            let kept_ratio = merged_lines as f64 / original_lines as f64;
            if kept_ratio < 0.4 {
                return Err(AppError::Message(format!(
                    "fast-apply produced a suspiciously small file ({} -> {} lines, edit was {} lines). Refusing to save.",
                    original_lines, merged_lines, edit_lines
                )));
            }
        }
    }

    Ok(())
}
