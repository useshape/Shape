use super::oauth::StoredMcpTokens;

const SERVICE: &str = "shape-mcp-oauth";

pub fn load_token(server_id: &str) -> Option<StoredMcpTokens> {
    let entry = keyring::Entry::new(SERVICE, server_id).ok()?;
    let data = entry.get_password().ok()?;
    serde_json::from_str(&data).ok()
}

pub fn save_token(server_id: &str, tokens: &StoredMcpTokens) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, server_id).map_err(|e| e.to_string())?;
    let json = serde_json::to_string(tokens).map_err(|e| e.to_string())?;
    entry.set_password(&json).map_err(|e| e.to_string())
}
