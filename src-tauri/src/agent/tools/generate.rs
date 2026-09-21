use serde_json::{json, Value};

use super::dispatch::{ToolCtx, ToolOutcome};

fn xml_attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .chars()
        .take(180)
        .collect()
}

pub async fn tool_generate_svg(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    generate_media("svg", args, ctx).await
}

pub async fn tool_generate_image(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    generate_media("image", args, ctx).await
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

    let tag = if kind == "svg" {
        "generated_svg"
    } else {
        "generated_image"
    };
    ctx.emit_ui_token(&format!(
        "<{tag} prompt=\"{}\">",
        xml_attr(prompt)
    ));

    match super::plugins::plugin_request(
        "POST",
        "/api/generate",
        ctx.api_key,
        Some(json!({ "kind": kind, "prompt": prompt })),
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
                return fail(kind, "Generation did not return an image.", true);
            }
            let credits = data
                .get("creditsCharged")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            ctx.emit_ui_token(&format!("{url}</{tag}>\n"));
            let label = if kind == "svg" { "SVG" } else { "image" };
            let result = format!(
                "Generated an {label} (tool call, billed {:.2} Shape credits). Preview is in the chat UI. Do not dump binary/markup unless they asked. Only write it into the project with `save_media` if they asked to save or use it as a file.\nurl: {url}",
                credits
            );
            ToolOutcome {
                tool_result: result,
                ui_chunk: String::new(),
                side_effect: None,
            }
        }
        Err(e) => {
            ctx.emit_ui_token(&format!("</{tag}>\n"));
            fail(kind, &e, true)
        }
    }
}

fn fail(kind: &str, message: &str, already_streamed_card: bool) -> ToolOutcome {
    let name = if kind == "svg" {
        "generate_svg"
    } else {
        "generate_image"
    };
    let configured = !message.to_ascii_lowercase().contains("not configured");
    let extra = if configured {
        String::new()
    } else {
        " Do not retry generate_svg or generate_image. Do not write an SVG or image file into the project unless the user explicitly asked for a file. Briefly tell them generation is unavailable."
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
