use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::core::error::AppError;

struct BridgeInstall {
    hash: u64,
    script_id: Option<String>,
}

static INSTALL: Mutex<Option<BridgeInstall>> = Mutex::new(None);

fn script_hash(script: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    script.hash(&mut hasher);
    hasher.finish()
}

fn wrap_iframe_only(script: &str) -> String {
    format!(
        r#"(function(){{
try {{
  if (window.top === window) return;
  var loc = location || {{}};
  var h = String(loc.hostname || "");
  var port = String(loc.port || "");
  if (h !== "localhost" && h !== "127.0.0.1" && h !== "[::1]" && h !== "::1") return;
  // Never inject into the Shape IDE itself (nested / HMR iframes on 48921).
  if (port === "48921" || port === "1420") return;
  var path = String(loc.pathname || "");
  if (path.indexOf("/_next") === 0 || path.indexOf("/onboarding") === 0) return;
}} catch (e) {{ return; }}
function boot() {{{script}
}}
// DocumentCreated is too early: wrapping fetch/history and appending overlay
// nodes before React hydrates leaves Next/Vite previews as a white canvas.
if (document.readyState === "complete") {{
  setTimeout(boot, 0);
}} else {{
  window.addEventListener("load", function () {{ setTimeout(boot, 0); }});
}}
}})();"#
    )
}

/// Inject the design-mode bridge into every future iframe document (WebView2).
/// The preview iframe keeps its real localhost URL — no proxy, no reload-to-proxy.
#[tauri::command]
pub fn register_design_bridge(app: AppHandle, script: String) -> Result<(), AppError> {
    let wrapped = wrap_iframe_only(&script);
    let hash = script_hash(&wrapped);
    let previous_id = {
        let mut guard = INSTALL.lock().unwrap_or_else(|e| e.into_inner());
        if guard.as_ref().is_some_and(|st| st.hash == hash) {
            return Ok(());
        }
        let prev = guard.take().and_then(|st| st.script_id);
        *guard = Some(BridgeInstall {
            hash,
            script_id: None,
        });
        prev
    };
    let Some(win) = app.get_webview_window("main") else {
        *INSTALL.lock().unwrap_or_else(|e| e.into_inner()) = None;
        return Ok(());
    };
    win.with_webview(move |webview| {
        #[cfg(windows)]
        if let Err(err) = install_on_windows(&webview, &wrapped, previous_id) {
            log::warn!("design bridge inject failed: {err}");
            *INSTALL.lock().unwrap_or_else(|e| e.into_inner()) = None;
        }
        #[cfg(not(windows))]
        {
            let _ = (webview, wrapped, previous_id);
            *INSTALL.lock().unwrap_or_else(|e| e.into_inner()) = None;
        }
    })
    .map_err(|e| AppError::Message(e.to_string()))
}

/// Print design-mode diagnostics to the Shape log target only — never the project PTY.
#[tauri::command]
pub fn design_mode_log(level: String, message: String) {
    match level.to_ascii_uppercase().as_str() {
        "ERROR" => log::error!(target: "design", "{message}"),
        "WARN" => log::warn!(target: "design", "{message}"),
        "INFO" => log::info!(target: "design", "{message}"),
        "DEBUG" => log::debug!(target: "design", "{message}"),
        _ => log::info!(target: "design", "{message}"),
    }
}

#[cfg(windows)]
fn install_on_windows(
    webview: &tauri::webview::PlatformWebview,
    script: &str,
    previous_id: Option<String>,
) -> Result<(), String> {
    use webview2_com::AddScriptToExecuteOnDocumentCreatedCompletedHandler;
    use windows_core::HSTRING;

    unsafe {
        let controller = webview.controller();
        let core = controller.CoreWebView2().map_err(|e| e.to_string())?;
        if let Some(id) = previous_id {
            let _ = core.RemoveScriptToExecuteOnDocumentCreated(&HSTRING::from(id));
        }
        let handler = AddScriptToExecuteOnDocumentCreatedCompletedHandler::create(Box::new(
            |_hr, id| {
                let script_id = id.to_string();
                if !script_id.is_empty() {
                    if let Ok(mut guard) = INSTALL.lock() {
                        if let Some(st) = guard.as_mut() {
                            st.script_id = Some(script_id);
                        }
                    }
                }
                Ok(())
            },
        ));
        core.AddScriptToExecuteOnDocumentCreated(&HSTRING::from(script), &handler)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
