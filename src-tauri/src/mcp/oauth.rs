use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use super::credentials::{load_token, save_token};

pub const MCP_OAUTH_REDIRECT: &str = "shape://mcp/oauth/callback";

/// Refresh when fewer than this many seconds remain before expiry.
const REFRESH_SKEW_SECS: i64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredMcpTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
    #[serde(default)]
    pub token_url: Option<String>,
    #[serde(default)]
    pub client_id: Option<String>,
}

#[derive(Debug, Clone)]
struct PendingOAuth {
    server_id: String,
    code_verifier: String,
    state: String,
    token_url: String,
    client_id: String,
}

static PENDING: LazyLock<Mutex<HashMap<String, PendingOAuth>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn get_token(server_id: &str) -> Option<StoredMcpTokens> {
    load_token(server_id)
}

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        digest,
    )
}

fn random_urlsafe(len: usize) -> String {
    // UUID bytes give enough entropy for PKCE verifier / state without a new crate.
    let mut out = String::with_capacity(len);
    while out.len() < len {
        let u = uuid::Uuid::new_v4();
        for b in u.as_bytes() {
            const CHARSET: &[u8] =
                b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
            out.push(CHARSET[(*b as usize) % CHARSET.len()] as char);
            if out.len() >= len {
                break;
            }
        }
    }
    out
}

fn token_from_response(
    token_resp: &serde_json::Value,
    token_url: &str,
    client_id: &str,
    previous_refresh: Option<String>,
) -> Result<StoredMcpTokens, String> {
    let access_token = token_resp
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("No access_token in response")?
        .to_string();
    let refresh_token = token_resp
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or(previous_refresh);
    let expires_at = token_resp
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .map(|secs| now_epoch() + secs);

    Ok(StoredMcpTokens {
        access_token,
        refresh_token,
        expires_at,
        token_url: Some(token_url.to_string()),
        client_id: Some(client_id.to_string()),
    })
}

/// Return a usable access token, refreshing when near expiry.
pub async fn ensure_fresh_token(server_id: &str) -> Result<StoredMcpTokens, String> {
    let tokens = get_token(server_id).ok_or_else(|| {
        "Authentication required. Connect this MCP server in Settings → AI → MCP.".to_string()
    })?;

    if let Some(expires_at) = tokens.expires_at {
        if expires_at - now_epoch() > REFRESH_SKEW_SECS {
            return Ok(tokens);
        }
        if tokens.refresh_token.is_some() {
            return refresh_access_token(server_id).await;
        }
    }

    Ok(tokens)
}

pub async fn refresh_access_token(server_id: &str) -> Result<StoredMcpTokens, String> {
    let existing = get_token(server_id).ok_or("No stored MCP token to refresh")?;
    let refresh = existing
        .refresh_token
        .as_ref()
        .ok_or("No refresh_token — reconnect this MCP server in Settings → AI → MCP.")?;
    let token_url = existing
        .token_url
        .as_ref()
        .ok_or("Missing token endpoint for refresh — reconnect this MCP server.")?;
    let client_id = existing
        .client_id
        .clone()
        .unwrap_or_else(|| "shape-desktop".to_string());

    let client = reqwest::Client::new();
    let token_resp: serde_json::Value = client
        .post(token_url)
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh.as_str()),
            ("client_id", client_id.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Token refresh rejected: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Invalid refresh response: {}", e))?;

    if token_resp.get("error").is_some() {
        return Err(format!(
            "Token refresh error: {}",
            token_resp
                .get("error_description")
                .or_else(|| token_resp.get("error"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
        ));
    }

    let stored = token_from_response(
        &token_resp,
        token_url,
        &client_id,
        Some(refresh.clone()),
    )?;
    save_token(server_id, &stored)?;
    Ok(stored)
}

async fn try_dynamic_client_registration(
    client: &reqwest::Client,
    registration_endpoint: &str,
) -> Result<String, String> {
    let resp: serde_json::Value = client
        .post(registration_endpoint)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "client_name": "Shape",
            "redirect_uris": [MCP_OAUTH_REDIRECT],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none"
        }))
        .send()
        .await
        .map_err(|e| format!("Dynamic client registration failed: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Dynamic client registration rejected: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Invalid DCR response: {}", e))?;

    resp.get("client_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "DCR response missing client_id".to_string())
}

/// Start OAuth for a remote MCP server. Opens the system browser.
pub async fn start_oauth(server_id: &str, mcp_url: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(mcp_url)
        .header("Accept", "application/json, text/event-stream")
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "shape", "version": "1.0.0" }
            }
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to reach MCP server: {}", e))?;

    if resp.status() != reqwest::StatusCode::UNAUTHORIZED {
        return Err(
            "Server did not request authentication. It may already be public — set auth to \"none\" in mcp.json, or check the URL."
                .to_string(),
        );
    }

    let www = resp
        .headers()
        .get("www-authenticate")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let resource_metadata_url = extract_param(&www, "resource_metadata").or_else(|| {
        Some(format!(
            "{}/.well-known/oauth-protected-resource",
            mcp_url.trim_end_matches('/')
        ))
    });

    let metadata_url = resource_metadata_url.ok_or("Missing OAuth resource metadata URL")?;
    let prm: serde_json::Value = client
        .get(&metadata_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch resource metadata: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Invalid resource metadata: {}", e))?;

    let auth_servers = prm
        .get("authorization_servers")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .ok_or("No authorization server in metadata")?;

    let as_meta: serde_json::Value = client
        .get(format!(
            "{}/.well-known/oauth-authorization-server",
            auth_servers.trim_end_matches('/')
        ))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch auth server metadata: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Invalid auth server metadata: {}", e))?;

    let authorize_url = as_meta
        .get("authorization_endpoint")
        .and_then(|v| v.as_str())
        .ok_or("Missing authorization_endpoint")?;
    let token_url = as_meta
        .get("token_endpoint")
        .and_then(|v| v.as_str())
        .ok_or("Missing token_endpoint")?
        .to_string();

    let client_id = if let Some(reg) = as_meta
        .get("registration_endpoint")
        .and_then(|v| v.as_str())
    {
        match try_dynamic_client_registration(&client, reg).await {
            Ok(id) => id,
            Err(e) => {
                log::warn!("MCP DCR failed, falling back to shape-desktop: {}", e);
                "shape-desktop".to_string()
            }
        }
    } else {
        "shape-desktop".to_string()
    };

    let code_verifier = random_urlsafe(64);
    let state = random_urlsafe(32);
    let challenge = pkce_challenge(&code_verifier);

    let redirect = format!(
        "{}?server_id={}",
        MCP_OAUTH_REDIRECT,
        urlencoding::encode(server_id)
    );
    let auth_link = format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&code_challenge={}&code_challenge_method=S256&state={}&scope={}&resource={}",
        authorize_url,
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect),
        challenge,
        urlencoding::encode(&state),
        urlencoding::encode("openid offline_access"),
        urlencoding::encode(mcp_url),
    );

    {
        let mut pending = PENDING.lock().map_err(|e| e.to_string())?;
        pending.insert(
            server_id.to_string(),
            PendingOAuth {
                server_id: server_id.to_string(),
                code_verifier,
                state,
                token_url,
                client_id,
            },
        );
    }

    open::that(&auth_link).map_err(|e| format!("Failed to open browser: {}", e))?;
    Ok(())
}

pub async fn handle_oauth_callback(callback_url: &str) -> Result<String, String> {
    let parsed =
        url::Url::parse(callback_url).map_err(|e| format!("Invalid callback URL: {}", e))?;
    let code = parsed
        .query_pairs()
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.to_string())
        .ok_or("Missing authorization code in callback")?;
    let state = parsed
        .query_pairs()
        .find(|(k, _)| k == "state")
        .map(|(_, v)| v.to_string());
    let server_id = parsed
        .query_pairs()
        .find(|(k, _)| k == "server_id")
        .map(|(_, v)| v.to_string())
        .ok_or("Missing server_id for OAuth callback")?;

    let pending = {
        let mut guard = PENDING.lock().map_err(|e| e.to_string())?;
        guard
            .remove(&server_id)
            .ok_or("No pending OAuth session for this server — start Connect again.")?
    };

    if pending.server_id != server_id {
        return Err("OAuth server_id mismatch".to_string());
    }
    if let Some(ref s) = state {
        if s != &pending.state {
            return Err("OAuth state mismatch — possible CSRF. Start Connect again.".to_string());
        }
    }

    let redirect = format!(
        "{}?server_id={}",
        MCP_OAUTH_REDIRECT,
        urlencoding::encode(&server_id)
    );

    let client = reqwest::Client::new();
    let token_resp: serde_json::Value = client
        .post(&pending.token_url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", &code),
            ("redirect_uri", &redirect),
            ("client_id", &pending.client_id),
            ("code_verifier", &pending.code_verifier),
        ])
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Invalid token response: {}", e))?;

    if token_resp.get("error").is_some() {
        return Err(format!(
            "Token exchange error: {}",
            token_resp
                .get("error_description")
                .or_else(|| token_resp.get("error"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
        ));
    }

    let stored = token_from_response(
        &token_resp,
        &pending.token_url,
        &pending.client_id,
        None,
    )?;
    save_token(&server_id, &stored)?;

    Ok(server_id)
}

fn extract_param(www_auth: &str, key: &str) -> Option<String> {
    let needle = format!("{}=\"", key);
    let start = www_auth.find(&needle)? + needle.len();
    let rest = &www_auth[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}
