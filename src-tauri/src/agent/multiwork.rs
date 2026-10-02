//! Multiwork session registry: worker pool, model round-robin, nested turns.

use std::collections::{HashMap, HashSet};
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
static RUNNING: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));
static INBOX: LazyLock<Mutex<HashMap<String, Vec<(String, String)>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Clone)]
struct WorkerMeta {
    title: String,
    parent_conversation_id: Option<String>,
    model: String,
    project_path: String,
    api_key: String,
    files_hint: Option<String>,
    cancel: CancellationToken,
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
    let ids: Vec<String> = WORKER_META
        .lock()
        .ok()
        .map(|g| {
            g.iter()
                .filter(|(_, w)| w.parent_conversation_id.as_deref() == Some(conversation_id))
                .map(|(id, _)| id.clone())
                .collect()
        })
        .unwrap_or_default();
    if let Ok(mut meta) = WORKER_META.lock() {
        for id in &ids {
            meta.remove(id);
        }
    }
    if let Ok(mut run) = RUNNING.lock() {
        for id in &ids {
            run.remove(id);
        }
        WORKER_COUNT.store(run.len(), Ordering::SeqCst);
    }
    if let Ok(mut inbox) = INBOX.lock() {
        for id in &ids {
            inbox.remove(id);
        }
    }
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

pub fn register_worker(
    id: &str,
    title: &str,
    parent: Option<String>,
    model: &str,
    project_path: &str,
    api_key: &str,
    files_hint: Option<String>,
    cancel: CancellationToken,
) {
    if let Ok(mut meta) = WORKER_META.lock() {
        meta.insert(
            id.to_string(),
            WorkerMeta {
                title: title.to_string(),
                parent_conversation_id: parent,
                model: model.to_string(),
                project_path: project_path.to_string(),
                api_key: api_key.to_string(),
                files_hint,
                cancel,
            },
        );
    }
    if let Ok(mut run) = RUNNING.lock() {
        run.insert(id.to_string());
        WORKER_COUNT.store(run.len(), Ordering::SeqCst);
    }
}

pub fn unregister_worker(id: &str) {
    if let Ok(mut run) = RUNNING.lock() {
        run.remove(id);
        WORKER_COUNT.store(run.len(), Ordering::SeqCst);
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

fn clone_meta(id: &str) -> Option<WorkerMeta> {
    WORKER_META.lock().ok().and_then(|g| g.get(id).cloned())
}

fn take_inbox(id: &str) -> Vec<(String, String)> {
    INBOX
        .lock()
        .ok()
        .and_then(|mut g| g.remove(id))
        .unwrap_or_default()
}

fn enqueue_inbox(to_id: &str, from: &str, content: &str) {
    if let Ok(mut g) = INBOX.lock() {
        g.entry(to_id.to_string())
            .or_default()
            .push((from.to_string(), content.to_string()));
    }
}

pub fn resolve_worker_id(query: &str) -> Option<String> {
    let q = query.trim();
    if q.is_empty() || q.eq_ignore_ascii_case("orchestrator") {
        return None;
    }
    let Ok(meta) = WORKER_META.lock() else {
        return None;
    };
    if meta.contains_key(q) {
        return Some(q.to_string());
    }
    meta.iter()
        .find(|(_, w)| w.title.eq_ignore_ascii_case(q))
        .map(|(id, _)| id.clone())
}

pub fn worker_is_running(id: &str) -> bool {
    RUNNING
        .lock()
        .ok()
        .map(|g| g.contains(id))
        .unwrap_or(false)
}

fn format_peer_followup(msgs: &[(String, String)]) -> String {
    msgs.iter()
        .map(|(from, content)| {
            let title = if from == "orchestrator" {
                "orchestrator".to_string()
            } else {
                worker_title(from).unwrap_or_else(|| from.clone())
            };
            format!("Message from {title}:\n{content}")
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn wake_idle_worker(app: AppHandle, id: &str, task: String) {
    let Some(meta) = clone_meta(id) else {
        return;
    };
    spawn_worker_turn(
        app,
        meta.project_path,
        meta.api_key,
        meta.model,
        task,
        meta.title,
        id.to_string(),
        meta.parent_conversation_id,
        meta.cancel,
        meta.files_hint,
    );
}

pub fn deliver_peer_message(
    app: &AppHandle,
    from_id: &str,
    to: &str,
    content: &str,
) -> Result<String, String> {
    let from_title = if from_id == "orchestrator" {
        "orchestrator".to_string()
    } else {
        worker_title(from_id).unwrap_or_else(|| from_id.to_string())
    };
    let to_trim = to.trim();
    emit_bus(
        app,
        json!({
            "from": from_title,
            "to": to_trim,
            "content": content,
            "workerId": from_id,
        }),
    );
    if to_trim.eq_ignore_ascii_case("orchestrator") {
        return Ok("Message sent to the orchestrator.".to_string());
    }
    let to_id =
        resolve_worker_id(to_trim).ok_or_else(|| format!("No worker matching \"{to_trim}\"."))?;
    if to_id == from_id {
        return Err("Cannot message yourself.".to_string());
    }
    enqueue_inbox(&to_id, from_id, content);
    let to_title = worker_title(&to_id).unwrap_or_else(|| to_id.clone());
    emit_worker(
        app,
        json!({
            "id": to_id,
            "activity": content.chars().take(96).collect::<String>(),
        }),
    );
    if !worker_is_running(&to_id) {
        let pending = take_inbox(&to_id);
        if !pending.is_empty() {
            wake_idle_worker(app.clone(), &to_id, format_peer_followup(&pending));
        }
    }
    Ok(format!("Message delivered to {to_title}."))
}

pub fn deliver_broadcast(app: &AppHandle, from_id: &str, content: &str) -> Result<String, String> {
    let ids: Vec<String> = WORKER_META
        .lock()
        .ok()
        .map(|g| {
            g.keys()
                .filter(|id| id.as_str() != from_id)
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    if ids.is_empty() {
        return Ok("No workers to broadcast to.".to_string());
    }
    let from_title = if from_id == "orchestrator" {
        "orchestrator".to_string()
    } else {
        worker_title(from_id).unwrap_or_else(|| from_id.to_string())
    };
    emit_bus(
        app,
        json!({
            "from": from_title,
            "content": content,
        }),
    );
    let n = ids.len();
    for id in ids {
        enqueue_inbox(&id, from_id, content);
        if !worker_is_running(&id) {
            let pending = take_inbox(&id);
            if !pending.is_empty() {
                wake_idle_worker(app.clone(), &id, format_peer_followup(&pending));
            }
        }
    }
    Ok(format!("Broadcast queued for {n} workers."))
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
        &project_path,
        &api_key,
        files_hint.clone(),
        cancel.clone(),
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
        let mut current_task = task.clone();
        loop {
            let outcome = run_worker_inner(
                app.clone(),
                project_path.clone(),
                api_key.clone(),
                model.clone(),
                current_task.clone(),
                title.clone(),
                worker_id.clone(),
                parent_conversation_id.clone(),
                cancel.clone(),
                files_hint.clone(),
            )
            .await;

            let pending = take_inbox(&worker_id);
            if !pending.is_empty() {
                emit_worker(
                    &app,
                    json!({
                        "id": worker_id,
                        "activity": "Peer message…",
                        "status": "running",
                        "column": "running",
                        "conversationId": parent_conversation_id,
                    }),
                );
                current_task = format_peer_followup(&pending);
                continue;
            }

            unregister_worker(&worker_id);
            let late = take_inbox(&worker_id);
            if !late.is_empty() {
                register_worker(
                    &worker_id,
                    &title,
                    parent_conversation_id.clone(),
                    &model,
                    &project_path,
                    &api_key,
                    files_hint.clone(),
                    cancel.clone(),
                );
                current_task = format_peer_followup(&late);
                continue;
            }

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
            break;
        }
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
         You have an isolated checkout. Complete your assigned task with code tools.\n\
         Never merge into the user's original branch. Never git_sync that branch. Never delete your worktree.\n\
         When finished, report the branch name and what changed. The user/orchestrator will review — they merge, not you.\n\
         Use `report_orchestrator` for status and `message_peer` to talk to other workers (id or title).\n\
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
