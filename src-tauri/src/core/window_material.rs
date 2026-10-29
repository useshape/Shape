//! Windows 11 acrylic, via the same `window-vibrancy` path Tauri uses for Mica.

use tauri::WebviewWindow;

pub fn install(window: &WebviewWindow) {
    #[cfg(windows)]
    install_windows(window);
    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(windows)]
fn install_windows(window: &WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Controller2, COREWEBVIEW2_COLOR,
    };
    use windows_core::Interface;

    if let Err(error) = window_vibrancy::apply_acrylic(window, None) {
        log::warn!("window material: acrylic: {error}");
    }

    let result = window.with_webview(|webview| unsafe {
        let Ok(controller) = webview.controller().cast::<ICoreWebView2Controller2>() else {
            log::warn!("window material: webview background control is unavailable");
            return;
        };
        if let Err(error) = controller.SetDefaultBackgroundColor(COREWEBVIEW2_COLOR {
            A: 0,
            R: 0,
            G: 0,
            B: 0,
        }) {
            log::warn!("window material: webview background: {error}");
        }
    });
    if let Err(error) = result {
        log::warn!("window material: webview: {error}");
    }
}
