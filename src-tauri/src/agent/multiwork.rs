//! Multiwork session registry: worker pool, model round-robin, nested turns.

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};

use reqwest::Client;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use crate::agent::commands::run_turn::{self, AgentTurnConfig};
use crate::agent::commands::streaming::ProxyContext;
use crate::agent::model_router;
use crate::agent::models::AgentState;
use crate::agent::tools::schema;
use crate::commands::pty::PtyState;

const MAX_WORKERS: usize = 6;

static WORKER_COUNT: AtomicUsize = AtomicUsize::new(0);
static MODEL_POOLS: LazyLock<Mutex<HashMap<String, (Vec<String>, usize)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static WORKER_META: LazyLock<Mutex<HashMap<String, WorkerMeta>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Clone)]
struct WorkerMeta {
    title: String,
    parent_conversation_id: Option<String>,
    model: String,
}

pub fn set_model_pool(conversation_id: &str, models: Vec<String>) {
    let cleaned: Vec<String> = models
        .into_iter()
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .collect();
    if let Ok(mut guard) = MODEL_POOLS.lock() {
        guard.insert(conversation_id.to_string(), (cleaned, 0));
    }
}

pub fn clear_session(conversation_id: &str) {
    if let Ok(mut guard) = MODEL_POOLS.lock() {
        guard.remove(conversation_id);
    }
    if let Ok(mut meta) = WORKER_META.lock() {
        meta.retain(|_, w| w.parent_conversation_id.as_deref() != Some(conversation_id));
    }
    WORKER_COUNT.store(0, Ordering::SeqCst);
}

fn next_model(conversation_id: Option<&str>, fallback: &str) -> String {
    let Some(cid) = conversation_id else {
        return fallback.to_string();
    };
    let Ok(mut guard) = MODEL_POOLS.lock() else {
        return fallback.to_string();
    };
    let Some((pool, idx)) = guard.get_mut(cid) else {
        return fallback.to_string();
    };
    if pool.is_empty() {
        return fallback.to_string();
    }
    let pick = pool[*idx % pool.len()].clone();
    *idx = idx.wrapping_add(1);
    pick
}

pub fn active_worker_count() -> usize {
    WORKER_COUNT.load(Ordering::SeqCst)
}

pub fn emit_worker(app: &AppHandle, payload: Value) {
    let _ = app.emit("multiwork-worker", payload);
}

pub fn emit_bus(app: &AppHandle, payload: Value) {
    let _ = app.emit("multiwork-bus", payload);
}

pub fn register_worker(id: &str, title: &str, parent: Option<String>, model: &str) {
    WORKER_COUNT.fetch_add(1, Ordering::SeqCst);
    if let Ok(mut meta) = WORKER_META.lock() {
        meta.insert(
            id.to_string(),
            WorkerMeta {
                title: title.to_string(),
                parent_conversation_id: parent,
                model: model.to_string(),
            },
        );
    }
}

pub fn unregister_worker(id: &str) {
    WORKER_COUNT.fetch_sub(1, Ordering::SeqCst);
    if let Ok(mut meta) = WORKER_META.lock() {
        meta.remove(id);
    }
}

pub fn worker_title(id: &str) -> Option<String> {
    WORKER_META
        .lock()
        .ok()
        .and_then(|g| g.get(id).map(|w| w.title.clone()))
}

pub fn worker_parent(id: &str) -> Option<String> {
    WORKER_META
        .lock()
        .ok()
        .and_then(|g| g.get(id).and_then(|w| w.parent_conversation_id.clone()))
}

pub fn spawn_worker_turn(
    app: AppHandle,
    project_path: String,
    api_key: String,
    model: String,
    task: String,
    title: String,
    worker_id: String,
    parent_conversation_id: Option<String>,
    cancel: CancellationToken,
    files_hint: Option<String>,
) {
    register_worker(
        &worker_id,
        &title,
        parent_conversation_id.clone(),
        &model,
    );
    emit_worker(
        &app,
        json!({
            "id": worker_id,
            "title": title,
            "task": task,
            "model": model,
            "activity": "Starting…",
            "column": "running",
            "status": "running",
            "conversationId": parent_conversation_id,
        }),
    );

    tauri::async_runtime::spawn(async move {
        let outcome = run_worker_inner(
            app.clone(),
            project_path,
            api_key,
            model.clone(),
            task.clone(),
            title.clone(),
            worker_id.clone(),
            parent_conversation_id.clone(),
            cancel,
            files_hint,
        )
        .await;

        let (status, activity, transcript) = match outcome {
            Ok(text) => {
                let line = text
                    .lines()
                    .find(|l| !l.trim().is_empty())
                    .unwrap_or("Done")
                    .chars()
                    .take(96)
                    .collect::<String>();
                ("done", line, text)
            }
            Err(err) => ("error", err.clone(), err),
        };

        emit_worker(
            &app,
            json!({
                "id": worker_id,
                "title": title,
                "task": task,
                "model": model,
                "activity": activity,
                "column": if status == "done" { "review" } else { "running" },
                "status": status,
                "transcript": transcript,
                "conversationId": parent_conversation_id,
            }),
        );
        unregister_worker(&worker_id);
    });
}

async fn run_worker_inner(
    app: AppHandle,
    project_path: String,
    api_key: String,
    model: String,
    task: String,
    title: String,
    worker_id: String,
    parent_conversation_id: Option<String>,
    cancel: CancellationToken,
    files_hint: Option<String>,
) -> Result<String, String> {
    let agent_state = app.state::<AgentState>();
    let index_state = app.state::<crate::agent::index::IndexState>();
    let mcp_state = app.state::<crate::mcp::McpState>();
    let pty_state = app.state::<PtyState>();
    let client = Client::new();

    let model_norm = model_router::normalize_model(&model);
    let proxy_model = model_router::proxy_model_id(&model);
    let family = model_router::model_family(&model_norm);
    let tools = schema::multiwork_worker_tools(family);

    let files_block = files_hint
        .map(|f| format!("\n\nPrefer these paths (do not edit unrelated files):\n{f}"))
        .unwrap_or_default();

    let system = format!(
        "You are a Multiwork worker in Shape IDE named \"{title}\" (id {worker_id}).\n\
         Complete your assigned task with code tools. Prefer non-overlapping edits.\n\
         Use `report_orchestrator` for status updates and `message_peer` to talk to siblings.\n\
         Keep progress concise; the board shows your card."
    );
    let user = format!("{task}{files_block}");

    let mut api_messages = vec![
        json!({"role": "system", "content": system}),
        json!({"role": "user", "content": user}),
    ];

    let turn_id = format!("mw-{worker_id}");
    let worker_conv = format!("mw-worker-{worker_id}");
    let proxy_ctx = ProxyContext::new("multiwork-worker")
        .with_turn(Some(turn_id), Some(worker_conv))
        .with_project_path(Some(project_path.clone()));

    emit_worker(
        &app,
        json!({
            "id": worker_id,
            "activity": "Working…",
            "status": "running",
            "column": "running",
            "conversationId": parent_conversation_id,
        }),
    );

    let outcome = run_turn::run_agent_turn(AgentTurnConfig {
        client: &client,
        api_key: &api_key,
        api_messages: &mut api_messages,
        tools: &tools,
        model: &model_norm,
        proxy_model: &proxy_model,
        mode: "Code",
        project_path: &project_path,
        app_handle: &app,
        agent_state: &*agent_state,
        index_state: Some(&*index_state),
        mcp_state: Some(&*mcp_state),
        pty_state: Some(&*pty_state),
        cancel,
        proxy_ctx,
        max_loops: run_turn::max_loops_for_mode("code"),
        emit_complete: false,
    })
    .await
    .map_err(|e| e.to_string())?;

    if let Some(err) = outcome.interrupt_error {
        return Err(err);
    }
    Ok(outcome.response_text)
}

pub fn pick_worker_model(parent_conversation_id: Option<&str>, override_model: Option<&str>, fallback: &str) -> String {
    if let Some(m) = override_model.map(str::trim).filter(|s| !s.is_empty()) {
        return m.to_string();
    }
    next_model(parent_conversation_id, fallback)
}

pub fn can_spawn_worker() -> Result<(), String> {
    if active_worker_count() >= MAX_WORKERS {
        Err(format!("At most {MAX_WORKERS} workers can run at once. Wait for one to finish."))
    } else {
        Ok(())
    }
}
