use serde_json::{json, Value};

use crate::agent::media_stash;

use super::dispatch::{ToolCtx, ToolOutcome};

pub async fn tool_generate_svg(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    generate_media("svg", args, ctx).await
}

pub async fn tool_generate_image(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    generate_media("image", args, ctx).await
}

pub async fn tool_generate_audio(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    generate_media("audio", args, ctx).await
}

pub async fn tool_edit_image(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    generate_media("edit", args, ctx).await
}

async fn generate_media(kind: &str, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let prompt = args
        .get("prompt")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if prompt.is_empty() {
        return fail(kind, "prompt is required.", false);
    }
    if ctx.api_key.is_empty() {
        return fail(kind, "Sign in to Shape to generate media.", false);
    }

    let tag = match kind {
        "svg" => "generated_svg",
        "audio" => "generated_audio",
        _ => "generated_image",
    };
    ctx.emit_ui_token(&format!("<{tag}>"));

    let mut body = json!({ "kind": kind, "prompt": prompt });
    if kind == "audio" {
        if let Some(voice) = args.get("voice").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
            body["voice"] = json!(voice);
        }
    }
    if kind == "edit" {
        match resolve_reference_image(args, ctx).await {
            Ok(img) => body["image"] = json!(img),
            Err(e) => {
                ctx.emit_ui_token(&format!("</{tag}>\n"));
                return fail(kind, &e, true);
            }
        }
    }

    match super::plugins::plugin_request(
        "POST",
        "/api/generate",
        ctx.api_key,
        Some(body),
        ctx.turn_id.as_deref(),
        ctx.conversation_id.as_deref(),
    )
    .await
    {
        Ok(data) => {
            if let Some(err) = data.get("error").and_then(|v| v.as_str()) {
                ctx.emit_ui_token(&format!("</{tag}>\n"));
                return fail(kind, err, true);
            }
            let url = data
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if url.is_empty() {
                ctx.emit_ui_token(&format!("</{tag}>\n"));
                return fail(kind, "Generation did not return media.", true);
            }
            let credits = data
                .get("creditsCharged")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);

            let media_id = stash_generated(url, kind, prompt, ctx).await;
            let id_attr = media_id
                .as_ref()
                .map(|id| format!(" media_id=\"{id}\""))
                .unwrap_or_default();

            ctx.emit_ui_token(&format!("{url}</{tag}>\n"));
            let label = match kind {
                "svg" => "SVG",
                "audio" => "audio clip",
                "edit" => "edited image",
                _ => "image",
            };
            let url_note = if url.starts_with("data:") {
                String::new()
            } else {
                format!("\nurl: {url}")
            };
            let id_note = media_id
                .as_ref()
                .map(|id| format!("\nmedia_id: {id} (already stashed locally — use save_media with media_id; never ask the user to download first)"))
                .unwrap_or_default();
            let result = format!(
                "Generated {label} (tool call, billed {:.2} Shape credits). Preview is in the chat UI. Do not dump binary/markup unless they asked. Only write it into the project with `save_media` if they asked to save or use it as a file.{url_note}{id_note}",
                credits
            );
            ToolOutcome {
                tool_result: result,
                ui_chunk: format!("\n<{tag} credits=\"{credits:.2}\"{id_attr}>{url}</{tag}>\n"),
                side_effect: None,
            }
        }
        Err(e) => {
            ctx.emit_ui_token(&format!("</{tag}>\n"));
            fail(kind, &e, true)
        }
    }
}

async fn stash_generated(
    url: &str,
    kind: &str,
    prompt: &str,
    ctx: &ToolCtx<'_>,
) -> Option<String> {
    let mime_bytes: Option<(String, Vec<u8>)> = if url.starts_with("data:") {
        media_stash::decode_data_url(url).ok()
    } else if url.starts_with("http://") || url.starts_with("https://") {
        match ctx.client.get(url).send().await {
            Ok(resp) if resp.status().is_success() => {
                let mime = resp
                    .headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or(match kind {
                        "svg" => "image/svg+xml",
                        "audio" => "audio/mpeg",
                        _ => "image/png",
                    })
                    .to_string();
                match resp.bytes().await {
                    Ok(b) => Some((mime, b.to_vec())),
                    Err(_) => None,
                }
            }
            _ => None,
        }
    } else {
        None
    };

    let (mime, bytes) = mime_bytes?;
    media_stash::stash_bytes(
        &bytes,
        &mime,
        kind,
        ctx.conversation_id.as_deref(),
        Some(prompt),
        None,
    )
    .ok()
    .map(|e| e.id)
}

async fn resolve_reference_image(args: &Value, ctx: &ToolCtx<'_>) -> Result<String, String> {
    if let Some(id) = args
        .get("media_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let entry = media_stash::get(id).ok_or_else(|| format!("Unknown media_id '{id}'."))?;
        let bytes = std::fs::read(&entry.path).map_err(|e| e.to_string())?;
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
        return Ok(format!("data:{};base64,{b64}", entry.mime));
    }
    if let Some(att) = args
        .get("attachment")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        if let Some(entry) = media_stash::find_by_name(att) {
            let bytes = std::fs::read(&entry.path).map_err(|e| e.to_string())?;
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
            return Ok(format!("data:{};base64,{b64}", entry.mime));
        }
        // Fall through: files::find_attached may be used by save_media; for edit we scan history below.
        let history = ctx
            .agent_state
            .history
            .lock()
            .map_err(|_| "Could not read chat history.".to_string())?;
        let needle = att.to_ascii_lowercase();
        for msg in history.iter().rev() {
            if let Some(data) = extract_data_url_named(&msg.content, &needle) {
                let _ = media_stash::stash_data_url(
                    &data,
                    "image",
                    ctx.conversation_id.as_deref(),
                    None,
                    Some(att),
                );
                return Ok(data);
            }
        }
        return Err(format!("No attached/generated image named '{att}'."));
    }
    if let Some(path) = args
        .get("path")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let abs = crate::agent::security::paths::validate_read_path(path, ctx.project_path)
            .map_err(|e| e.to_string())?;
        let bytes = std::fs::read(&abs).map_err(|e| e.to_string())?;
        let mime = mime_from_path(&abs);
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
        return Ok(format!("data:{mime};base64,{b64}"));
    }
    Err("Pass media_id, attachment, or path for the image to edit.".to_string())
}

fn extract_data_url_named(content: &str, needle: &str) -> Option<String> {
    for tag in ["attached_image", "attached_asset", "generated_image", "generated_svg"] {
        let open = format!("<{tag}");
        let close = format!("</{tag}>");
        let mut rest = content;
        while let Some(start) = rest.find(&open) {
            let after = &rest[start..];
            let Some(end_attrs) = after.find('>') else { break };
            let attrs = &after[..end_attrs];
            let name = attrs
                .split("name=\"")
                .nth(1)
                .and_then(|s| s.split('"').next())
                .unwrap_or("");
            let body_start = start + end_attrs + 1;
            let Some(rel_end) = rest[body_start..].find(&close) else { break };
            let body = rest[body_start..body_start + rel_end].trim();
            if name.eq_ignore_ascii_case(needle) || needle.is_empty() {
                if body.starts_with("data:") || body.starts_with("http") {
                    return Some(body.to_string());
                }
            }
            rest = &rest[body_start + rel_end + close.len()..];
        }
    }
    None
}

fn mime_from_path(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "svg" => "image/svg+xml",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    }
}

fn fail(kind: &str, message: &str, already_streamed_card: bool) -> ToolOutcome {
    let name = match kind {
        "svg" => "generate_svg",
        "audio" => "generate_audio",
        "edit" => "edit_image",
        _ => "generate_image",
    };
    let configured = !message.to_ascii_lowercase().contains("not configured");
    let extra = if configured {
        String::new()
    } else {
        " Generation is unavailable. Tell the user that. Do not retry generate_svg, generate_image, generate_audio, or edit_image. Do not create, edit, or write media files as a substitute. Asking to generate media is not asking for a project file."
            .to_string()
    };
    let ui = if already_streamed_card {
        String::new()
    } else {
        format!("\n<tool_result>\n[{name}] ERROR: {message}\n</tool_result>\n")
    };
    ToolOutcome {
        tool_result: format!("ERROR: {message}.{extra}"),
        ui_chunk: ui,
        side_effect: None,
    }
}
