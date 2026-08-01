use crate::commands::device_id;

#[tauri::command]
pub fn get_device_id() -> Result<String, String> {
    device_id::get_device_id()
}
