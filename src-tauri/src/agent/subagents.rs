//! Ordinary subagents: parent keeps working; they report when done.
//! Default checkout is shared. `isolation=worktree` uses a sibling git worktree.

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};

use reqwest::Client;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use crate::agent::checkout::{self, Isolation};
use crate::agent::commands::run_turn::{self, AgentTurnConfig};
use crate::agent::commands::streaming::ProxyContext;
use crate::agent::model_router;
use crate::agent::models::AgentState;
use crate::agent::prompts;
use crate::agent::tools::schema;
use crate::commands::pty::PtyState;

const MAX_SUBAGENTS: usize = 4;
const DEFAULT_SUBAGENT_MODEL: &str = "auto";

fn is_auto_model(id: &str) -> bool {
    let t = id.trim();
    t.is_empty()
        || t.eq_ignore_ascii_case("auto")
        || t.eq_ignore_ascii_case("openrouter/auto")
        || t == crate::agent::model_router::MODEL_FAST
}

fn normalize_model_id(id: &str) -> String {
    if is_auto_model(id) {
        DEFAULT_SUBAGENT_MODEL.to_string()
    } else {
        id.trim().to_string()
    }
}

fn allowed_subagent_models(models: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for raw in models {
        let id = normalize_model_id(raw);
        if id.is_empty() || out.iter().any(|x| x == &id) {
            continue;
        }
        out.push(id);
    }
    if out.is_empty() {
        out.push(DEFAULT_SUBAGENT_MODEL.to_string());
    }
    out
}

fn model_allowed(id: &str, allowed: &[String]) -> bool {
    if is_auto_model(id) {
        return allowed.iter().any(|m| is_auto_model(m));
    }
    allowed.iter().any(|m| m == id)
}

/// Clamp a spawn request to the user's subagent allowlist. Never falls back to the parent chat model.
pub fn pick_subagent_model(requested: Option<&str>, allowed: &[String], default: &str) -> String {
    let allowed = allowed_subagent_models(allowed);
    let fallback = if model_allowed(default, &allowed) {
        normalize_model_id(default)
    } else {
        allowed[0].clone()
    };
    if let Some(req) = requested.map(str::trim).filter(|s| !s.is_empty()) {
        let id = normalize_model_id(req);
        if model_allowed(&id, &allowed) {
            return id;
        }
    }
    fallback
}

pub fn set_policy(state: &AgentState, models: Option<Vec<String>>, default: Option<String>) {
    let allowed = allowed_subagent_models(&models.unwrap_or_default());
    let chosen = pick_subagent_model(None, &allowed, default.as_deref().unwrap_or(DEFAULT_SUBAGENT_MODEL));
    if let Ok(mut g) = state.subagent_models.lock() {
        *g = allowed;
    }
    if let Ok(mut g) = state.subagent_default_model.lock() {
        *g = chosen;
    }
}

pub fn resolve_model(state: &AgentState, requested: Option<&str>) -> String {
    let allowed = state
        .subagent_models
        .lock()
        .ok()
        .map(|g| g.clone())
        .unwrap_or_else(|| vec![DEFAULT_SUBAGENT_MODEL.to_string()]);
    let default = state
        .subagent_default_model
        .lock()
        .ok()
        .map(|g| g.clone())
        .unwrap_or_else(|| DEFAULT_SUBAGENT_MODEL.to_string());
    pick_subagent_model(requested, &allowed, &default)
}

pub fn policy_line(state: &AgentState) -> String {
    let allowed = state
        .subagent_models
        .lock()
        .ok()
        .map(|g| g.clone())
        .unwrap_or_else(|| vec![DEFAULT_SUBAGENT_MODEL.to_string()]);
    let default = state
        .subagent_default_model
        .lock()
        .ok()
        .map(|g| g.clone())
        .unwrap_or_else(|| DEFAULT_SUBAGENT_MODEL.to_string());
    format!(
        "Subagent models allowed: {}. Default: {}. Do not pass any other model to spawn_subagent — disallowed ids are ignored and never inherit the parent chat model.",
        allowed.join(", "),
        default
    )
}

static RUNNING: AtomicUsize = AtomicUsize::new(0);
static PARENT_UPDATES: LazyLock<Mutex<HashMap<String, Vec<String>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn can_spawn() -> Result<(), String> {
    if RUNNING.load(Ordering::SeqCst) >= MAX_SUBAGENTS {
        Err(format!(
            "At most {MAX_SUBAGENTS} subagents can run at once. Wait for one to finish or keep working yourself."
        ))
    } else {
        Ok(())
    }
}

pub fn take_parent_updates(conversation_id: &str) -> Vec<String> {
    PARENT_UPDATES
        .lock()
        .ok()
        .and_then(|mut g| g.remove(conversation_id))
        .unwrap_or_default()
}

fn push_parent_update(conversation_id: Option<&str>, text: String) {
    let Some(id) = conversation_id.filter(|s| !s.is_empty()) else {
        return;
    };
    if id.starts_with("mw-worker-") || id.starts_with("sub-run-") {
        return;
    }
    if let Ok(mut g) = PARENT_UPDATES.lock() {
        g.entry(id.to_string()).or_default().push(text);
    }
}

fn emit_card(app: &AppHandle, payload: Value) {
    let _ = app.emit("agent-subagent", payload);
}

pub fn spawn(
    app: AppHandle,
    project_path: String,
    api_key: String,
    model: String,
    parent_mode: String,
    task: String,
    title: String,
    isolation: Isolation,
    parent_conversation_id: Option<String>,
    parent_turn_id: Option<String>,
    cancel: CancellationToken,
) -> String {
    RUNNING.fetch_add(1, Ordering::SeqCst);
    let id = format!(
        "sub-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    emit_card(
        &app,
        json!({
            "id": id,
            "title": title,
            "task": task,
            "model": model,
            "activity": "Starting…",
            "status": "running",
            "isolation": isolation.as_str(),
            "turnId": parent_turn_id,
            "conversationId": parent_conversation_id,
        }),
    );

    let spawn_id = id.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = run_subagent_inner(
            app.clone(),
            project_path,
            api_key,
            model.clone(),
            parent_mode,
            task.clone(),
            title.clone(),
            spawn_id.clone(),
            isolation,
            parent_conversation_id.clone(),
            parent_turn_id.clone(),
            cancel,
        )
        .await;
        RUNNING.fetch_sub(1, Ordering::SeqCst);

        let (status, activity, transcript, branch) = match outcome {
            Ok(done) => {
                let line = done
                    .report
                    .lines()
                    .find(|l| !l.trim().is_empty())
                    .unwrap_or("Done")
                    .chars()
                    .take(96)
                    .collect::<String>();
                ("done", line, done.report, done.branch)
            }
            Err(err) => ("error", err.clone(), err, None::<String>),
        };

        emit_card(
            &app,
            json!({
                "id": spawn_id,
                "title": title,
                "task": task,
                "model": model,
                "activity": activity,
                "status": status,
                "transcript": transcript,
                "isolation": isolation.as_str(),
                "branch": branch,
                "turnId": parent_turn_id,
                "conversationId": parent_conversation_id,
            }),
        );

        let branch_line = branch
            .as_deref()
            .map(|b| format!("\nBranch: `{b}` (not merged)."))
            .unwrap_or_default();
        let update = format!(
            "Subagent \"{title}\" ({spawn_id}) {status}.{branch_line}\n\n{transcript}"
        );
        let clipped: String = update.chars().take(6000).collect();
        if let Some(parent) = parent_conversation_id.as_deref() {
            let _ = app.emit(
                "chat_token",
                json!({
                    "chunk": format!(
                        "\n<subagent_ref id=\"{}\" agent=\"{}\" task=\"{}\" status=\"{}\" />\n",
                        xml_attr(&spawn_id),
                        xml_attr(&title),
                        xml_attr(&task),
                        xml_attr(status),
                    ),
                    "turnId": parent_turn_id,
                    "conversationId": parent,
                }),
            );
        }
        push_parent_update(parent_conversation_id.as_deref(), clipped);
    });

    id
}

fn xml_attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
}

struct SubagentDone {
    report: String,
    branch: Option<String>,
}

async fn run_subagent_inner(
    app: AppHandle,
    project_path: String,
    api_key: String,
    model: String,
    parent_mode: String,
    task: String,
    title: String,
    id: String,
    isolation: Isolation,
    parent_conversation_id: Option<String>,
    parent_turn_id: Option<String>,
    cancel: CancellationToken,
) -> Result<SubagentDone, String> {
    let isolation = if parent_mode.eq_ignore_ascii_case("ask")
        || parent_mode.eq_ignore_ascii_case("plan")
    {
        Isolation::Shared
    } else {
        isolation
    };
    let checkout = checkout::prepare(&project_path, &title, isolation);
    emit_card(
        &app,
        json!({
            "id": id,
            "activity": if checkout.isolated { "Worktree ready…" } else { "Working…" },
            "status": "running",
            "branch": checkout.branch,
            "isolation": if checkout.isolated { "worktree" } else { "shared" },
            "turnId": parent_turn_id,
            "conversationId": parent_conversation_id,
        }),
    );

    let agent_state = app.state::<AgentState>();
    let index_state = app.state::<crate::agent::index::IndexState>();
    let mcp_state = app.state::<crate::mcp::McpState>();
    let pty_state = app.state::<PtyState>();
    let client = Client::new();

    let model_norm = model_router::normalize_model(&model);
    let proxy_model = model_router::proxy_model_id(&model);
    let family = model_router::model_family(&model_norm);
    let ask_like = parent_mode.eq_ignore_ascii_case("ask")
        || parent_mode.eq_ignore_ascii_case("plan");
    let mut tools = if ask_like {
        schema::tools_for_mode_and_family("ask", family, vec![])
    } else {
        schema::all_tools_for_family(family)
    };
    tools.retain(|t| {
        t.get("function")
            .and_then(|f| f.get("name"))
            .and_then(|n| n.as_str())
            != Some("spawn_subagent")
    });

    let system = format!(
        "{}\n\n{}You are named \"{title}\" (id {id}).",
        prompts::SUBAGENT_MD.trim(),
        prompts::family_prompt(family),
    );
    let user = format!("{task}\n\n<isolation>\n{}\n</isolation>", checkout.note);

    let mut api_messages = vec![
        json!({"role": "system", "content": system}),
        json!({"role": "user", "content": user}),
    ];

    let turn_id = format!("sub-{id}");
    let worker_conv = format!("sub-run-{id}");
    let proxy_ctx = ProxyContext::new("subagent")
        .with_turn(Some(turn_id), Some(worker_conv))
        .with_project_path(Some(checkout.project_path.clone()));

    let mode = if ask_like { "Ask" } else { "Code" };
    let outcome = run_turn::run_agent_turn(AgentTurnConfig {
        client: &client,
        api_key: &api_key,
        api_messages: &mut api_messages,
        tools: &tools,
        model: &model_norm,
        proxy_model: &proxy_model,
        mode,
        project_path: &checkout.project_path,
        app_handle: &app,
        agent_state: &*agent_state,
        index_state: Some(&*index_state),
        mcp_state: Some(&*mcp_state),
        pty_state: Some(&*pty_state),
        cancel,
        proxy_ctx,
        max_loops: run_turn::max_loops_for_mode(mode),
        emit_complete: false,
    })
    .await
    .map_err(|e| e.to_string())?;

    if let Some(err) = outcome.interrupt_error {
        return Err(err);
    }
    Ok(SubagentDone {
        report: outcome.response_text,
        branch: checkout.branch,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_allowlist_is_auto_even_if_opus_requested() {
        assert_eq!(
            pick_subagent_model(Some("anthropic/claude-opus-5.5"), &[], "auto"),
            "auto"
        );
    }

    #[test]
    fn rejects_unlisted_flagship() {
        let allowed = vec!["auto".into(), "google/gemini-3.8-flash".into()];
        assert_eq!(
            pick_subagent_model(Some("anthropic/claude-opus-5.5"), &allowed, "auto"),
            "auto"
        );
    }

    #[test]
    fn accepts_allowed_model() {
        let allowed = vec!["auto".into(), "google/gemini-3.8-flash".into()];
        assert_eq!(
            pick_subagent_model(Some("google/gemini-3.8-flash"), &allowed, "auto"),
            "google/gemini-3.8-flash"
        );
    }

    #[test]
    fn auto_backend_slug_counts_as_auto() {
        assert_eq!(
            pick_subagent_model(Some("deepseek/deepseek-v4-flash"), &["auto".into()], "auto"),
            "auto"
        );
    }

    #[test]
    fn default_clamped_to_allowlist() {
        assert_eq!(
            pick_subagent_model(None, &["z-ai/glm-5.3-flash".into()], "anthropic/claude-opus-5.5"),
            "z-ai/glm-5.3-flash"
        );
    }
}
