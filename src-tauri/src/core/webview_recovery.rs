//! Notify the UI when the Next.js origin fails to load in the webview.

#[cfg(windows)]
pub fn install(app: &tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    use webview2_com::NavigationCompletedEventHandler;

    let Some(window) = app.get_webview_window("main") else {
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
