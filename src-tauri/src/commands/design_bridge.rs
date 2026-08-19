use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager};

use crate::core::error::AppError;

static INSTALLED: AtomicBool = AtomicBool::new(false);

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
{script}
}})();"#
    )
}

/// Inject the design-mode bridge into every future iframe document (WebView2).
/// The preview iframe keeps its real localhost URL — no proxy, no reload-to-proxy.
#[tauri::command]
pub fn register_design_bridge(app: AppHandle, script: String) -> Result<(), AppError> {
    if INSTALLED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let Some(win) = app.get_webview_window("main") else {
        INSTALLED.store(false, Ordering::SeqCst);
        return Ok(());
    };
    let wrapped = wrap_iframe_only(&script);
    win.with_webview(move |webview| {
        #[cfg(windows)]
        if let Err(err) = install_on_windows(&webview, &wrapped) {
            log::warn!("design bridge inject failed: {err}");
            INSTALLED.store(false, Ordering::SeqCst);
        }
        #[cfg(not(windows))]
        {
            let _ = (webview, wrapped);
            INSTALLED.store(false, Ordering::SeqCst);
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
        "DEBUG" => log::debug!(target: "design", "{message}"),
        _ => log::debug!(target: "design", "{message}"),
    }
}

#[cfg(windows)]
fn install_on_windows(
    webview: &tauri::webview::PlatformWebview,
    script: &str,
) -> Result<(), String> {
    use webview2_com::AddScriptToExecuteOnDocumentCreatedCompletedHandler;
    use windows_core::HSTRING;

    unsafe {
        let controller = webview.controller();
        let core = controller.CoreWebView2().map_err(|e| e.to_string())?;
        let handler =
            AddScriptToExecuteOnDocumentCreatedCompletedHandler::create(Box::new(|_hr, _id| Ok(())));
        core.AddScriptToExecuteOnDocumentCreated(&HSTRING::from(script), &handler)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
