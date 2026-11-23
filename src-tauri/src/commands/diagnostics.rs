#[tauri::command]
pub fn diagnostics_heartbeat(telemetry_enabled: bool, sentry_dsn: String) {
    crate::core::diagnostics::beat(telemetry_enabled, &sentry_dsn);
}

#[tauri::command]
pub fn diagnostics_note(source: String, message: String) {
    let source = if source == "ui" || source == "next" || source == "rust" {
        source
    } else {
        "ui".into()
    };
    crate::core::diagnostics::note_log(&source, &message);
}
