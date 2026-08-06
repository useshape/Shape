//! Windows toast notifications that show as "Shape" instead of PowerShell.
//!
//! `tauri-plugin-notification` skips setting AppUserModelID when the exe lives
//! under `target/debug` or `target/release`, so Action Center attributes the
//! toast to PowerShell. We register our own AUMID and send WinRT toasts directly.

use tauri_winrt_notification::{IconCrop, Toast};

const APP_ID: &str = "com.shape.app";
const DISPLAY_NAME: &str = "Shape";

/// Register process AUMID + HKCU display name so toasts attribute to Shape.
pub fn init() {
    set_process_aumid();
    register_aumid_display_name();
}

fn set_process_aumid() {
    use std::os::windows::ffi::OsStrExt;
    use std::ffi::OsStr;

    #[link(name = "shell32")]
    unsafe extern "system" {
        fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
    }

    let wide: Vec<u16> = OsStr::new(APP_ID)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    // SAFETY: null-terminated UTF-16 app id; call is process-wide and idempotent.
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(wide.as_ptr());
    }
}

fn register_aumid_display_name() {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = format!(r"Software\Classes\AppUserModelId\{}", APP_ID);
    if let Ok((key, _)) = hkcu.create_subkey(&path) {
        let _ = key.set_value("DisplayName", &DISPLAY_NAME);
        if let Ok(exe) = std::env::current_exe() {
            let icon = format!("{},0", exe.display());
            let _ = key.set_value("IconUri", &icon);
        }
    }
}

/// Show a desktop toast attributed to Shape.
pub fn show(title: &str, body: &str) -> Result<(), String> {
    let mut toast = Toast::new(APP_ID).title(title).text1(body);
    if let Some(icon) = toast_icon_path() {
        toast = toast.icon(&icon, IconCrop::Square, DISPLAY_NAME);
    }
    toast.show().map_err(|e| e.to_string())
}

fn toast_icon_path() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    // Dev: src-tauri/icons/icon.ico beside target/{debug,release}
    for candidate in [
        dir.join("icons").join("icon.ico"),
        dir.join("..").join("icons").join("icon.ico"),
        dir.join("..").join("..").join("icons").join("icon.ico"),
        dir.join("resources").join("icon.ico"),
    ] {
        if candidate.is_file() {
            return candidate.canonicalize().ok().or(Some(candidate));
        }
    }
    None
}
