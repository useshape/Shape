//! Background threads: a child chat tab reports once when it finishes.
//! Default checkout is shared. `isolation=worktree` uses a sibling git worktree.

use std::collections::HashMap;
use std::panic::AssertUnwindSafe;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};

use futures::FutureExt;
use reqwest::Client;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use crate::agent::checkout::{self, Isolation};
use crate::agent::commands::history;
use crate::agent::commands::run_turn::{self, AgentTurnConfig};
use crate::agent::commands::streaming::ProxyContext;
use crate::agent::model_router;
use crate::agent::models::{AgentState, ChatMessage};
use crate::agent::prompts;
use crate::agent::tools::schema;
use crate::commands::pty::PtyState;
use crate::core::workspace_trust::WorkspaceTrustState;

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
        "Thread models allowed: {}. Default: {}. Do not pass any other model to spawn_subagent — disallowed ids are ignored and never inherit the parent chat model.",
        allowed.join(", "),
        default
    )
}

pub fn is_thread_id(id: &str) -> bool {
    id.starts_with("thread-") || id.starts_with("sub-run-")
}

static RUNNING: AtomicUsize = AtomicUsize::new(0);

struct LiveThread {
    parent: String,
    cancel: CancellationToken,
}

static LIVE: LazyLock<Mutex<HashMap<String, LiveThread>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// 0 = parent chat, 1 = thread, 2 = nested thread (max).
pub fn spawn_depth(conversation_id: Option<&str>) -> u8 {
    let Some(id) = conversation_id.filter(|s| !s.is_empty()) else {
        return 0;
    };
    if !is_thread_id(id) {
        return 0;
    }
    let parent = LIVE
        .lock()
        .ok()
        .and_then(|g| g.get(id).map(|t| t.parent.clone()))
        .unwrap_or_default();
    if is_thread_id(&parent) {
        2
    } else {
        1
    }
}

pub(crate) struct SlotGuard;

impl Drop for SlotGuard {
    fn drop(&mut self) {
        RUNNING.fetch_sub(1, Ordering::SeqCst);
    }
}

pub fn try_reserve_slot() -> Result<SlotGuard, String> {
    let mut current = RUNNING.load(Ordering::SeqCst);
    loop {
        if current >= MAX_SUBAGENTS {
            return Err(format!(
                "At most {MAX_SUBAGENTS} threads can run at once. Wait for one to finish or keep working yourself."
            ));
        }
        match RUNNING.compare_exchange(current, current + 1, Ordering::SeqCst, Ordering::SeqCst) {
            Ok(_) => return Ok(SlotGuard),
            Err(actual) => current = actual,
        }
    }
}

pub fn can_spawn() -> Result<(), String> {
    if RUNNING.load(Ordering::SeqCst) >= MAX_SUBAGENTS {
        Err(format!(
            "At most {MAX_SUBAGENTS} threads can run at once. Wait for one to finish or keep working yourself."
        ))
    } else {
        Ok(())
    }
}

pub fn running_count() -> usize {
    RUNNING.load(Ordering::SeqCst)
}

pub fn is_live(id: &str) -> bool {
    LIVE.lock()
        .ok()
        .map(|g| g.contains_key(id))
        .unwrap_or(false)
}

pub fn has_children(parent_id: &str) -> bool {
    LIVE.lock()
        .ok()
        .map(|g| g.values().any(|t| t.parent == parent_id))
        .unwrap_or(false)
}

pub fn cancel_thread(id: &str) -> bool {
    LIVE.lock()
        .ok()
        .and_then(|g| g.get(id).map(|t| t.cancel.cancel()))
        .is_some()
}

pub fn cancel_children(parent_id: &str) -> Vec<String> {
    let Ok(g) = LIVE.lock() else {
        return Vec::new();
    };
    let mut ids = Vec::new();
    for (id, thread) in g.iter() {
        if thread.parent == parent_id {
            thread.cancel.cancel();
            ids.push(id.clone());
        }
    }
    ids
}

fn register_live(id: &str, parent: &str, cancel: CancellationToken) {
    if let Ok(mut g) = LIVE.lock() {
        g.insert(
            id.to_string(),
            LiveThread {
                parent: parent.to_string(),
                cancel,
            },
        );
    }
}

fn unregister_live(id: &str) {
    if let Ok(mut g) = LIVE.lock() {
        g.remove(id);
    }
}

fn emit_card(app: &AppHandle, payload: Value) {
    let _ = app.emit("agent-subagent", payload);
}

fn xml_attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
}

fn user_message(content: &str) -> ChatMessage {
    ChatMessage {
        role: "user".to_string(),
        content: content.to_string(),
        timestamp: history::now_f64(),
        stats: None,
        model: None,
        feedback: None,
        hidden: false,
    }
}

fn assistant_message(content: &str, model: &str) -> ChatMessage {
    ChatMessage {
        role: "assistant".to_string(),
        content: content.to_string(),
        timestamp: history::now_f64(),
        stats: None,
        model: Some(model.to_string()),
        feedback: None,
        hidden: false,
    }
}

pub struct SpawnedThread {
    pub id: String,
    pub isolation: Isolation,
    pub note: String,
}

pub fn resolve_isolation(mode: &str, requested: Isolation, parent_trusted: bool) -> Result<Isolation, String> {
    let ask_like = mode.eq_ignore_ascii_case("ask") || mode.eq_ignore_ascii_case("plan");
    if ask_like {
        return Ok(Isolation::Shared);
    }
    if requested == Isolation::Worktree && !parent_trusted {
        return Err(
            "Workspace is not trusted. Trust this folder before using worktree isolation."
                .to_string(),
        );
    }
    Ok(requested)
}

pub fn spawn(
    app: AppHandle,
    project_path: String,
    sealed_project: Option<String>,
    api_key: String,
    model: String,
    parent_mode: String,
    task: String,
    title: String,
    isolation: Isolation,
    parent_conversation_id: Option<String>,
    parent_turn_id: Option<String>,
    history_store: String,
) -> Result<SpawnedThread, String> {
    let isolation = resolve_isolation(&parent_mode, isolation, {
        let trust = app.state::<WorkspaceTrustState>();
        trust.is_trusted(&project_path)
    })?;
    let checkout = checkout::prepare(&project_path, &title, isolation);
    let actual_isolation = if checkout.isolated {
        Isolation::Worktree
    } else {
        Isolation::Shared
    };
    if checkout.isolated {
        app.state::<WorkspaceTrustState>()
            .set_trusted(&checkout.project_path, true);
    }
    let _slot = try_reserve_slot()?;
    let id = format!("thread-{}", uuid::Uuid::new_v4());
    let cancel = CancellationToken::new();
    let parent = parent_conversation_id.clone().unwrap_or_default();
    {
        let agent_state = app.state::<AgentState>();
        agent_state.register_cancel_token(&id, cancel.clone());
        if !parent.is_empty() {
            let parent_policy = agent_state.turn_policy_for(Some(&parent));
            agent_state.set_turn_policy_for(&id, parent_policy);
            agent_state.set_session_packs(&id, agent_state.session_packs(&parent));
        }
    }
    register_live(&id, &parent, cancel.clone());

    emit_card(
        &app,
        json!({
            "id": id,
            "title": title,
            "task": task,
            "model": model,
            "activity": "Starting…",
            "status": "running",
            "isolation": actual_isolation.as_str(),
            "turnId": parent_turn_id,
            "conversationId": parent_conversation_id,
            "threadId": id,
        }),
    );

    let spawn_id = id.clone();
    let title_for_task = title.clone();
    let task_for_task = task.clone();
    let model_for_task = model.clone();
    let isolation_for_task = actual_isolation;
    let parent_for_task = parent_conversation_id.clone();
    let parent_turn_for_task = parent_turn_id.clone();
    let cancel_for_task = cancel.clone();
    let store_for_task = history_store.clone();
    let checkout_note = checkout.note.clone();
    let checkout_for_task = checkout;
    tauri::async_runtime::spawn(async move {
        let _slot = _slot;
        let outcome = AssertUnwindSafe(run_thread_inner(
            app.clone(),
            project_path,
            sealed_project,
            api_key,
            model_for_task.clone(),
            parent_mode,
            task_for_task.clone(),
            title_for_task.clone(),
            spawn_id.clone(),
            checkout_for_task,
            parent_for_task.clone(),
            parent_turn_for_task.clone(),
            store_for_task.clone(),
            cancel_for_task.clone(),
        ))
        .catch_unwind()
        .await;

        unregister_live(&spawn_id);
        let agent_state = app.state::<AgentState>();
        agent_state.clear_in_flight_conversation(&spawn_id);

        let (status, activity, transcript, branch) = match outcome {
            Ok(Ok(done)) => {
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
            Ok(Err(err)) => {
                let status = if cancel_for_task.is_cancelled() {
                    "error"
                } else {
                    "error"
                };
                (status, err.clone(), err, None::<String>)
            }
            Err(_) => (
                "error",
                "Thread panicked".to_string(),
                "Thread panicked".to_string(),
                None,
            ),
        };

        emit_card(
            &app,
            json!({
                "id": spawn_id,
                "title": title_for_task,
                "task": task_for_task,
                "model": model_for_task,
                "activity": activity,
                "status": status,
                "transcript": transcript,
                "isolation": isolation_for_task.as_str(),
                "branch": branch,
                "turnId": parent_turn_for_task,
                "conversationId": parent_for_task,
                "threadId": spawn_id,
            }),
        );

        let _ = app.emit(
            "chat_complete",
            json!({
                "conversationId": spawn_id,
                "error": if status == "error" { Some(activity.clone()) } else { None },
                "content": transcript,
            }),
        );

        let branch_line = branch
            .as_deref()
            .map(|b| format!("\nBranch: `{b}` (not merged)."))
            .unwrap_or_default();
        let update = format!(
            "Thread \"{title_for_task}\" ({spawn_id}) {status}.{branch_line}\n\n{transcript}"
        );
        let clipped: String = update.chars().take(6000).collect();
        if let Some(parent) = parent_for_task.as_deref() {
            history::patch_subagent_ref_status(
                &agent_state,
                &store_for_task,
                parent,
                &spawn_id,
                status,
            );
        }
        crate::agent::parent_resume::notify_parent_finished(
            &app,
            parent_for_task.as_deref(),
            clipped,
        );
    });

    Ok(SpawnedThread {
        id,
        isolation: actual_isolation,
        note: checkout_note,
    })
}

struct ThreadDone {
    report: String,
    branch: Option<String>,
}

async fn run_thread_inner(
    app: AppHandle,
    project_path: String,
    sealed_project: Option<String>,
    api_key: String,
    model: String,
    parent_mode: String,
    task: String,
    title: String,
    id: String,
    checkout: checkout::Checkout,
    parent_conversation_id: Option<String>,
    parent_turn_id: Option<String>,
    history_store: String,
    cancel: CancellationToken,
) -> Result<ThreadDone, String> {
    let ask_like = parent_mode.eq_ignore_ascii_case("ask")
        || parent_mode.eq_ignore_ascii_case("plan");
    let talk = parent_mode.eq_ignore_ascii_case("agent");
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
            "threadId": id,
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

    let parent_id = parent_conversation_id.clone().unwrap_or_default();
    let parent_packs = agent_state.session_packs(&parent_id);
    let steer = if talk {
        schema::SteerPacks::talk()
    } else {
        schema::SteerPacks {
            workspace: parent_packs.workspace,
            plugins: parent_packs.plugins,
            browse: parent_packs.browse,
            web: parent_packs.web,
            git: parent_packs.git,
            terminal: parent_packs.terminal,
            media: parent_packs.media,
            reverse: parent_packs.reverse,
            hint: String::new(),
        }
    };
    let mode = if ask_like {
        "Ask"
    } else if talk {
        "Agent"
    } else {
        "Code"
    };
    let mut tools = schema::assemble_tools(
        family,
        &steer,
        mode,
        agent_state.chat_memory_enabled(),
    );
    if talk {
        tools = schema::apply_talk_tools(tools);
    }
    if spawn_depth(Some(&id)) >= 2 || is_thread_id(&parent_id) {
        schema::strip_spawn_subagent(&mut tools);
    }

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

    let turn_id = uuid::Uuid::new_v4().to_string();
    let worker_conv = id.clone();
    let proxy_ctx = ProxyContext::new("subagent")
        .with_turn(Some(turn_id.clone()), Some(worker_conv.clone()))
        .with_project_path(Some(checkout.project_path.clone()));

    let _ = agent_state.try_begin_in_flight(turn_id.clone(), Some(worker_conv.clone()));
    let seed_history = vec![user_message(&task)];
    if !parent_id.is_empty() {
        let _ = history::upsert_thread_conversation(
            &agent_state,
            &history_store,
            &id,
            &title,
            &parent_id,
            seed_history,
        );
    }
    let _ = app.emit(
        "chat_started",
        json!({
            "turnId": turn_id,
            "conversationId": worker_conv,
            "title": title,
            "model": model_norm,
        }),
    );
    let _ = app.emit(
        "chat_token",
        json!({
            "chunk": format!("\n"),
            "turnId": turn_id,
            "conversationId": worker_conv,
        }),
    );

    let sealed = if talk {
        sealed_project.as_deref().or(Some(project_path.as_str()))
    } else {
        sealed_project.as_deref()
    };

    let outcome = run_turn::run_agent_turn(AgentTurnConfig {
        client: &client,
        api_key: &api_key,
        api_messages: &mut api_messages,
        tools: &tools,
        model: &model_norm,
        proxy_model: &proxy_model,
        mode,
        project_path: &checkout.project_path,
        history_store: &history_store,
        sealed_project: sealed,
        app_handle: &app,
        agent_state: &*agent_state,
        index_state: Some(&*index_state),
        mcp_state: Some(&*mcp_state),
        pty_state: Some(&*pty_state),
        cancel,
        proxy_ctx,
        max_loops: run_turn::max_loops_for_mode(mode),
        emit_complete: true,
    })
    .await
    .map_err(|e| e.to_string())?;

    let report = if let Some(err) = outcome.interrupt_error {
        return Err(err);
    } else {
        outcome.response_text
    };

    if !parent_id.is_empty() {
        let hist = vec![
            user_message(&task),
            assistant_message(&report, &model_norm),
        ];
        let _ = history::upsert_thread_conversation(
            &agent_state,
            &history_store,
            &id,
            &title,
            &parent_id,
            hist,
        );
        history::patch_subagent_ref_status(
            &agent_state,
            &history_store,
            &parent_id,
            &id,
            "done",
        );
    }

    Ok(ThreadDone {
        report,
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

    #[test]
    fn thread_ids_are_not_parent_chats() {
        assert!(is_thread_id("thread-abc"));
        assert!(is_thread_id("sub-run-old"));
        assert!(!is_thread_id("12345"));
    }

    #[test]
    fn slot_is_released_after_guard_drops() {
        let before = running_count();
        {
            let _g = try_reserve_slot().expect("reserve");
            assert_eq!(running_count(), before + 1);
        }
        assert_eq!(running_count(), before);
    }

    #[test]
    fn worktree_refused_when_untrusted() {
        let err = resolve_isolation("Code", Isolation::Worktree, false).unwrap_err();
        assert!(err.to_ascii_lowercase().contains("not trusted"));
    }

    #[test]
    fn ask_and_plan_stay_shared() {
        assert_eq!(
            resolve_isolation("Ask", Isolation::Worktree, true).unwrap(),
            Isolation::Shared
        );
        assert_eq!(
            resolve_isolation("Plan", Isolation::Worktree, true).unwrap(),
            Isolation::Shared
        );
    }
}
