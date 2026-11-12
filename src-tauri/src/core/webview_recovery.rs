//! Notify the UI when the Next.js origin fails to load in the webview.

#[cfg(windows)]
pub fn install(app: &tauri::AppHandle) {
    use std::sync::atomic::{AtomicBool, Ordering};
    use tauri::{Emitter, Manager};
    use webview2_com::NavigationCompletedEventHandler;

    static INSTALLED: AtomicBool = AtomicBool::new(false);
    if INSTALLED.swap(true, Ordering::SeqCst) {
        return;
    }

    let Some(window) = app.get_webview_window("main") else {
        INSTALLED.store(false, Ordering::SeqCst);
        return;
    };
    let handle = app.clone();
    let _ = window.with_webview(move |webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            return;
        };
        let handler = NavigationCompletedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else {
                return Ok(());
            };
            let mut ok = windows_core::BOOL(1);
            args.IsSuccess(&mut ok)?;
            if ok.as_bool() {
                return Ok(());
            }
            let _ = handle.emit("webview-load-failed", ());
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core.add_NavigationCompleted(&handler, &mut token);
        std::mem::forget(handler);
    });
}

#[cfg(not(windows))]
pub fn install(_app: &tauri::AppHandle) {}
