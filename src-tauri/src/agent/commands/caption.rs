//! Cheap image captions for models that cannot see pixels.
//!
//! Auto stays on the fast text model. A tiny vision call describes attached
//! screenshots so DeepSeek (or any text-only model) can act on them without
//! running the whole agent turn on Gemini Flash.

use regex::Regex;
use serde_json::{json, Value};
use super::logging;
use super::streaming::{self, ProxyContext};
use super::super::models::ChatMessage;
use crate::agent::model_router::{self};
use crate::core::error::AppError;
use reqwest::Client;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::{Mutex, OnceLock};

const CAPTION_PROMPT: &str = "Describe this image for a coding agent. Cover visible UI, layout, text, errors, and anything a developer needs to act on. Be concrete. No greeting.";
const CAPTION_MAX_TOKENS: u32 = 400;

fn image_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?s)<attached_image([^>]*)>(data:[^<]+)</attached_image>"#)
            .expect("attached image regex")
    })
}

fn caption_cache() -> &'static Mutex<HashMap<u64, String>> {
    static CACHE: OnceLock<Mutex<HashMap<u64, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn fingerprint(url: &str) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    url.len().hash(&mut hasher);
    url.hash(&mut hasher);
    hasher.finish()
}

fn cached_caption(url: &str) -> Option<String> {
    caption_cache()
        .lock()
        .ok()
        .and_then(|cache| cache.get(&fingerprint(url)).cloned())
}

fn store_caption(url: &str, caption: &str) {
    if caption.trim().is_empty() {
        return;
    }
    if let Ok(mut cache) = caption_cache().lock() {
        cache.insert(fingerprint(url), caption.trim().to_string());
    }
}

fn image_name(attrs: &str) -> String {
    Regex::new(r#"name="([^"]*)""#)
        .ok()
        .and_then(|re| re.captures(attrs))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "image".to_string())
}

pub fn content_data_urls(content: &str) -> Vec<(String, String)> {
    image_re()
        .captures_iter(content)
        .filter_map(|caps| {
            let name = image_name(caps.get(1).map(|m| m.as_str()).unwrap_or(""));
            let url = caps.get(2)?.as_str().to_string();
            Some((name, url))
        })
        .collect()
}

pub fn replace_images_with_text(content: &str, descriptions: &[String]) -> String {
    let mut i = 0;
    image_re()
        .replace_all(content, |_caps: &regex::Captures| {
            let desc = descriptions
                .get(i)
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .unwrap_or("Image attached.");
            i += 1;
            format!("\n[image description]\n{desc}\n")
        })
        .to_string()
}

async fn describe_urls(
    client: &Client,
    api_key: &str,
    images: &[(String, String)],
    proxy_ctx: &ProxyContext,
    cancel: Option<&tokio_util::sync::CancellationToken>,
) -> Result<Vec<String>, AppError> {
    if images.is_empty() {
        return Ok(Vec::new());
    }
    let cached: Vec<Option<String>> = images.iter().map(|(_, url)| cached_caption(url)).collect();
    if cached.iter().all(|c| c.is_some()) {
        return Ok(cached.into_iter().flatten().collect());
    }
    let mut parts: Vec<Value> = vec![json!({ "type": "text", "text": CAPTION_PROMPT })];
    for (name, url) in images {
        parts.push(json!({ "type": "text", "text": format!("Image: {name}") }));
        parts.push(json!({
            "type": "image_url",
            "image_url": { "url": url }
        }));
    }
    let caption_ctx = proxy_ctx.clone().with_feature("caption").fresh_request();
    let text = streaming::complete_chat_messages(
        client,
        api_key,
        vec![json!({ "role": "user", "content": parts })],
        "auto",
        CAPTION_MAX_TOKENS,
        &caption_ctx,
        cancel,
    )
    .await?;
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        return Ok(cached.into_iter().map(|c| c.unwrap_or_default()).collect());
    }
    for (_, url) in images {
        store_caption(url, &trimmed);
    }
    if images.len() == 1 {
        return Ok(vec![trimmed]);
    }
    Ok(vec![trimmed; images.len()])
}

/// Replace `<attached_image>` payloads in API history with text captions.
pub async fn caption_history_images(
    history: &mut [ChatMessage],
    client: &Client,
    api_key: &str,
    proxy_ctx: &ProxyContext,
    cancel: Option<&tokio_util::sync::CancellationToken>,
) -> Result<bool, AppError> {
    let mut any = false;
    for msg in history.iter_mut() {
        if msg.role != "user" {
            continue;
        }
        let images = content_data_urls(&msg.content);
        if images.is_empty() {
            continue;
        }
        match describe_urls(client, api_key, &images, proxy_ctx, cancel).await {
            Ok(captions) => {
                msg.content = replace_images_with_text(&msg.content, &captions);
                any = true;
            }
            Err(err) => {
                logging::warn("caption", &format!("image caption failed: {err}"));
            }
        }
    }
    Ok(any)
}

pub async fn describe_attached_images(
    client: &Client,
    api_key: &str,
    tag_or_content: &str,
    proxy_ctx: &ProxyContext,
    cancel: Option<&tokio_util::sync::CancellationToken>,
) -> Result<String, AppError> {
    let images = content_data_urls(tag_or_content);
    let captions = describe_urls(client, api_key, &images, proxy_ctx, cancel).await?;
    Ok(captions
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n"))
}

pub fn should_caption(model: &str, has_images: bool) -> bool {
    has_images && !model_router::model_accepts_images(model)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_named_data_urls() {
        let content = r#"see <attached_image name="shot.png">data:image/png;base64,abc</attached_image>"#;
        let images = content_data_urls(content);
        assert_eq!(images.len(), 1);
        assert_eq!(images[0].0, "shot.png");
        assert!(images[0].1.starts_with("data:image/png"));
    }

    #[test]
    fn replaces_pixels_with_caption() {
        let content = r#"look <attached_image name="a.png">data:image/png;base64,aaa</attached_image> please"#;
        let out = replace_images_with_text(content, &["A red login form.".into()]);
        assert!(out.contains("A red login form."));
        assert!(!out.contains("data:image"));
        assert!(out.contains("look"));
        assert!(out.contains("please"));
    }

    #[test]
    fn captions_text_only_models() {
        assert!(should_caption(model_router::MODEL_FAST, true));
        assert!(!should_caption(model_router::MODEL_IMAGE_CAPTION, true));
        assert!(!should_caption("anthropic/claude-sonnet-4", true));
        assert!(!should_caption("openai/gpt-5.4", true));
        assert!(!should_caption("google/gemini-3.1-pro-preview", true));
        assert!(!should_caption("x-ai/grok-4.3", true));
        assert!(!should_caption(model_router::MODEL_FAST, false));
    }
}
