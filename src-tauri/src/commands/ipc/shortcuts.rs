use crate::core::error::AppError;
use tauri::AppHandle;

pub fn setup_menu(app: &AppHandle) -> tauri::Result<()> {
    crate::commands::shortcuts::setup_menu(app)
}

pub fn handle_menu_event(app: &AppHandle, event_id: &str) {
    crate::commands::shortcuts::handle_menu_event(app, event_id);
}

#[tauri::command]
pub fn handle_shortcut(app: AppHandle, shortcut: String) {
    crate::commands::shortcuts::handle_shortcut(app, shortcut);
}

#[tauri::command]
pub fn spawn_new_window() -> Result<(), AppError> {
    crate::commands::shortcuts::spawn_new_window()
}

#[tauri::command]
pub fn is_fresh_window() -> bool {
    crate::commands::shortcuts::is_fresh_window()
}
