//! Sequential prompt runner. Same agent as the app. Logs are for us, not the model.

use std::collections::{BTreeSet, HashMap};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Listener, Manager};

use crate::agent::commands::conversation::apply_new_chat;
use crate::agent::commands::send_chat::send_chat_message;
use crate::agent::models::AgentState;
use crate::app_state::AppState;
use crate::commands::pty::PtyState;
use crate::core::workspace_trust::WorkspaceTrustState;

pub fn requested() -> bool {
    std::env::args().any(|arg| arg == "--prompt")
        || env_nonempty("SHAPE_PROMPT_MANIFEST")
        || env_nonempty("SHAPE_PROMPT_FILE")
        || env_nonempty("SHAPE_PROMPT")
}

fn env_nonempty(key: &str) -> bool {
    std::env::var(key).map(|v| !v.trim().is_empty()).unwrap_or(false)
}

#[derive(Debug, Deserialize)]
struct Manifest {
    jail: String,
    jobs: Vec<ManifestJob>,
}

#[derive(Debug, Deserialize)]
struct ManifestJob {
    id: String,
    prompt_file: String,
    project: String,
    logs: String,
    #[serde(default = "expect_files")]
    expect: String,
}

fn expect_files() -> String {
    "files".to_string()
}

#[derive(Clone)]
struct ToolHit {
    name: String,
    t_ms: u64,
}

struct Capture {
    text: String,
    tools: Vec<ToolHit>,
    files: Vec<String>,
    events: Vec<Value>,
    error: Option<String>,
    complete: Option<Value>,
    first_token_ms: Option<u64>,
}

impl Capture {
    fn new() -> Self {
        Self {
            text: String::new(),
            tools: Vec::new(),
            files: Vec::new(),
            events: Vec::new(),
            error: None,
            complete: None,
            first_token_ms: None,
        }
    }

    fn reset(&mut self) {
        *self = Self::new();
    }
}

fn access_token() -> Result<String, String> {
    std::env::var("SHAPE_ACCESS_TOKEN")
        .map(|s| s.trim().to_string())
        .ok()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "SHAPE_ACCESS_TOKEN is missing.".to_string())
}

fn env_string(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn env_flag(key: &str, default: bool) -> bool {
    match env_string(key).as_deref() {
        Some(v) => matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"),
        None => default,
    }
}

/// Pinned model for a run. Unset keeps the normal validation default, `auto`.
fn validation_model() -> String {
    env_string("SHAPE_VALIDATION_MODEL").unwrap_or_else(|| "auto".to_string())
}

fn validation_timeout() -> Duration {
    let secs = env_string("SHAPE_VALIDATION_TIMEOUT_SEC")
        .and_then(|s| s.parse::<u64>().ok())
        .filter(|n| *n > 0)
        .unwrap_or(12 * 60);
    Duration::from_secs(secs)
}

fn assert_inside_jail(project: &Path, jail: &Path) -> Result<(), String> {
    let jail = jail.canonicalize().unwrap_or_else(|_| jail.to_path_buf());
    let project = project.canonicalize().unwrap_or_else(|_| project.to_path_buf());
    if !project.starts_with(&jail) {
        return Err(format!(
            "Validation jail: {} is outside {}",
            project.display(),
            jail.display()
        ));
    }
    Ok(())
}

fn elapsed_ms(start: Instant) -> u64 {
    start.elapsed().as_millis() as u64
}

fn push_event(capture: &Arc<Mutex<Capture>>, start: Instant, kind: &str, extra: Value) {
    let mut row = extra;
    if let Some(obj) = row.as_object_mut() {
        obj.insert("t_ms".into(), json!(elapsed_ms(start)));
        obj.insert("kind".into(), json!(kind));
    }
    if let Ok(mut g) = capture.lock() {
        g.events.push(row);
    }
}

fn write_logs(logs: &Path, capture: &Capture, history: &Value, summary: &Value, wall_ms: u64) {
    let _ = std::fs::create_dir_all(logs);
    let events = capture
        .events
        .iter()
        .filter_map(|e| serde_json::to_string(e).ok())
        .collect::<Vec<_>>()
        .join("\n");
    let _ = std::fs::write(logs.join("events.jsonl"), events);
    let _ = std::fs::write(logs.join("transcript.txt"), &capture.text);
    let _ = std::fs::write(
        logs.join("history.json"),
        serde_json::to_string_pretty(history).unwrap_or_else(|_| "[]".into()),
    );
    let _ = std::fs::write(
        logs.join("stats.json"),
        serde_json::to_string_pretty(&json!({
            "firstTokenMs": capture.first_token_ms,
            "tools": serialize_tools(&capture.tools, wall_ms),
            "files": capture.files,
            "chatComplete": capture.complete,
        }))
        .unwrap_or_default(),
    );
    let _ = std::fs::write(
        logs.join("summary.json"),
        serde_json::to_string_pretty(summary).unwrap_or_default(),
    );
}

fn list_workspace_files(project: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(project) else {
        return out;
    };
    for e in rd.flatten() {
        let name = e.file_name();
        if name == "prompt.txt" {
            continue;
        }
        out.push(e.path().to_string_lossy().to_string());
    }
    out
}

fn skip_report_path(rel: &str) -> bool {
    rel == "prompt.txt"
        || rel.starts_with(".git/")
        || rel.starts_with(".git\\")
        || rel == ".git"
}

fn workspace_rel(project: &Path, path: &str) -> String {
    let p = PathBuf::from(path.trim_matches('"'));
    if let Ok(abs) = p.canonicalize() {
        if let Ok(root) = project.canonicalize() {
            if let Ok(rel) = abs.strip_prefix(&root) {
                return rel.to_string_lossy().replace('\\', "/");
            }
        }
    }
    path.replace('\\', "/")
}

fn unique_paths(paths: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for p in paths {
        if p.is_empty() || skip_report_path(&p) {
            continue;
        }
        if seen.insert(p.clone()) {
            out.push(p);
        }
    }
    out
}

fn digest_map(project: &Path) -> HashMap<String, u64> {
    let mut out = HashMap::new();
    walk_digest(project, project, &mut out);
    out
}

fn walk_digest(root: &Path, dir: &Path, out: &mut HashMap<String, u64>) {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    for e in rd.flatten() {
        let path = e.path();
        let rel = path
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        if skip_report_path(&rel) {
            continue;
        }
        if path.is_dir() {
            walk_digest(root, &path, out);
            continue;
        }
        if let Ok(bytes) = std::fs::read(&path) {
            use std::hash::{Hash, Hasher};
            let mut h = std::collections::hash_map::DefaultHasher::new();
            bytes.hash(&mut h);
            out.insert(rel, h.finish());
        }
    }
}

fn changed_since(before: &HashMap<String, u64>, after: &HashMap<String, u64>) -> Vec<String> {
    let mut out = Vec::new();
    for (path, digest) in after {
        if before.get(path) != Some(digest) {
            out.push(path.clone());
        }
    }
    out.sort();
    out
}

fn serialize_tools(tools: &[ToolHit], wall_ms: u64) -> Vec<Value> {
    tools
        .iter()
        .enumerate()
        .map(|(i, t)| {
            let next = tools.get(i + 1).map(|n| n.t_ms).unwrap_or(wall_ms);
            json!({
                "name": t.name,
                "elapsedMs": t.t_ms,
                "durationMs": next.saturating_sub(t.t_ms),
            })
        })
        .collect()
}

async fn send_one(
    app: &AppHandle,
    token: &str,
    prompt: String,
    model: &str,
) -> Result<(), String> {
    let model_list = vec![model.to_string()];
    let goldfish = env_string("SHAPE_VALIDATION_GOLDFISH")
        .map(|_| env_flag("SHAPE_VALIDATION_GOLDFISH", true));
    send_chat_message(
        prompt,
        Some(model.to_string()),
        None,
        None,
        None,
        Some(token.to_string()),
        None,
        None,
        goldfish,
        Some(model.to_string()),
        Some(env_flag("SHAPE_VALIDATION_OPTIMIZE", false)),
        Some("always".into()),
        Some(false),
        None,
        None,
        None,
        None,
        None,
        None,
        env_string("SHAPE_VALIDATION_EFFORT"),
        None,
        Some(model_list.clone()),
        None,
        Some(model_list),
        Some(model.to_string()),
        Some("Code".into()),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        app.state::<AgentState>(),
        app.state::<AppState>(),
        app.state::<crate::agent::index::IndexState>(),
        app.state::<crate::mcp::McpState>(),
        app.state::<PtyState>(),
        app.clone(),
    )
    .await
    .map(|_| ())
    .map_err(|e| e.to_string())
}

pub async fn run(app: AppHandle) -> i32 {
    let token = match access_token() {
        Ok(t) => t,
        Err(e) => {
            eprintln!("{e}");
            return 2;
        }
    };

    let jobs = match load_jobs() {
        Ok(j) => j,
        Err(e) => {
            eprintln!("{e}");
            return 2;
        }
    };

    let capture = Arc::new(Mutex::new(Capture::new()));
    let start_slot: Arc<Mutex<Instant>> = Arc::new(Mutex::new(Instant::now()));

    {
        let capture = capture.clone();
        let start_slot = start_slot.clone();
        let _ = app.listen("chat_token", move |event| {
            let start = *start_slot.lock().unwrap_or_else(|e| e.into_inner());
            if let Ok(v) = serde_json::from_str::<Value>(event.payload()) {
                if let Some(chunk) = v.get("chunk").and_then(|c| c.as_str()) {
                    if let Ok(mut g) = capture.lock() {
                        if g.first_token_ms.is_none() {
                            g.first_token_ms = Some(elapsed_ms(start));
                        }
                        g.text.push_str(chunk);
                    }
                    print!("{chunk}");
                    let _ = io::stdout().flush();
                }
            }
        });
    }
    {
        let capture = capture.clone();
        let start_slot = start_slot.clone();
        let _ = app.listen("chat_status", move |event| {
            let start = *start_slot.lock().unwrap_or_else(|e| e.into_inner());
            if let Ok(v) = serde_json::from_str::<Value>(event.payload()) {
                push_event(&capture, start, "status", v.clone());
                if v.get("phase").and_then(|p| p.as_str()) == Some("tool") {
                    if let Some(tool) = v.get("tool").and_then(|t| t.as_str()) {
                        eprintln!("\n[tool] {tool}");
                        if let Ok(mut g) = capture.lock() {
                            g.tools.push(ToolHit {
                                name: tool.to_string(),
                                t_ms: elapsed_ms(start),
                            });
                        }
                    }
                }
            }
        });
    }
    {
        let capture = capture.clone();
        let start_slot = start_slot.clone();
        let _ = app.listen("shape-file-edited", move |event| {
            let start = *start_slot.lock().unwrap_or_else(|e| e.into_inner());
            let path = event.payload().trim_matches('"').to_string();
            if !path.is_empty() {
                eprintln!("\n[file] {path}");
                push_event(&capture, start, "file", json!({ "path": path }));
                if let Ok(mut g) = capture.lock() {
                    g.files.push(path);
                }
            }
        });
    }
    {
        let capture = capture.clone();
        let start_slot = start_slot.clone();
        let _ = app.listen("chat_complete", move |event| {
            let start = *start_slot.lock().unwrap_or_else(|e| e.into_inner());
            if let Ok(v) = serde_json::from_str::<Value>(event.payload()) {
                push_event(&capture, start, "complete", v.clone());
                if let Ok(mut g) = capture.lock() {
                    if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
                        if !err.trim().is_empty() {
                            g.error = Some(err.to_string());
                        }
                    }
                    g.complete = Some(v);
                }
            }
        });
    }

    let mut suite: Vec<Value> = Vec::new();
    let mut failed = 0;
    let total = jobs.len();

    for (i, job) in jobs.into_iter().enumerate() {
        let prompt = match std::fs::read_to_string(&job.prompt_file) {
            Ok(s) => s.trim().to_string(),
            Err(e) => {
                eprintln!("Could not read {}: {e}", job.prompt_file);
                failed += 1;
                continue;
            }
        };
        let project = PathBuf::from(&job.project);
        let logs = PathBuf::from(&job.logs);
        let jail = PathBuf::from(&job.jail);
        if let Err(e) = std::fs::create_dir_all(&project) {
            eprintln!("{e}");
            failed += 1;
            continue;
        }
        if let Err(e) = assert_inside_jail(&project, &jail) {
            eprintln!("{e}");
            failed += 1;
            continue;
        }

        app.state::<WorkspaceTrustState>()
            .set_trusted(&job.project, true);
        if let Err(e) = crate::commands::fs::set_project_path(
            app.clone(),
            app.state::<AppState>(),
            app.state::<AgentState>(),
            Some(job.project.clone()),
        )
        .await
        {
            eprintln!("Could not set project path: {e}");
            failed += 1;
            continue;
        }
        let _ = apply_new_chat(
            &*app.state::<AgentState>(),
            None,
            Some(job.project.clone()),
        );

        if let Ok(mut g) = capture.lock() {
            g.reset();
        }
        if let Ok(mut s) = start_slot.lock() {
            *s = Instant::now();
        }

        eprintln!("\n=== {} ({}/{}) ===", job.id, i + 1, total);
        eprintln!("{}", prompt.lines().next().unwrap_or(""));
        eprintln!("sandbox: {}", project.display());
        let model = validation_model();
        eprintln!("model: {model}");
        let seed_digest = digest_map(&project);

        let wall = Instant::now();
        let timed = tokio::time::timeout(
            validation_timeout(),
            send_one(&app, &token, prompt, &model),
        )
        .await;
        let wall_ms = elapsed_ms(wall);

        let snap = capture.lock().ok().map(|g| g.clone_lite()).unwrap_or_else(CaptureLite::empty);
        let history = app
            .state::<AgentState>()
            .history
            .lock()
            .ok()
            .and_then(|h| serde_json::to_value(&*h).ok())
            .unwrap_or(json!([]));

        let event_files = unique_paths(
            snap.files
                .iter()
                .map(|p| workspace_rel(&project, p)),
        );
        let changed_files = changed_since(&seed_digest, &digest_map(&project));
        let files = unique_paths(event_files.into_iter().chain(changed_files));
        let wrote_files = !files.is_empty() || !list_workspace_files(&project).is_empty();
        let lower = snap.text.to_ascii_lowercase();
        let stalled_plan = lower.contains("patch plan prepared") && !wrote_files;
        let refused_readonly = lower.contains("read-only") && !wrote_files;
        let used_save_plan = snap.tools.iter().any(|t| t.name == "save_plan");
        let stats = snap.complete.get("stats").cloned().unwrap_or(json!({}));
        let err = snap.error.clone();

        let completed = err.as_ref().map(|e| e.trim().is_empty()).unwrap_or(true)
            && matches!(timed, Ok(Ok(())))
            && !stalled_plan
            && !refused_readonly
            && !used_save_plan
            && (job.expect != "files" || wrote_files)
            && (job.expect != "reply" || !snap.text.trim().is_empty());

        if !completed {
            failed += 1;
        }

        let summary = json!({
            "id": job.id,
            "completed": completed,
            "expect": job.expect,
            "wallMs": wall_ms,
            "firstTokenMs": snap.first_token_ms,
            "timeMs": stats.get("timeMs"),
            "tokens": stats.get("tokens"),
            "inputTokens": stats.get("inputTokens"),
            "outputTokens": stats.get("outputTokens"),
            "model": snap.complete.get("model"),
            "tools": serialize_tools(&capture.lock().ok().map(|g| g.tools.clone()).unwrap_or_default(), wall_ms),
            "wroteFiles": wrote_files,
            "files": files,
            "stalledPlan": stalled_plan,
            "readOnlyRefusal": refused_readonly,
            "savePlan": used_save_plan,
            "error": err,
        });
        write_logs(&logs, &capture.lock().ok().map(|g| (*g).clone_for_write()).unwrap_or_else(Capture::new), &history, &summary, wall_ms);
        eprintln!(
            "stats wallMs={wall_ms} ttfbMs={} timeMs={} in={} out={} tools={} {}",
            snap.first_token_ms.unwrap_or(0),
            stats
                .get("timeMs")
                .and_then(|v| v.as_f64().or_else(|| v.as_u64().map(|n| n as f64)))
                .unwrap_or(0.0),
            stats
                .get("inputTokens")
                .and_then(|v| v.as_u64().or_else(|| v.as_f64().map(|n| n as u64)))
                .unwrap_or(0),
            stats
                .get("outputTokens")
                .and_then(|v| v.as_u64().or_else(|| v.as_f64().map(|n| n as u64)))
                .unwrap_or(0),
            snap.tools.len(),
            if completed { "completed" } else { "fail" }
        );
        suite.push(summary);

        match timed {
            Err(_) => eprintln!("Timed out."),
            Ok(Err(e)) => eprintln!("send_chat_message failed: {e}"),
            Ok(Ok(())) => {}
        }
    }

    if let Some(out) = std::env::var("SHAPE_SUITE_SUMMARY").ok().filter(|s| !s.is_empty()) {
        let _ = std::fs::write(
            out,
            serde_json::to_string_pretty(&json!({ "failed": failed, "jobs": suite })).unwrap_or_default(),
        );
    }

    if failed > 0 {
        eprintln!("validation failed ({failed}/{total})");
        1
    } else {
        eprintln!("validation ok ({total})");
        0
    }
}

#[derive(Clone, Serialize)]
struct ToolHitSer {
    name: String,
    #[serde(rename = "tMs")]
    t_ms: u64,
}

impl From<&ToolHit> for ToolHitSer {
    fn from(t: &ToolHit) -> Self {
        Self {
            name: t.name.clone(),
            t_ms: t.t_ms,
        }
    }
}

struct CaptureLite {
    text: String,
    tools: Vec<ToolHitSer>,
    files: Vec<String>,
    error: Option<String>,
    complete: Value,
    first_token_ms: Option<u64>,
}

impl CaptureLite {
    fn empty() -> Self {
        Self {
            text: String::new(),
            tools: Vec::new(),
            files: Vec::new(),
            error: None,
            complete: json!({}),
            first_token_ms: None,
        }
    }
}

impl Capture {
    fn clone_lite(&self) -> CaptureLite {
        CaptureLite {
            text: self.text.clone(),
            tools: self.tools.iter().map(ToolHitSer::from).collect(),
            files: self.files.clone(),
            error: self.error.clone(),
            complete: self.complete.clone().unwrap_or(json!({})),
            first_token_ms: self.first_token_ms,
        }
    }

    fn clone_for_write(&self) -> Self {
        Self {
            text: self.text.clone(),
            tools: self.tools.clone(),
            files: self.files.clone(),
            events: self.events.clone(),
            error: self.error.clone(),
            complete: self.complete.clone(),
            first_token_ms: self.first_token_ms,
        }
    }
}

struct Job {
    id: String,
    prompt_file: String,
    project: String,
    logs: String,
    expect: String,
    jail: String,
}

fn load_jobs() -> Result<Vec<Job>, String> {
    if let Ok(path) = std::env::var("SHAPE_PROMPT_MANIFEST") {
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let manifest: Manifest = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        return Ok(manifest
            .jobs
            .into_iter()
            .map(|j| Job {
                id: j.id,
                prompt_file: j.prompt_file,
                project: j.project,
                logs: j.logs,
                expect: j.expect,
                jail: manifest.jail.clone(),
            })
            .collect());
    }
    let prompt = if let Ok(path) = std::env::var("SHAPE_PROMPT_FILE") {
        std::fs::read_to_string(path.trim()).map_err(|e| e.to_string())?
    } else {
        std::env::var("SHAPE_PROMPT").unwrap_or_default()
    };
    if prompt.trim().is_empty() {
        return Err("No prompt.".into());
    }
    let jail = std::env::var("SHAPE_VALIDATION_JAIL")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("shape-validation"));
    let project = std::env::var("SHAPE_VALIDATION_DIR")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| jail.join("workspace"));
    std::fs::create_dir_all(&project).map_err(|e| e.to_string())?;
    let prompt_file = project.join("prompt.txt");
    std::fs::write(&prompt_file, prompt).map_err(|e| e.to_string())?;
    Ok(vec![Job {
        id: "adhoc".into(),
        prompt_file: prompt_file.to_string_lossy().into(),
        project: project.to_string_lossy().into(),
        logs: project.to_string_lossy().into(),
        expect: "files".into(),
        jail: jail.to_string_lossy().into(),
    }])
}
