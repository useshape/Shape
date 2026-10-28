//! Acrylic behind the main window. The webview paints an opaque body, so the
//! backdrop is only visible through the transparent titlebar.

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
    use windows::Win32::Graphics::Dwm::{
        DwmEnableBlurBehindWindow, DwmSetWindowAttribute, DWMWA_SYSTEMBACKDROP_TYPE,
        DWMWA_USE_IMMERSIVE_DARK_MODE, DWM_BB_BLURREGION, DWM_BB_ENABLE, DWM_BLURBEHIND,
        DWMSBT_TRANSIENTWINDOW,
    };
    use windows::Win32::Graphics::Gdi::HRGN;
    use windows_core::Interface;

    let Ok(hwnd) = window.hwnd() else {
        log::warn!("window material: main window has no hwnd");
        return;
    };

    let dark = 1u32;
    if let Err(error) = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &dark as *const _ as *const _,
            4,
        )
    } {
        log::warn!("window material: dark mode: {error}");
    }

    // Tao's transparent window uses an empty blur region, which does not sample
    // the desktop. A null region lets Acrylic show through transparent pixels.
    let blur = DWM_BLURBEHIND {
        dwFlags: DWM_BB_ENABLE | DWM_BB_BLURREGION,
        fEnable: true.into(),
        hRgnBlur: HRGN::default(),
        fTransitionOnMaximized: false.into(),
    };
    if let Err(error) = unsafe { DwmEnableBlurBehindWindow(hwnd, &blur) } {
        log::warn!("window material: blur: {error}");
    }

    let backdrop = DWMSBT_TRANSIENTWINDOW;
    if let Err(error) = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            &backdrop as *const _ as *const _,
            std::mem::size_of_val(&backdrop) as u32,
        )
    } {
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
