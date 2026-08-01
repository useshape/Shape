use uuid::Uuid;

#[cfg(target_os = "windows")]
fn read_or_create_device_id() -> Result<String, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey("Software\\Shape")
        .map_err(|e| e.to_string())?;

    if let Ok(id) = key.get_value::<String, _>("DeviceId") {
        if !id.is_empty() {
            return Ok(id);
        }
    }

    let id = Uuid::new_v4().to_string();
    key.set_value("DeviceId", &id)
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[cfg(not(target_os = "windows"))]
fn read_or_create_device_id() -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;

    let path: PathBuf = dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("Shape")
        .join("device_id");

    if path.exists() {
        if let Ok(id) = fs::read_to_string(&path) {
            let trimmed = id.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let id = Uuid::new_v4().to_string();
    fs::write(&path, &id).map_err(|e| e.to_string())?;
    Ok(id)
}

pub fn get_device_id() -> Result<String, String> {
    read_or_create_device_id()
}
