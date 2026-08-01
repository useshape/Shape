use crate::core::error::AppError;
use crate::mcp::{McpServerConfig, McpState, McpStatusEntry};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn mcp_config_path() -> Result<PathBuf, AppError> {
    let base = dirs::data_dir()
        .ok_or_else(|| AppError::Message("Could not resolve data directory".to_string()))?;
    Ok(base.join("shape").join("mcp.json"))
}

#[tauri::command]
pub fn get_mcp_config_path() -> Result<String, AppError> {
    Ok(mcp_config_path()?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn ensure_mcp_config() -> Result<String, AppError> {
    let path = mcp_config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::Message(e.to_string()))?;
    }
    if !path.exists() {
        let default = "{\n  \"mcpServers\": {}\n}\n";
        fs::write(&path, default).map_err(|e| AppError::Message(e.to_string()))?;
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn sync_mcp_servers(
    servers: Vec<McpServerConfig>,
    mcp_state: tauri::State<'_, McpState>,
) -> Result<Vec<McpStatusEntry>, AppError> {
    mcp_state
        .sync_servers(servers)
        .map_err(|e| AppError::Message(e))
}

#[tauri::command]
pub fn get_mcp_status(mcp_state: tauri::State<'_, McpState>) -> Result<Vec<McpStatusEntry>, AppError> {
    mcp_state.get_status().map_err(|e| AppError::Message(e))
}

#[tauri::command]
pub fn get_mcp_tools(mcp_state: tauri::State<'_, McpState>) -> Result<Vec<crate::mcp::McpToolInfo>, AppError> {
    mcp_state.all_tools().map_err(|e| AppError::Message(e))
}

#[tauri::command]
pub fn restart_mcp_server(
    id: String,
    mcp_state: tauri::State<'_, McpState>,
) -> Result<McpStatusEntry, AppError> {
    mcp_state.restart_server(&id).map_err(|e| AppError::Message(e))
}

#[tauri::command]
pub async fn mcp_start_oauth(
    id: String,
    mcp_state: tauri::State<'_, McpState>,
) -> Result<(), AppError> {
    mcp_state
        .start_server_oauth(&id)
        .await
        .map_err(|e| AppError::Message(e))
}

#[tauri::command]
pub async fn mcp_complete_oauth(
    callback_url: String,
    mcp_state: tauri::State<'_, McpState>,
) -> Result<String, AppError> {
    let server_id = crate::mcp::handle_oauth_callback(&callback_url)
        .await
        .map_err(|e| AppError::Message(e))?;
    let _ = mcp_state.restart_server(&server_id);
    Ok(server_id)
}

#[tauri::command]
pub fn call_mcp_tool(
    qualified_name: String,
    arguments: Value,
    mcp_state: tauri::State<'_, McpState>,
) -> Result<String, AppError> {
    let args_json = serde_json::to_string(&arguments).unwrap_or_else(|_| "{}".to_string());
    mcp_state
        .call_tool(&qualified_name, &args_json)
        .map_err(|e| AppError::Message(e))
}
