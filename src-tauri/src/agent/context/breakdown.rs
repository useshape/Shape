//! Estimated context-window composition for usage analytics.
//!
//! Token counts use the same chars/4 heuristic as repo_map. These are explanatory
//! and may not sum exactly to provider `prompt_tokens`.

use crate::agent::context::repo_map::estimate_tokens;
use serde_json::{json, Value};

/// Parse a display context window like "200K" / "1M" into a token count.
pub fn parse_context_window_label(label: &str) -> Option<u64> {
    let s = label.trim().to_uppercase();
    if s.is_empty() {
        return None;
    }
    if let Some(num) = s.strip_suffix('M') {
        let n: f64 = num.trim().parse().ok()?;
        return Some((n * 1_000_000.0) as u64);
    }
    if let Some(num) = s.strip_suffix('K') {
        let n: f64 = num.trim().parse().ok()?;
        return Some((n * 1_000.0) as u64);
    }
    s.parse::<u64>().ok()
}

/// Best-effort context limit for known model ids (mirrors website catalog labels).
pub fn context_limit_for_model(model: &str) -> Option<u64> {
    let m = model.to_ascii_lowercase();
    let label = if m == "auto" || m.contains("haiku") || m.contains("mini") {
        "200K"
    } else if m.contains("gemini") && m.contains("flash") {
        "1M"
    } else if m.contains("gemini") {
        "2M"
    } else if m.contains("gpt-5") || m.contains("o3") || m.contains("o4") {
        "1M"
    } else if m.contains("claude") || m.contains("sonnet") || m.contains("opus") {
        "1M"
    } else if m.contains("deepseek") {
        "128K"
    } else {
        "200K"
    };
    parse_context_window_label(label)
}

fn tokens_of(text: &str) -> u64 {
    estimate_tokens(text) as u64
}

fn tokens_of_json(value: &Value) -> u64 {
    tokens_of(&value.to_string())
}

/// Build a JSON breakdown for the `X-Shape-Context-Breakdown` header.
pub fn build_context_breakdown(
    system_base: &str,
    family_prompt: &str,
    rules: &str,
    mode_prompt: &str,
    project_context: &str,
    tools: &[Value],
    conversation_json: &str,
    summarized: Option<&str>,
    model: &str,
) -> Value {
    let system = tokens_of(system_base) + tokens_of(family_prompt.trim());
    let rules_tokens = if rules.trim().is_empty() {
        0
    } else {
        tokens_of(rules)
    };
    let mode = if mode_prompt.trim().is_empty() {
        0
    } else {
        tokens_of(mode_prompt)
    };
    let project_context_tokens = tokens_of(project_context);
    let tools_tokens: u64 = tools.iter().map(tokens_of_json).sum();
    let conversation = tokens_of(conversation_json);
    let summarized_tokens = summarized.map(tokens_of).unwrap_or(0);

    let estimated_total = system
        + rules_tokens
        + mode
        + project_context_tokens
        + tools_tokens
        + conversation
        + summarized_tokens;

    let mut obj = json!({
        "system": system,
        "rules": rules_tokens,
        "mode": mode,
        "projectContext": project_context_tokens,
        "tools": tools_tokens,
        "conversation": conversation,
        "summarized": summarized_tokens,
        "estimatedTotal": estimated_total,
    });
    if let Some(limit) = context_limit_for_model(model) {
        obj["contextLimit"] = json!(limit);
    }
    obj
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_window_labels() {
        assert_eq!(parse_context_window_label("200K"), Some(200_000));
        assert_eq!(parse_context_window_label("1M"), Some(1_000_000));
        assert_eq!(parse_context_window_label("2M"), Some(2_000_000));
    }

    #[test]
    fn breakdown_sums_buckets() {
        let tools = vec![json!({"type":"function","function":{"name":"ls"}})];
        let v = build_context_breakdown(
            "system text here",
            "family",
            "rules",
            "mode",
            "project ctx",
            &tools,
            r#"[{"role":"user","content":"hi"}]"#,
            Some("old summary"),
            "anthropic/claude-sonnet-4.6",
        );
        assert!(v["system"].as_u64().unwrap() > 0);
        assert!(v["tools"].as_u64().unwrap() > 0);
        assert!(v["estimatedTotal"].as_u64().unwrap() > 0);
        assert_eq!(v["contextLimit"].as_u64(), Some(1_000_000));
    }
}
