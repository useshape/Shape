//! Design review: several persona agents browse the site at once, each in an
//! isolated browser session, and report how the experience landed for them.
//! The browser side of the adversarial review — no sub-chats, just cards.

use std::time::Duration;

use futures::future::join_all;
use serde_json::{json, Value};
use tauri::Emitter;

use crate::agent::commands::streaming::{self, ProxyContext};
use crate::agent::tools::browse::SNAPSHOT_JS;
use crate::browser::{self, cdp};

use super::common::{clip, error_outcome, escape_xml_attr, get_str};
use super::{ToolCtx, ToolOutcome};

const MAX_PERSONAS: usize = 4;
const DEFAULT_STEPS: u64 = 6;

struct Persona {
    id: String,
    name: String,
    profile: String,
    goal: String,
}

struct PersonaOutcome {
    persona_id: String,
    name: String,
    profile: String,
    goal: String,
    status: &'static str,
    notes: Vec<String>,
    report: Value,
    image: String,
    final_url: String,
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn emit_persona(ctx: &ToolCtx<'_>, review_id: &str, persona: &Persona, payload: Value) {
    let mut body = json!({
        "reviewId": review_id,
        "personaId": persona.id,
        "name": persona.name,
        "profile": persona.profile,
        "goal": persona.goal,
        "turnId": ctx.turn_id,
        "conversationId": ctx.conversation_id,
    });
    if let (Some(base), Some(extra)) = (body.as_object_mut(), payload.as_object()) {
        for (k, v) in extra {
            base.insert(k.clone(), v.clone());
        }
    }
    let _ = ctx.app_handle.emit("agent-persona", body);
}

fn escape_xml_text(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn lenient_json(raw: &str) -> Value {
    let trimmed = raw.trim();
    let start = trimmed.find('{');
    let end = trimmed.rfind('}');
    if let (Some(s), Some(e)) = (start, end) {
        if e > s {
            if let Ok(v) = serde_json::from_str::<Value>(&trimmed[s..=e]) {
                return v;
            }
        }
    }
    Value::Null
}

fn str_of(v: &Value, key: &str) -> String {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("").trim().to_string()
}

fn normalize_url(raw: &str) -> String {
    let s = raw.trim();
    if s.starts_with("http://") || s.starts_with("https://") {
        s.to_string()
    } else {
        format!("https://{s}")
    }
}

pub(super) async fn tool_design_review(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let url = match get_str(args, "url") {
        Ok(u) => normalize_url(&u),
        Err(e) => return error_outcome("design_review", &e),
    };
    let raw_personas = args
        .get("personas")
        .and_then(|p| p.as_array())
        .cloned()
        .unwrap_or_default();
    if raw_personas.is_empty() {
        return error_outcome(
            "design_review",
            "Pass at least one persona: {name, profile, goal}. Make them specific people with a real reason to be on this site.",
        );
    }
    let steps = args
        .get("steps")
        .and_then(|s| s.as_u64())
        .unwrap_or(DEFAULT_STEPS)
        .clamp(3, 10);

    let review_id = format!("dr-{}", now_ms());
    let personas: Vec<Persona> = raw_personas
        .iter()
        .take(MAX_PERSONAS)
        .enumerate()
        .map(|(i, p)| Persona {
            id: format!("{review_id}-{}", i + 1),
            name: {
                let n = str_of(p, "name");
                if n.is_empty() { format!("Persona {}", i + 1) } else { n }
            },
            profile: str_of(p, "profile"),
            goal: str_of(p, "goal"),
        })
        .collect();

    let roster: Vec<Value> = personas
        .iter()
        .map(|p| json!({ "id": p.id, "name": p.name, "profile": p.profile, "goal": p.goal, "status": "running" }))
        .collect();
    let running_ui = format!(
        "\n<persona_review id=\"{}\" url=\"{}\" status=\"running\">{}</persona_review>\n",
        escape_xml_attr(&review_id),
        escape_xml_attr(&url),
        escape_xml_text(&json!({ "url": url, "personas": roster }).to_string()),
    );
    ctx.emit_ui_token(&running_ui);
    for p in &personas {
        emit_persona(ctx, &review_id, p, json!({ "status": "running", "step": 0, "steps": steps, "url": url, "note": "Opening the site…" }));
    }

    let outcomes = join_all(
        personas
            .iter()
            .map(|p| run_persona(ctx, &review_id, p, &url, steps)),
    )
    .await;

    let mut summary = format!("Design review of {url} with {} persona(s).\n", outcomes.len());
    let mut cards: Vec<Value> = Vec::new();
    for out in &outcomes {
        let r = &out.report;
        summary.push_str(&format!(
            "\n## {} — {}\nGoal: {}\nStatus: {}\nScore: {}/5\nVerdict: {}\nFirst impression: {}\nFriction:\n{}\nTrust:\n{}\nMarketing:\n{}\nFixes:\n{}\nWhat they did:\n{}\n",
            out.name,
            out.profile,
            out.goal,
            out.status,
            r.get("score").and_then(|s| s.as_u64()).unwrap_or(0),
            str_of(r, "verdict"),
            str_of(r, "first_impression"),
            bullets(r.get("friction")),
            bullets(r.get("trust")),
            bullets(r.get("marketing")),
            bullets(r.get("fixes")),
            out.notes.iter().map(|n| format!("- {n}")).collect::<Vec<_>>().join("\n"),
        ));
        cards.push(json!({
            "id": out.persona_id,
            "name": out.name,
            "profile": out.profile,
            "goal": out.goal,
            "status": out.status,
            "score": r.get("score").cloned().unwrap_or(Value::Null),
            "verdict": str_of(r, "verdict"),
            "first_impression": str_of(r, "first_impression"),
            "friction": r.get("friction").cloned().unwrap_or(json!([])),
            "trust": r.get("trust").cloned().unwrap_or(json!([])),
            "marketing": r.get("marketing").cloned().unwrap_or(json!([])),
            "fixes": r.get("fixes").cloned().unwrap_or(json!([])),
            "notes": out.notes,
            "url": out.final_url,
            "image": out.image,
        }));
    }

    let done_ui = format!(
        "\n<persona_review id=\"{}\" url=\"{}\" status=\"done\">{}</persona_review>\n",
        escape_xml_attr(&review_id),
        escape_xml_attr(&url),
        escape_xml_text(&json!({ "url": url, "personas": cards }).to_string()),
    );

    ToolOutcome {
        tool_result: clip(&summary, 12_000),
        ui_chunk: done_ui,
        side_effect: None,
    }
}

fn bullets(v: Option<&Value>) -> String {
    match v.and_then(|x| x.as_array()) {
        Some(items) if !items.is_empty() => items
            .iter()
            .map(|i| format!("- {}", i.as_str().map(str::to_string).unwrap_or_else(|| i.to_string())))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => "- (none)".to_string(),
    }
}

async fn run_persona(
    ctx: &ToolCtx<'_>,
    review_id: &str,
    persona: &Persona,
    url: &str,
    steps: u64,
) -> PersonaOutcome {
    let mut outcome = PersonaOutcome {
        persona_id: persona.id.clone(),
        name: persona.name.clone(),
        profile: persona.profile.clone(),
        goal: persona.goal.clone(),
        status: "done",
        notes: Vec::new(),
        report: Value::Null,
        image: String::new(),
        final_url: url.to_string(),
    };

    let page = match browser::open_isolated_page("about:blank").await {
        Ok(p) => p,
        Err(e) => {
            outcome.status = "failed";
            outcome.notes.push(format!("Could not open a browser session: {e}"));
            emit_persona(ctx, review_id, persona, json!({ "status": "failed", "note": e }));
            return outcome;
        }
    };

    let mut proxy = ProxyContext::new("design_review")
        .with_turn(ctx.turn_id.clone(), ctx.conversation_id.clone())
        .with_project_path(Some(ctx.project_path.to_string()));

    let nav = cdp::call(&page.ws, "Page.navigate", json!({ "url": url })).await;
    if let Some(err) = nav
        .as_ref()
        .ok()
        .and_then(|v| v.get("errorText").and_then(|e| e.as_str()))
        .filter(|s| !s.is_empty())
    {
        outcome.status = "failed";
        outcome.notes.push(format!("The site did not load ({err})."));
        emit_persona(ctx, review_id, persona, json!({ "status": "failed", "note": "The site did not load." }));
        browser::close_isolated_page(&page).await;
        return outcome;
    }
    cdp::wait_ready(&page.ws, Duration::from_secs(6)).await;

    let mut transcript: Vec<String> = Vec::new();
    for step in 1..=steps {
        if ctx.cancel.is_cancelled() {
            outcome.status = "stopped";
            break;
        }
        let snap_raw = cdp::eval(&page.ws, SNAPSHOT_JS).await.unwrap_or_else(|_| "{}".into());
        let snap: Value = serde_json::from_str(&snap_raw).unwrap_or(json!({}));
        let title = str_of(&snap, "title");
        let href = str_of(&snap, "href");
        if !href.is_empty() {
            outcome.final_url = href.clone();
        }
        let failed = snap.get("failed").and_then(|f| f.as_bool()).unwrap_or(false);
        let elements = snap
            .get("elements")
            .and_then(|e| e.as_array())
            .map(|list| {
                list.iter()
                    .map(|e| {
                        let href = str_of(e, "href");
                        format!(
                            "[{}] {} {}{}",
                            e.get("id").and_then(|i| i.as_u64()).unwrap_or(0),
                            str_of(e, "tag"),
                            str_of(e, "name"),
                            if href.is_empty() { String::new() } else { format!(" → {href}") }
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default();

        if let Ok(jpeg) = cdp::screenshot_jpeg(&page.ws, 50, 0.5).await {
            outcome.image = format!("data:image/jpeg;base64,{jpeg}");
        }
        emit_persona(
            ctx,
            review_id,
            persona,
            json!({
                "status": "running",
                "step": step,
                "steps": steps,
                "url": href,
                "title": title,
                "image": outcome.image,
                "note": transcript.last().cloned().unwrap_or_else(|| "Looking around…".into())
            }),
        );

        if failed {
            transcript.push("The page failed to load.".into());
            outcome.notes.push("The page failed to load.".into());
            break;
        }

        let prompt = format!(
            "You are {name}: {profile}\nYour reason for being on this website: {goal}\n\
             Behave exactly as this person would — skim, get impatient, use their vocabulary and expectations. Never break character and never mention being an AI.\n\n\
             Page: {title}\nURL: {href}\n\nVisible elements you can use (id · tag · text · link):\n{elements}\n\n\
             What you have done so far:\n{transcript}\n\n\
             Decide your next single move. Reply with JSON only:\n\
             {{\"thought\":\"what you notice, first person, one or two sentences\",\"action\":\"act|type|scroll|open|done\",\"target\":<element id for act or type>,\"text\":\"<text to type>\",\"submit\":true|false,\"direction\":\"down|up\",\"url\":\"<url for open>\"}}\n\
             Use done when your goal is met or you would give up. This is move {step} of {steps}.",
            name = persona.name,
            profile = persona.profile,
            goal = persona.goal,
            transcript = if transcript.is_empty() { "- nothing yet".to_string() } else { transcript.iter().map(|t| format!("- {t}")).collect::<Vec<_>>().join("\n") },
        );

        proxy.refresh_request_id();
        let decision = match streaming::complete_chat_with_max_tokens(
            ctx.client,
            ctx.api_key,
            &prompt,
            ctx.model,
            320,
            &proxy,
        )
        .await
        {
            Ok((content, _, _)) => lenient_json(&content),
            Err(e) => {
                outcome.notes.push(format!("Model error: {e}"));
                break;
            }
        };
        let thought = str_of(&decision, "thought");
        let action = str_of(&decision, "action").to_ascii_lowercase();
        if !thought.is_empty() {
            outcome.notes.push(thought.clone());
        }

        let did = match action.as_str() {
            "done" | "" => {
                transcript.push(format!("{thought} (done)"));
                break;
            }
            "scroll" => {
                let up = str_of(&decision, "direction") == "up";
                let _ = cdp::call(
                    &page.ws,
                    "Input.dispatchMouseEvent",
                    json!({ "type": "mouseWheel", "x": 640, "y": 400, "deltaX": 0, "deltaY": if up { -600 } else { 600 } }),
                )
                .await;
                format!("Scrolled {}", if up { "up" } else { "down" })
            }
            "open" => {
                let target = str_of(&decision, "url");
                if target.is_empty() {
                    "Tried to open an empty URL".to_string()
                } else {
                    let target = normalize_url(&target);
                    let _ = cdp::call(&page.ws, "Page.navigate", json!({ "url": target })).await;
                    cdp::wait_ready(&page.ws, Duration::from_secs(6)).await;
                    format!("Opened {target}")
                }
            }
            "act" | "type" | "click" => {
                let id = decision.get("target").and_then(|t| t.as_u64()).unwrap_or(0);
                act_on(&page.ws, id, &action, &decision).await
            }
            other => format!("Unknown move '{other}'"),
        };
        transcript.push(if thought.is_empty() { did } else { format!("{thought} → {did}") });
        tokio::time::sleep(Duration::from_millis(80)).await;
    }

    if let Ok(jpeg) = cdp::screenshot_jpeg(&page.ws, 50, 0.5).await {
        outcome.image = format!("data:image/jpeg;base64,{jpeg}");
    }
    browser::close_isolated_page(&page).await;

    if outcome.status == "done" || outcome.status == "stopped" {
        let prompt = format!(
            "You are {name}: {profile}\nYou just tried to: {goal}\nSite: {url}\n\nWhat you did and noticed, in order:\n{transcript}\n\n\
             Write the honest review this person would give the team that made the site. Stay in character. JSON only:\n\
             {{\"verdict\":\"one sentence, first person\",\"score\":1-5,\"first_impression\":\"what the landing view said to me in the first seconds\",\"friction\":[\"each thing that slowed or confused me\"],\"trust\":[\"what made me trust or doubt the site\"],\"marketing\":[\"what the copy and positioning did or failed to do for someone like me\"],\"fixes\":[\"concrete changes, highest impact first\"]}}",
            name = persona.name,
            profile = persona.profile,
            goal = persona.goal,
            transcript = if transcript.is_empty() { "- nothing".to_string() } else { transcript.iter().map(|t| format!("- {t}")).collect::<Vec<_>>().join("\n") },
        );
        proxy.refresh_request_id();
        match streaming::complete_chat_with_max_tokens(ctx.client, ctx.api_key, &prompt, ctx.model, 800, &proxy).await {
            Ok((content, _, _)) => {
                outcome.report = lenient_json(&content);
                if outcome.report.is_null() {
                    outcome.report = json!({ "verdict": content.trim() });
                }
            }
            Err(e) => {
                outcome.report = json!({ "verdict": format!("Review failed: {e}") });
            }
        }
    }

    emit_persona(
        ctx,
        review_id,
        persona,
        json!({
            "status": outcome.status,
            "step": steps,
            "steps": steps,
            "url": outcome.final_url,
            "image": outcome.image,
            "note": str_of(&outcome.report, "verdict"),
            "report": outcome.report
        }),
    );
    outcome
}

async fn act_on(ws: &str, id: u64, action: &str, decision: &Value) -> String {
    if id == 0 {
        return "No element chosen".into();
    }
    let located = cdp::eval(
        ws,
        &format!(
            r#"(function(){{
  var el = window.__shapeTargets && window.__shapeTargets[{id}];
  if (!el) return JSON.stringify({{ok:false}});
  el.scrollIntoView({{block:"center",inline:"center"}});
  var r = el.getBoundingClientRect();
  var name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 80);
  var link = el.closest ? el.closest("a") : null;
  var href = link && link.href ? String(link.href) : "";
  return JSON.stringify({{ok:true,x:r.left+r.width/2,y:r.top+r.height/2,name:name,href:href}});
}})()"#
        ),
    )
    .await
    .unwrap_or_default();
    let v: Value = serde_json::from_str(&located).unwrap_or(json!({ "ok": false }));
    if v.get("ok").and_then(|b| b.as_bool()) != Some(true) {
        return format!("Element {id} was not on the page");
    }
    let x = v.get("x").and_then(|n| n.as_f64()).unwrap_or(0.0);
    let y = v.get("y").and_then(|n| n.as_f64()).unwrap_or(0.0);
    let name = str_of(&v, "name");
    if action == "type" {
        let text = str_of(decision, "text");
        if text.is_empty() {
            return format!("Nothing to type into {name}");
        }
        let _ = cdp::eval(ws, &format!(r#"(function(){{ var el = window.__shapeTargets && window.__shapeTargets[{id}]; if (el) {{ el.focus(); if ("value" in el) el.value = ""; }} return "ok"; }})()"#)).await;
        let _ = cdp::call(ws, "Input.insertText", json!({ "text": text })).await;
        if decision.get("submit").and_then(|s| s.as_bool()).unwrap_or(false) {
            let _ = cdp::call_all(
                ws,
                vec![
                    ("Input.dispatchKeyEvent", json!({ "type": "keyDown", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13, "text": "\r" })),
                    ("Input.dispatchKeyEvent", json!({ "type": "keyUp", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13 })),
                ],
            )
            .await;
            cdp::wait_ready(ws, Duration::from_secs(5)).await;
            return format!("Typed \"{text}\" into {name} and submitted");
        }
        return format!("Typed \"{text}\" into {name}");
    }
    let href = str_of(&v, "href");
    if href.starts_with("http://") || href.starts_with("https://") {
        let _ = cdp::call(ws, "Page.navigate", json!({ "url": href })).await;
        cdp::wait_ready(ws, Duration::from_secs(6)).await;
        return format!("Followed \"{name}\" to {href}");
    }
    let _ = cdp::click_px(ws, x, y).await;
    tokio::time::sleep(Duration::from_millis(80)).await;
    cdp::wait_ready(ws, Duration::from_secs(2)).await;
    format!("Clicked \"{name}\"")
}
