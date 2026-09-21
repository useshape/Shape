/// Message building: converts internal ChatMessage history into the JSON
/// format expected by OpenRouter, with image support.

use regex::Regex;
use serde_json::{json, Value};
use super::logging;
use super::super::models::ChatMessage;

/// Converts our internal ChatMessage history into the JSON format expected by OpenRouter.
/// Detects <attached_image> tags in user messages and constructs multipart content for vision models.
pub fn build_messages_json(system_prompt: &str, history: &[ChatMessage], model: &str) -> Vec<Value> {
    let image_re = Regex::new(r#"(?s)<attached_image[^>]*>(data:[^<]+)</attached_image>"#).unwrap();
    let is_anthropic = model.starts_with("anthropic/");
    let accepts_images = crate::agent::model_router::model_accepts_images(model);

    logging::debug("messages", &format!(
        "Building messages: {} history items, model={}, is_anthropic={}, accepts_images={}",
        history.len(), model, is_anthropic, accepts_images
    ));

    let mut msgs = vec![json!({"role": "system", "content": system_prompt})];
    for msg in history {
        if msg.content.trim().is_empty() {
            continue;
        }

        if msg.role == "user" && image_re.is_match(&msg.content) && !accepts_images {
            let stripped = image_re
                .replace_all(
                    &msg.content,
                    "
[image attachment omitted — this model cannot view images]
",
                )
                .to_string();
            msgs.push(json!({"role": msg.role, "content": stripped}));
            continue;
        }

        // Check if this user message contains attached images
        if msg.role == "user" && image_re.is_match(&msg.content) {
            let mut content_parts: Vec<Value> = Vec::new();

            let text_only = image_re.replace_all(&msg.content, "").to_string();
            let text_cleaned = text_only.trim().to_string();

            if !text_cleaned.is_empty() {
                content_parts.push(json!({"type": "text", "text": text_cleaned}));
            }

            for caps in image_re.captures_iter(&msg.content) {
                if let Some(data_url_match) = caps.get(1) {
                    let data_url = data_url_match.as_str();

                    if is_anthropic {
                        if let Some(comma_pos) = data_url.find(',') {
                            let prefix = &data_url[..comma_pos];
                            let data = &data_url[comma_pos + 1..];

                            let media_type = if prefix.contains("image/png") {
                                "image/png"
                            } else if prefix.contains("image/gif") {
                                "image/gif"
                            } else if prefix.contains("image/webp") {
                                "image/webp"
                            } else {
                                "image/jpeg"
                            };

                            content_parts.push(json!({
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": data
                                }
                            }));
                        } else {
                            content_parts.push(json!({
                                "type": "image_url",
                                "image_url": { "url": data_url }
                            }));
                        }
                    } else {
                        content_parts.push(json!({
                            "type": "image_url",
                            "image_url": { "url": data_url }
                        }));
                    }
                }
            }

            msgs.push(json!({"role": msg.role, "content": content_parts}));
        } else {
            msgs.push(json!({"role": msg.role, "content": msg.content}));
        }
    }

    logging::debug("messages", &format!("Built {} API messages", msgs.len()));
    msgs
}

fn attached_image_data_urls(tag_or_content: &str) -> Vec<String> {
    let image_re = Regex::new(r#"(?s)<attached_image[^>]*>(data:[^<]+)</attached_image>"#).unwrap();
    image_re
        .captures_iter(tag_or_content)
        .filter_map(|caps| caps.get(1).map(|m| m.as_str().to_string()))
        .collect()
}

pub fn push_page_screenshot_followup(api_messages: &mut Vec<Value>, tag: &str, model: &str) {
    let accepts = crate::agent::model_router::model_accepts_images(model);
    let data_urls = attached_image_data_urls(tag);
    if accepts {
        if data_urls.is_empty() {
            api_messages.push(json!({
                "role": "user",
                "content": "screenshot_page ran but no image data was available. Do not claim the UI looks correct. Check the preview for Build Error overlays, blank pages, or broken layout another way (terminal, lints, reading the file).",
            }));
            return;
        }
        let is_anthropic = model.starts_with("anthropic/");
        let mut parts: Vec<Value> = vec![json!({
            "type": "text",
            "text": "screenshot_page captured this page. Look at the image(s) below before claiming success. Build Error overlays, blank/white pages, missing layout, or crash screens mean keep fixing."
        })];
        for data_url in data_urls {
            if is_anthropic {
                if let Some(comma_pos) = data_url.find(',') {
                    let prefix = &data_url[..comma_pos];
                    let data = &data_url[comma_pos + 1..];
                    let media_type = if prefix.contains("image/png") {
                        "image/png"
                    } else if prefix.contains("image/gif") {
                        "image/gif"
                    } else if prefix.contains("image/webp") {
                        "image/webp"
                    } else {
                        "image/jpeg"
                    };
                    parts.push(json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": data
                        }
                    }));
                    continue;
                }
            }
            parts.push(json!({
                "type": "image_url",
                "image_url": { "url": data_url }
            }));
        }
        api_messages.push(json!({ "role": "user", "content": parts }));
    } else {
        api_messages.push(json!({
            "role": "user",
            "content": "screenshot_page captured a page for the user UI, but this model cannot see image pixels. Do not claim the UI looks correct from the screenshot. Verify via terminal output, Build Error text, lints, or reading the broken file instead.",
        }));
    }
}

const CLEARED_TOOL_RESULT: &str = "[cleared to save context — re-call the tool only if you still need this]";
const TRIMMED_TOOL_RESULT_SUFFIX: &str =
    "\n[middle omitted to save context — re-read only the specific lines you still need]";

/// Soft budget (~15k tokens): trim old tool results to a short excerpt.
const TOOL_RESULT_SOFT_BUDGET: usize = 60_000;
/// Hard budget (~25k tokens): clear old tool results entirely.
const TOOL_RESULT_CHAR_BUDGET: usize = 100_000;
/// Never touch results from the most recent tool rounds.
const TOOL_RESULT_KEEP_ROUNDS: usize = 3;
const TOOL_RESULT_TRIM_CHARS: usize = 600;

/// Strip verbose tool XML from prior assistant turns, then trim middle history
/// when the API payload is large. Recent turns stay intact (Cursor-style).
pub fn build_api_history(history: &[ChatMessage]) -> Vec<ChatMessage> {
    let stripped: Vec<ChatMessage> = history
        .iter()
        .map(|msg| {
            if msg.role != "assistant" {
                return msg.clone();
            }
            ChatMessage {
                content: strip_tool_markup_for_api(&msg.content),
                ..msg.clone()
            }
        })
        .collect();

    trim_middle_history(&stripped, API_HISTORY_SOFT_BUDGET)
}

fn strip_think_blocks(content: &str) -> String {
    let mut out = content.to_string();
    for (open, close) in [("<think", "</think>"), ("<thought", "</thought>")] {
        loop {
            let Some(start) = out.find(open) else { break };
            let after_gt = out[start..]
                .find('>')
                .map(|i| start + i + 1)
                .unwrap_or(out.len());
            if let Some(rel_end) = out[after_gt..].find(close) {
                let end = after_gt + rel_end + close.len();
                out.replace_range(start..end, "");
            } else {
                out.replace_range(start.., "");
                break;
            }
        }
    }
    out
}

fn strip_tool_markup_for_api(content: &str) -> String {
    let tags = [
        "<cat>", "</cat>", "<ls>", "</ls>", "<edit>", "</edit>",
        "<status>", "</status>", "<tool_result>", "</tool_result>",
        "<search_result", "<inspect_runtime", "<terminal_command", "</terminal_command>",
        "<questions", "</questions>", "<question", "</question>",
    ];
    let mut out = strip_think_blocks(content);
    for tag in tags {
        while let Some(start) = out.find(tag) {
            if tag.starts_with('<') && !tag.ends_with('>') {
                if let Some(end) = out[start..].find('>') {
                    out.replace_range(start..start + end + 1, "");
                    continue;
                }
            }
            out = out.replacen(tag, "", 1);
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Graduated tool-result pruning: trim first, then clear. Preserves recent rounds.
///
/// Returns true when a `read_file` result was pruned, which tells the caller its record
/// of what the model has already seen is stale — otherwise the turn loop would block a
/// re-read of content it just removed from the transcript.
pub fn clear_old_tool_results(api_messages: &mut [Value]) -> bool {
    let content_len = |msg: &Value| {
        msg.get("content")
            .and_then(|c| c.as_str())
            .map(|s| s.len())
            .unwrap_or(0)
    };
    let is_read = |msg: &Value| msg.get("name").and_then(|n| n.as_str()) == Some("read_file");
    let mut total: usize = api_messages.iter().map(content_len).sum();
    if total <= TOOL_RESULT_SOFT_BUDGET {
        return false;
    }

    let protected_from = protected_tool_round_index(api_messages);
    if protected_from == 0 {
        return false;
    }
    let mut pruned_read = false;

    // Phase 1: trim verbose old results to a short head+tail excerpt. File reads are the
    // most expensive thing to reconstruct, so only touch them once everything else is trimmed.
    for reads_now in [false, true] {
        for msg in api_messages.iter_mut().take(protected_from) {
            if total <= TOOL_RESULT_SOFT_BUDGET {
                break;
            }
            if msg.get("role").and_then(|r| r.as_str()) != Some("tool") || is_read(msg) != reads_now
            {
                continue;
            }
            let Some(content) = msg.get("content").and_then(|c| c.as_str()) else {
                continue;
            };
            if content.len() <= TOOL_RESULT_TRIM_CHARS
                || content == CLEARED_TOOL_RESULT
                || content.ends_with(TRIMMED_TOOL_RESULT_SUFFIX)
            {
                continue;
            }
            let trimmed = truncate_with_ellipsis(content, TOOL_RESULT_TRIM_CHARS);
            let trimmed = format!("{trimmed}{TRIMMED_TOOL_RESULT_SUFFIX}");
            let len = content.len();
            if let Some(obj) = msg.as_object_mut() {
                obj.insert("content".to_string(), Value::String(trimmed.clone()));
                total = total.saturating_sub(len) + trimmed.len();
                pruned_read |= reads_now;
            }
        }
    }

    // Phase 2: clear oldest results if still over the hard budget.
    if total <= TOOL_RESULT_CHAR_BUDGET {
        return pruned_read;
    }
    for msg in api_messages.iter_mut().take(protected_from) {
        if total <= TOOL_RESULT_CHAR_BUDGET {
            break;
        }
        if msg.get("role").and_then(|r| r.as_str()) == Some("tool") {
            let len = content_len(msg);
            let was_read = is_read(msg);
            if let Some(obj) = msg.as_object_mut() {
                obj.insert(
                    "content".to_string(),
                    Value::String(CLEARED_TOOL_RESULT.to_string()),
                );
                total = total.saturating_sub(len) + CLEARED_TOOL_RESULT.len();
                pruned_read |= was_read;
            }
        }
    }
    pruned_read
}

fn protected_tool_round_index(api_messages: &[Value]) -> usize {
    let mut tool_round_starts: Vec<usize> = Vec::new();
    for (i, msg) in api_messages.iter().enumerate() {
        if msg.get("role").and_then(|r| r.as_str()) == Some("assistant")
            && msg.get("tool_calls").is_some()
        {
            tool_round_starts.push(i);
        }
    }
    if tool_round_starts.len() <= TOOL_RESULT_KEEP_ROUNDS {
        return api_messages.len();
    }
    tool_round_starts[tool_round_starts.len() - TOOL_RESULT_KEEP_ROUNDS]
}

/// ~15k tokens — fold older turns before the window gets expensive on cheap models.
pub const HISTORY_CHAR_BUDGET: usize = 60_000;
/// Soft cap on API history chars before middle turns are head/tail trimmed.
const API_HISTORY_SOFT_BUDGET: usize = 40_000;
const KEEP_RECENT_MESSAGES: usize = 10;
const MIDDLE_MESSAGE_MAX_CHARS: usize = 800;

pub fn history_char_count(history: &[ChatMessage]) -> usize {
    history.iter().map(|m| m.content.len()).sum()
}

/// Middle slice of history to fold into a running summary (keeps first + recent turns).
pub fn slice_for_compression(history: &[ChatMessage]) -> String {
    if history.len() <= KEEP_RECENT_MESSAGES + 2 {
        return String::new();
    }
    let end = history.len().saturating_sub(KEEP_RECENT_MESSAGES);
    history[1..end]
        .iter()
        .map(|m| {
            let body = strip_heavy_content_for_summary(&m.content);
            let excerpt: String = body.chars().take(1_500).collect();
            format!("[{}] {}", m.role, excerpt)
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

pub fn apply_summary(history: &[ChatMessage], summary: Option<&str>) -> Vec<ChatMessage> {
    let Some(summary) = summary.filter(|s| !s.trim().is_empty()) else {
        return history.to_vec();
    };
    if history.len() <= KEEP_RECENT_MESSAGES + 1 {
        return history.to_vec();
    }

    let mut out = Vec::new();
    if let Some(first) = history.first() {
        out.push(first.clone());
    }
    out.push(ChatMessage {
        role: "user".to_string(),
        content: format!(
            "<chat_summary>\nEarlier conversation summary (for context):\n{}\n</chat_summary>",
            summary.trim()
        ),
        timestamp: now_f64(),
        stats: None,
        model: None,
        feedback: None,
    });
    let start = history.len().saturating_sub(KEEP_RECENT_MESSAGES);
    out.extend_from_slice(&history[start..]);
    out
}

fn trim_middle_history(history: &[ChatMessage], soft_budget: usize) -> Vec<ChatMessage> {
    let total: usize = history.iter().map(|m| m.content.len()).sum();
    if total <= soft_budget || history.len() <= KEEP_RECENT_MESSAGES + 2 {
        return history.to_vec();
    }

    let protect_tail = KEEP_RECENT_MESSAGES.min(history.len());
    let protect_head = 1usize;
    let trim_end = history.len().saturating_sub(protect_tail);

    history
        .iter()
        .enumerate()
        .map(|(i, msg)| {
            if i < protect_head || i >= trim_end {
                return msg.clone();
            }
            if msg.content.chars().count() <= MIDDLE_MESSAGE_MAX_CHARS {
                return msg.clone();
            }
            ChatMessage {
                content: truncate_with_ellipsis(&msg.content, MIDDLE_MESSAGE_MAX_CHARS),
                ..msg.clone()
            }
        })
        .collect()
}

fn truncate_with_ellipsis(text: &str, max_chars: usize) -> String {
    let char_count = text.chars().count();
    if char_count <= max_chars {
        return text.to_string();
    }
    let head = max_chars * 2 / 3;
    let tail = max_chars.saturating_sub(head).max(80);
    let head_s: String = text.chars().take(head).collect();
    let tail_s: String = text.chars().skip(char_count.saturating_sub(tail)).collect();
    let omitted = char_count.saturating_sub(head + tail);
    format!("{head_s}\n\n[... {omitted} chars omitted ...]\n\n{tail_s}")
}

pub(crate) fn strip_heavy_content_for_summary(content: &str) -> String {
    let image_re = Regex::new(r#"(?s)<attached_image[^>]*>.*?</attached_image>"#).unwrap();
    image_re
        .replace_all(content, "[attached image omitted from summary]")
        .to_string()
}

fn now_f64() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::model_router::{MODEL_FAST, MODEL_FAST_VISION};

    #[test]
    fn trim_middle_history_preserves_recent_turns() {
        let history: Vec<ChatMessage> = (0..20)
            .map(|i| ChatMessage {
                role: if i % 2 == 0 { "user" } else { "assistant" }.to_string(),
                content: "x".repeat(10_000),
                timestamp: 0.0,
                stats: None,
                model: None,
                feedback: None,
            })
            .collect();
        let trimmed = trim_middle_history(&history, 50_000);
        assert_eq!(trimmed.len(), history.len());
        assert_eq!(trimmed.last().unwrap().content.len(), 10_000);
        assert!(trimmed[5].content.contains("chars omitted"));
    }

    #[test]
    fn truncate_with_ellipsis_keeps_head_and_tail() {
        let text = (0..100).map(|i| format!("line{i} ")).collect::<String>();
        let out = truncate_with_ellipsis(&text, 40);
        assert!(out.contains("chars omitted"));
        assert!(out.starts_with("line0"));
    }

    fn msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.to_string(),
            content: content.to_string(),
            timestamp: 0.0,
            stats: None,
            model: None,
            feedback: None,
        }
    }

    #[test]
    fn build_messages_strips_images_for_text_only_model() {
        let history = vec![msg(
            "user",
            "look <attached_image name=\"a.png\">data:image/png;base64,aaa</attached_image>",
        )];
        let out = build_messages_json("sys", &history, MODEL_FAST);
        assert_eq!(out.len(), 2);
        let content = out[1].get("content").and_then(|c| c.as_str()).unwrap();
        assert!(content.contains("cannot view images") || content.contains("omitted"));
        assert!(!content.contains("data:image"));
        let serialized = serde_json::to_string(&out).unwrap();
        assert!(!serialized.contains("image_url"));
    }

    #[test]
    fn build_messages_emits_image_url_for_vision_model() {
        let history = vec![msg(
            "user",
            "look <attached_image name=\"a.png\">data:image/png;base64,aaa</attached_image>",
        )];
        let out = build_messages_json("sys", &history, MODEL_FAST_VISION);
        let content = out[1].get("content").unwrap();
        assert!(content.is_array());
        let parts = content.as_array().unwrap();
        assert!(parts
            .iter()
            .any(|p| p.get("type").and_then(|t| t.as_str()) == Some("image_url")));
        assert!(parts.iter().any(|p| {
            p.pointer("/image_url/url")
                .and_then(|u| u.as_str())
                .is_some_and(|u| u.starts_with("data:image/png"))
        }));
    }

    #[test]
    fn build_messages_ignores_assistant_image_tags_as_multipart() {
        let history = vec![msg(
            "assistant",
            "done <attached_image name=\"a.png\">data:image/png;base64,aaa</attached_image>",
        )];
        let out = build_messages_json("sys", &history, MODEL_FAST_VISION);
        let content = out[1].get("content").and_then(|c| c.as_str()).unwrap();
        assert!(content.contains("<attached_image"));
        let serialized = serde_json::to_string(&out).unwrap();
        assert!(!serialized.contains("\"type\":\"image_url\""));
    }

    #[test]
    fn screenshot_followup_injects_user_image_for_vision() {
        let mut api = Vec::new();
        let tag = "<attached_image name=\"page.png\" type=\"image/png\">data:image/png;base64,abc</attached_image>";
        push_page_screenshot_followup(&mut api, tag, MODEL_FAST_VISION);
        assert_eq!(api.len(), 1);
        assert_eq!(api[0]["role"], "user");
        let parts = api[0]["content"].as_array().unwrap();
        assert!(parts.iter().any(|p| p["type"] == "image_url"));
        assert_eq!(
            parts.iter().find(|p| p["type"] == "image_url").unwrap()["image_url"]["url"],
            "data:image/png;base64,abc"
        );
    }

    #[test]
    fn screenshot_followup_text_only_when_model_rejects_images() {
        let mut api = Vec::new();
        let tag = "<attached_image name=\"page.png\" type=\"image/png\">data:image/png;base64,abc</attached_image>";
        push_page_screenshot_followup(&mut api, tag, MODEL_FAST);
        assert_eq!(api.len(), 1);
        assert_eq!(api[0]["role"], "user");
        let text = api[0]["content"].as_str().unwrap();
        assert!(text.contains("cannot see image"));
        assert!(!serde_json::to_string(&api).unwrap().contains("image_url"));
    }
}
