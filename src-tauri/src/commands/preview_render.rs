use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Listener, Manager};
use tokio::sync::oneshot;
use url::Url;

use crate::commands::design_sandbox;
use crate::core::error::AppError;
use crate::agent::commands::logging;

const MAX_WIDTH: u32 = 1920;
const MAX_HEIGHT: u32 = 1080;
const CAPTURE_TIMEOUT_MS: u64 = 15_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureHtmlPreviewRequest {
    pub html: String,
    pub width: u32,
    pub height: u32,
    pub project_path: Option<String>,
    pub use_project_tokens: Option<bool>,
    /// When true, `html` is a full document and must not be wrapped again.
    pub full_document: Option<bool>,
    /// Optional longer timeout for React sandbox documents.
    pub react_sandbox: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedPreview {
    pub png_path: String,
    pub width: u32,
    pub height: u32,
    pub render_ms: u64,
}

#[derive(Debug, Deserialize, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignAgentOptions {
    #[serde(default = "default_true")]
    pub visual_previews: bool,
    #[serde(default = "default_true")]
    pub multiple_concepts: bool,
    #[serde(default = "default_true")]
    pub hide_code_until_chosen: bool,
    #[serde(default = "default_true")]
    pub use_project_tokens: bool,
    #[serde(default)]
    pub responsive_frames: bool,
    #[serde(default)]
    pub accessibility_pass: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesignPreviewCaptureResultEvent {
    request_id: String,
    png_path: Option<String>,
    error: Option<String>,
}

/// Pending in-app iframe capture requests (Rust → frontend → Rust).
pub struct PreviewCaptureState {
    pending: Mutex<HashMap<String, oneshot::Sender<Result<(), String>>>>,
}

impl Default for PreviewCaptureState {
    fn default() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
        }
    }
}

/// How long to let the frontend capture host tear down an offscreen iframe
/// after an abort before the caller proceeds with more disruptive cleanup
/// (e.g. killing the PTY). Without this drain, WebView2 could be torn down
/// mid-paint on an abandoned capture, surfacing as "invalid window handle"
/// on Windows.
const CAPTURE_ABORT_DRAIN_MS: u64 = 150;

impl PreviewCaptureState {
    pub fn abort_all_pending(&self, reason: &str) {
        let mut guard = match self.pending.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        for (_, tx) in guard.drain() {
            let _ = tx.send(Err(reason.to_string()));
        }
    }

    /// Broadcasts the abort to the frontend capture host (which removes any
    /// offscreen iframes and drops its own pending state), drops any
    /// Rust-side waiters, then sleeps briefly so the frontend has a chance to
    /// actually finish tearing down before the caller continues.
    pub async fn abort_and_drain(&self, app: &AppHandle, reason: &str) {
        let _ = app.emit("design-preview-capture-abort", ());
        self.abort_all_pending(reason);
        tokio::time::sleep(Duration::from_millis(CAPTURE_ABORT_DRAIN_MS)).await;
    }

    pub fn register_listener(&self, app: &AppHandle) {
        let app_for_listener = app.clone();
        let _ = app.listen("design-preview-capture-result", move |event| {
            let payload: DesignPreviewCaptureResultEvent = match serde_json::from_str(event.payload()) {
                Ok(p) => p,
                Err(e) => {
                    logging::warn(
                        "design_preview",
                        &format!("Invalid design-preview-capture-result payload: {e}"),
                    );
                    return;
                }
            };
            let state = app_for_listener.state::<PreviewCaptureState>();
            let mut guard = match state.pending.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            let Some(tx) = guard.remove(&payload.request_id) else {
                return;
            };
            let result = if let Some(err) = payload.error.filter(|e| !e.trim().is_empty()) {
                Err(err)
            } else if payload.png_path.is_some() {
                Ok(())
            } else {
                Err("Preview capture returned no path".to_string())
            };
            let _ = tx.send(result);
        });
    }
}

fn default_true() -> bool {
    true
}

#[allow(dead_code)]
pub fn design_options_prompt_block(options: &DesignAgentOptions) -> String {
    format!(
        "<design_agent_options>\n{}\n</design_agent_options>",
        serde_json::to_string(options).unwrap_or_else(|_| "{}".to_string())
    )
}

pub fn wrap_preview_html_public(
    body_html: &str,
    project_path: Option<&str>,
    use_project_tokens: bool,
) -> String {
    let project_css = if use_project_tokens {
        load_project_css(project_path)
    } else {
        String::new()
    };
    design_sandbox::build_static_preview_html(body_html, &project_css)
}

#[tauri::command]
pub async fn capture_html_preview(
    app: AppHandle,
    html: String,
    width: u32,
    height: u32,
    project_path: Option<String>,
    use_project_tokens: Option<bool>,
) -> Result<CapturedPreview, AppError> {
    let req = CaptureHtmlPreviewRequest {
        html,
        width: width.min(MAX_WIDTH).max(320),
        height: height.min(MAX_HEIGHT).max(240),
        project_path,
        use_project_tokens,
        full_document: None,
        react_sandbox: None,
    };
    capture_html_preview_inner(&app, req).await
}

pub async fn capture_html_preview_inner(
    app: &AppHandle,
    req: CaptureHtmlPreviewRequest,
) -> Result<CapturedPreview, AppError> {
    let started = Instant::now();
    let request_id = uuid::Uuid::new_v4().to_string();
    let preview_id = uuid::Uuid::new_v4().to_string();

    let preview_dir = std::env::temp_dir().join("shape-design-previews");
    tokio::fs::create_dir_all(&preview_dir)
        .await
        .map_err(|e| AppError::Env(format!("Failed to create preview dir: {e}")))?;
    design_sandbox::ensure_preview_runtime_bundle(&preview_dir)?;

    let bundle_path = preview_dir.join(design_sandbox::PREVIEW_BUNDLE_FILENAME);
    let bundle_src = asset_url_for_path(&bundle_path)?.to_string();

    let png_path = preview_dir.join(format!("{preview_id}.png"));

    let mut document = if req.full_document.unwrap_or(false) {
        req.html.clone()
    } else {
        wrap_preview_html(
            &req.html,
            req.project_path.as_deref(),
            req.use_project_tokens.unwrap_or(true),
        )
    };
    if document.contains(r#"src="bundle.js""#) {
        document = document.replace(
            r#"src="bundle.js""#,
            &format!(r#"src="{bundle_src}""#),
        );
    }
    let tailwind_path = preview_dir.join(design_sandbox::PREVIEW_TAILWIND_FILENAME);
    let tailwind_src = asset_url_for_path(&tailwind_path)?.to_string();
    if document.contains(r#"src="tailwind-browser.js""#) {
        document = document.replace(
            r#"src="tailwind-browser.js""#,
            &format!(r#"src="{tailwind_src}""#),
        );
    }

    let html_path = preview_dir.join(format!("{preview_id}.html"));
    tokio::fs::write(&html_path, &document)
        .await
        .map_err(|e| AppError::Env(format!("Failed to write preview html: {e}")))?;

    logging::debug(
        "design_preview",
        &format!(
            "Capture request {}x{} → {}",
            req.width,
            req.height,
            png_path.to_string_lossy()
        ),
    );

    let state = app.state::<PreviewCaptureState>();
    let (tx, rx) = oneshot::channel();
    state
        .pending
        .lock()
        .map_err(|e| AppError::Env(format!("Preview capture lock poisoned: {e}")))?
        .insert(request_id.clone(), tx);

    let emit_result = app.emit(
        "design-preview-capture",
        serde_json::json!({
            "requestId": request_id,
            "htmlPath": html_path.to_string_lossy(),
            "width": req.width,
            "height": req.height,
            "pngPath": png_path.to_string_lossy(),
        }),
    );
    if let Err(e) = emit_result {
        let _ = state.pending.lock().map(|mut g| g.remove(&request_id));
        return Err(AppError::Env(format!("Failed to emit preview capture request: {e}")));
    }

    let timeout_ms = if req.react_sandbox.unwrap_or(false) {
        CAPTURE_TIMEOUT_MS + 15_000
    } else {
        CAPTURE_TIMEOUT_MS
    };

    let capture_result = match tokio::time::timeout(Duration::from_millis(timeout_ms), rx).await {
        Ok(Ok(Ok(()))) => Ok(()),
        Ok(Ok(Err(msg))) => Err(AppError::Env(msg)),
        Ok(Err(_)) => Err(AppError::Env(
            "Preview capture channel closed before result".to_string(),
        )),
        Err(_) => Err(AppError::Env(format!(
            "Preview capture timed out after {timeout_ms}ms (in-app iframe)"
        ))),
    };

    if capture_result.is_err() {
        let _ = state.pending.lock().map(|mut g| g.remove(&request_id));
    }
    capture_result?;

    Ok(CapturedPreview {
        png_path: png_path.to_string_lossy().into_owned(),
        width: req.width,
        height: req.height,
        render_ms: started.elapsed().as_millis() as u64,
    })
}

fn wrap_preview_html(body_html: &str, project_path: Option<&str>, use_project_tokens: bool) -> String {
    let project_css = if use_project_tokens {
        load_project_css(project_path)
    } else {
        String::new()
    };
    design_sandbox::build_static_preview_html(body_html, &project_css)
}

fn load_project_css(project_path: Option<&str>) -> String {
    let Some(root) = project_path else {
        return String::new();
    };
    let candidates = [
        Path::new(root).join("app").join("globals.css"),
        Path::new(root).join("src").join("app").join("globals.css"),
        Path::new(root).join("shape").join("app").join("globals.css"),
        Path::new(root).join("globals.css"),
    ];
    for path in candidates {
        if let Ok(css) = std::fs::read_to_string(&path) {
            return css;
        }
    }
    String::new()
}

fn asset_url_for_path(path: &Path) -> Result<Url, AppError> {
    let canonical = path
        .canonicalize()
        .map_err(|e| AppError::Env(format!("Failed to canonicalize preview path: {e}")))?;
    let canonical_str = strip_extended_path_prefix(&canonical.to_string_lossy());
    let encoded = urlencoding::encode(&canonical_str);
    #[cfg(windows)]
    let url = format!("http://asset.localhost/{encoded}");
    #[cfg(not(windows))]
    let url = format!("asset://localhost/{encoded}");
    Url::parse(&url).map_err(|e| AppError::Env(format!("Invalid preview asset url: {e}")))
}

fn strip_extended_path_prefix(path: &str) -> String {
    path.strip_prefix(r"\\?\")
        .or_else(|| path.strip_prefix("//?/"))
        .unwrap_or(path)
        .to_string()
}

pub fn cleanup_preview_dir() {
    let preview_dir = std::env::temp_dir().join("shape-design-previews");
    let _ = std::fs::remove_dir_all(preview_dir);
}

#[tauri::command]
pub fn cleanup_design_sandbox(
    session_id: Option<String>,
    state: tauri::State<'_, crate::agent::models::AgentState>,
) -> Result<(), AppError> {
    match session_id {
        Some(id) if !id.trim().is_empty() => {
            crate::commands::design_sandbox::cleanup_session(id.trim());
            cleanup_preview_dir();
        }
        _ => {
            state.clear_design_preview_state();
        }
    }
    Ok(())
}
