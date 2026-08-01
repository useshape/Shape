use crate::core::error::AppError;
use std::process::Command;
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::{AppHandle, Emitter};

pub fn setup_menu(app: &AppHandle) -> tauri::Result<()> {
    // Only keeping a minimal file menu for native integration
    let new_text_file =
        MenuItem::with_id(app, "new_text_file", "New Text File", true, Some("Ctrl+N"))?;
    let open_file = MenuItem::with_id(app, "open_file", "Open File", true, Some("Ctrl+O"))?;
    let save = MenuItem::with_id(app, "save", "Save", true, Some("Ctrl+S"))?;
    let close_tab = MenuItem::with_id(app, "close_tab", "Close Tab", true, Some("Ctrl+W"))?;
    let exit = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[&new_text_file, &open_file, &save, &close_tab, &exit],
    )?;

    let menu = Menu::with_items(app, &[&file_menu])?;
    app.set_menu(menu)?;

    Ok(())
}

fn execute_shortcut_action(app: &AppHandle, action: &str) {
    match action {
        "save" | "Ctrl+S" => {
            let _ = app.emit("save-request", ());
        }
        "new_text_file" | "Ctrl+N" => {
            let _ = app.emit("new-file", ());
        }
        "close_tab" | "Ctrl+W" => {
            let _ = crate::domain::filesystem::service::close_active_file_helper(app);
        }
        "recent_files" | "Ctrl+E" => {
            let _ = app.emit("shape-command-palette", serde_json::json!({ "mode": "files", "recent": true }));
        }
        "close_all_tabs" => {
            let _ = crate::domain::filesystem::service::close_all_files_helper(app);
        }
        "open_file" | "Ctrl+O" => {
            // Usually handled by frontend dispatching to file picker
            let _ = app.emit("open-file-request", ());
        }
        "Ctrl+Shift+F" => {
            let _ = app.emit("open-find-in-files", ());
        }
        "Ctrl+H" => {
            let _ = app.emit("open-replace-in-files", ());
        }
        "Ctrl+K S" => {
            let _ = app.emit("save-all-request", ());
        }
        "F12" | "Alt+Shift+F" => {
            let _ = app.emit("editor-shortcut", action);
        }
        "Alt+F4" | "close_window" | "exit" => {
            app.exit(0);
        }
        "Ctrl+K Z" => {
            let _ = app.emit("toggle-zen-mode", ());
        }
        _ => {
            // Forward other shortcuts as events if needed,
            // but the JS side already intercepts them.
        }
    }
}

pub fn handle_menu_event(app: &AppHandle, event_id: &str) {
    execute_shortcut_action(app, event_id);
}

pub fn handle_shortcut(app: AppHandle, shortcut: String) {
    execute_shortcut_action(&app, &shortcut);
}

pub fn spawn_new_window() -> Result<(), AppError> {
    let current_exe = std::env::current_exe().map_err(|e| AppError::Io(e))?;
    let mut cmd = Command::new(current_exe);
    // Fresh windows must not auto-restore the previous window's project.
    cmd.arg("--fresh-window");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd.spawn()
        .map_err(|e| AppError::Io(e))?;
    Ok(())
}

/// True when this process was launched via Window → New Window.
pub fn is_fresh_window() -> bool {
    std::env::args().any(|a| a == "--fresh-window")
}
