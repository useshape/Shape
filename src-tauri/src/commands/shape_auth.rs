use keyring::Entry;

const SERVICE: &str = "shape-cloud-auth";
const USER: &str = "desktop";

pub fn load_token() -> Option<String> {
    let entry = Entry::new(SERVICE, USER).ok()?;
    let token = entry.get_password().ok()?;
    let trimmed = token.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

pub fn save_token(token: &str) -> Result<(), String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return delete_token();
    }
    let entry = Entry::new(SERVICE, USER).map_err(|e| e.to_string())?;
    entry.set_password(trimmed).map_err(|e| e.to_string())
}

pub fn delete_token() -> Result<(), String> {
    let entry = Entry::new(SERVICE, USER).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn shape_auth_save_token(token: String) -> Result<(), String> {
    save_token(&token)
}

#[tauri::command]
pub fn shape_auth_load_token() -> Option<String> {
    load_token()
}

#[tauri::command]
pub fn shape_auth_clear_token() -> Result<(), String> {
    delete_token()
}
