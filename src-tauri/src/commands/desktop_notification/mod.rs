use crate::core::error::AppError;
use tauri::AppHandle;

/// OS toast for generation-complete / approval.
/// Windows uses a Shape-attributed WinRT toast (not PowerShell).
#[tauri::command]
pub fn show_desktop_notification(
    app: AppHandle,
    title: String,
    body: String,
) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        let _ = app;
        crate::core::windows_notifications::show(&title, &body).map_err(AppError::Message)?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        use tauri_plugin_notification::NotificationExt;
        app.notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|e| AppError::Message(e.to_string()))?;
        Ok(())
    }
}
