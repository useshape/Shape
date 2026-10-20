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

fn resolve_image_model(args: &Value, ctx: &ToolCtx<'_>) -> Result<String, String> {
    let requested = args
        .get("model")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(normalize_image_model);
    let mentioned = mentioned_image_model(ctx);
    match (mentioned, requested) {
        (Some(required), Some(got)) if required != got => Err(format!(
            "The user selected @{}. Do not use {got}. If @{required} cannot do this, tell them and name @klein9 or @mini. Do not swap models.",
            required
        )),
        (Some(required), _) => Ok(api_image_model(&required)),
        (_, Some(got)) => Ok(api_image_model(&got)),
        _ if args.get("media_id").is_some() || args.get("attachment").is_some() => {
            Ok("flux-2-klein-9b".to_string())
        }
        _ => Ok("flux-2-klein-4b".to_string()),
    }
}

fn normalize_image_model(raw: &str) -> String {
    match raw.trim().trim_start_matches('@').to_ascii_lowercase().as_str() {
        "flux" | "klein" | "flux-2-klein-4b" | "flux.2-klein-4b" => "klein".to_string(),
        "klein9" | "klein-9" | "flux-2-klein-9b" => "klein9".to_string(),
        "mini" | "gpt-image-1-mini" | "gpt-image-mini" => "mini".to_string(),
        other => other.to_string(),
    }
}

fn api_image_model(alias: &str) -> String {
    match alias {
        "klein" => "flux-2-klein-4b".to_string(),
        "klein9" => "flux-2-klein-9b".to_string(),
        "mini" => "gpt-image-1-mini".to_string(),
        other => other.to_string(),
    }
}

fn mentioned_image_model(ctx: &ToolCtx<'_>) -> Option<String> {
    let history = ctx.agent_state.history.lock().ok()?;
    let text = history.iter().rev().find(|m| m.role == "user")?.content.to_ascii_lowercase();
    for (token, alias) in [
        ("@klein9", "klein9"),
        ("@klein-9", "klein9"),
        ("@flux-2-klein-9b", "klein9"),
        ("@mini", "mini"),
        ("@gpt-image-1-mini", "mini"),
        ("@klein", "klein"),
        ("@flux", "klein"),
    ] {
        if text.contains(token) {
            return Some(alias.to_string());
        }
    }
    None
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

    let model = match resolve_image_model(args, ctx) {
        Ok(m) => m,
        Err(e) => return fail_with_prompt(kind, &e, false, prompt, ""),
    };
    let count = if kind == "image" {
        args.get("count")
            .and_then(|v| v.as_u64())
            .unwrap_or(1)
            .clamp(1, 4) as usize
    } else {
        1
    };
    let parent_id = args
        .get("media_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let batch_id = if count > 1 {
        Some(uuid::Uuid::new_v4().to_string())
    } else {
        None
    };

    let tag = match kind {
        "svg" => "generated_svg",
        "audio" => "generated_audio",
        _ => "generated_image",
    };

    let mut reference = None;
    if kind == "edit" {
        match resolve_reference_image(args, ctx).await {
            Ok(img) => reference = Some(img),
            Err(e) => return fail_with_prompt(kind, &e, false, prompt, &model),
        }
    }

    let mut results = Vec::new();
    let mut total_credits = 0.0;
    let mut i = 0;
    while i < count {
        let batch = (i..count.min(i + 2)).collect::<Vec<_>>();
        let mut handles = Vec::new();
        for ordinal in batch {
            let mut body = json!({ "kind": kind, "prompt": prompt, "model": model });
            if kind == "audio" {
                if let Some(voice) = args.get("voice").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
                    body["voice"] = json!(voice);
                }
            }
            if let Some(img) = &reference {
                body["image"] = json!(img);
                body["input_image"] = json!(img);
            }
            let api_key = ctx.api_key.to_string();
            let turn = ctx.turn_id.clone();
            let conv = ctx.conversation_id.clone();
            handles.push(async move {
                super::plugins::plugin_request(
                    "POST",
                    "/api/generate",
                    &api_key,
                    Some(body),
                    turn.as_deref(),
                    conv.as_deref(),
                )
                .await
                .map(|data| (ordinal, data))
            });
        }
        let joined = futures::future::join_all(handles).await;
        for item in joined {
            match item {
                Ok((ordinal, data)) => {
                    if let Some(err) = data.get("error").and_then(|v| v.as_str()) {
                        return fail_with_prompt(kind, err, !results.is_empty(), prompt, &model);
                    }
                    let url = data.get("url").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                    if url.is_empty() {
                        return fail_with_prompt(
                            kind,
                            "Generation did not return media.",
                            !results.is_empty(),
                            prompt,
                            &model,
                        );
                    }
                    let credits = data.get("creditsCharged").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    total_credits += credits;
                    let media_id = stash_generated(
                        &url,
                        kind,
                        prompt,
                        ctx,
                        media_stash::StashMeta {
                            model: Some(model.clone()),
                            parent_id: parent_id.clone(),
                            batch_id: batch_id.clone(),
                            ordinal: Some((ordinal + 1) as u32),
                        },
                    )
                    .await;
                    let id_attr = media_id
                        .as_ref()
                        .map(|id| format!(" media_id=\"{id}\" model=\"{model}\" ordinal=\"{}\"", ordinal + 1))
                        .unwrap_or_default();
                    ctx.emit_ui_token(&format!("\n<{tag} credits=\"{credits:.2}\"{id_attr}>{url}</{tag}>\n"));
                    results.push((url, media_id, credits, ordinal + 1));
                }
                Err(e) => return fail_with_prompt(kind, &e, !results.is_empty(), prompt, &model),
            }
        }
        i += 2;
    }

    let label = match kind {
        "svg" => "SVG",
        "audio" => "audio clip",
        "edit" => "edited image",
        _ => "image",
    };
    let ids = results
        .iter()
        .filter_map(|(_, id, _, n)| id.as_ref().map(|id| format!("{n}:{id}")))
        .collect::<Vec<_>>()
        .join(", ");
    let result = format!(
        "Generated {count} {label}(s) with {model} (billed {:.2} Shape credits). media_id list: {ids}. Preview is in the chat UI. Do not dump binary. Mention ordinals when referring to an option.",
        total_credits
    );
    ToolOutcome {
        tool_result: result,
        ui_chunk: String::new(),
        side_effect: None,
    }
}

async fn stash_generated(
    url: &str,
    kind: &str,
    prompt: &str,
    ctx: &ToolCtx<'_>,
    meta: media_stash::StashMeta,
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
    media_stash::stash_bytes_meta(
        &bytes,
        &mime,
        kind,
        ctx.conversation_id.as_deref(),
        Some(prompt),
        None,
        meta,
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
    fail_with_prompt(kind, message, already_streamed_card, "", "")
}

fn fail_with_prompt(
    kind: &str,
    message: &str,
    already_streamed_card: bool,
    prompt: &str,
    model: &str,
) -> ToolOutcome {
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
    let alias = match model {
        "flux-2-klein-9b" => "klein9",
        "gpt-image-1-mini" => "mini",
        "flux-2-klein-4b" => "klein",
        other if !other.is_empty() => other,
        _ => "",
    };
    let hint = if message.to_ascii_lowercase().contains("not configured") || message.to_ascii_lowercase().contains("unavailable") {
        match alias {
            "klein" => " Try @klein9 or @mini.",
            "klein9" => " Try @mini.",
            _ => "",
        }
    } else {
        ""
    };
    let ui = if already_streamed_card {
        String::new()
    } else if matches!(kind, "image" | "edit" | "svg") {
        let tag = if kind == "svg" { "generated_svg" } else { "generated_image" };
        format!(
            "\n<{tag} prompt=\"{}\" model=\"{model}\" failed=\"1\"></{tag}>\n",
            prompt.replace('"', "'")
        )
    } else {
        format!("\n<tool_result>\n[{name}] ERROR: {message}\n</tool_result>\n")
    };
    ToolOutcome {
        tool_result: format!("ERROR: {message}.{hint}{extra}"),
        ui_chunk: ui,
        side_effect: None,
    }
}
