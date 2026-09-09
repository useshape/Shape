use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::time::timeout;

use super::credentials::{load_token, save_token};

/// RFC 8252 loopback redirect — professional desktop MCP clients use this,
/// not custom URL schemes (which often never return after browser approve).
pub fn loopback_redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{port}/callback")
}

/// Client ID Metadata Document (CIMD) — industry approach for native MCP clients
/// when the AS does not offer DCR or DCR is unavailable.
const SHAPE_CIMD_CLIENT_ID: &str = "https://www.useshape.org/oauth/mcp-client.json";

const REFRESH_SKEW_SECS: i64 = 60;
const MAX_SCOPE_CHARS: usize = 400;
const OAUTH_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredMcpTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
    #[serde(default)]
    pub token_url: Option<String>,
    #[serde(default)]
    pub client_id: Option<String>,
    #[serde(default)]
    pub client_secret: Option<String>,
    #[serde(default)]
    pub resource: Option<String>,
}

#[derive(Debug, Clone)]
struct PendingOAuth {
    code_verifier: String,
    state: String,
    token_url: String,
    client_id: String,
    client_secret: Option<String>,
    resource: String,
    redirect_uri: String,
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

fn origin_of(url: &str) -> Option<String> {
    let parsed = url::Url::parse(url).ok()?;
    let host = parsed.host_str()?;
    Some(match parsed.port() {
        Some(p) => format!("{}://{}:{}", parsed.scheme(), host, p),
        None => format!("{}://{}", parsed.scheme(), host),
    })
}

fn token_from_response(
    token_resp: &serde_json::Value,
    token_url: &str,
    client_id: &str,
    client_secret: Option<&str>,
    resource: Option<&str>,
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
        client_secret: client_secret.map(|s| s.to_string()),
        resource: resource.map(|s| s.to_string()),
    })
}

pub async fn ensure_fresh_token(server_id: &str) -> Result<StoredMcpTokens, String> {
    let tokens = get_token(server_id).ok_or_else(|| {
        "Authentication required. Connect this MCP server in Settings → Integrations.".to_string()
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
        .ok_or("No refresh_token — reconnect this MCP server.")?;
    let token_url = existing
        .token_url
        .as_ref()
        .ok_or("Missing token endpoint for refresh — reconnect this MCP server.")?;
    let client_id = existing
        .client_id
        .clone()
        .unwrap_or_else(|| "shape-desktop".to_string());

    let mut form: Vec<(&str, &str)> = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh.as_str()),
        ("client_id", client_id.as_str()),
    ];
    if let Some(secret) = existing.client_secret.as_deref() {
        form.push(("client_secret", secret));
    }
    if let Some(resource) = existing.resource.as_deref() {
        form.push(("resource", resource));
    }

    let client = reqwest::Client::new();
    let token_resp: serde_json::Value = client
        .post(token_url)
        .form(&form)
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
        existing.client_secret.as_deref(),
        existing.resource.as_deref(),
        Some(refresh.clone()),
    )?;
    save_token(server_id, &stored)?;
    Ok(stored)
}

fn preferred_token_auth_method(as_meta: &serde_json::Value) -> &'static str {
    let methods: Vec<&str> = as_meta
        .get("token_endpoint_auth_methods_supported")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str()).collect())
        .unwrap_or_default();
    if methods.is_empty() || methods.iter().any(|m| *m == "none") {
        "none"
    } else if methods.iter().any(|m| *m == "client_secret_post") {
        "client_secret_post"
    } else {
        "none"
    }
}

async fn try_dynamic_client_registration(
    client: &reqwest::Client,
    registration_endpoint: &str,
    auth_method: &str,
    redirect_uri: &str,
) -> Result<(String, Option<String>), String> {
    let redirect_localhost = redirect_uri.replace("127.0.0.1", "localhost");
    let resp: serde_json::Value = client
        .post(registration_endpoint)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "client_name": "Shape",
            // Register both loopback forms — IdPs disagree on localhost vs 127.0.0.1.
            "redirect_uris": [redirect_uri, redirect_localhost],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": auth_method,
            "application_type": "native"
        }))
        .send()
        .await
        .map_err(|e| format!("Dynamic client registration failed: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Dynamic client registration rejected: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Invalid DCR response: {}", e))?;

    let client_id = resp
        .get("client_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "DCR response missing client_id".to_string())?
        .to_string();
    let client_secret = resp
        .get("client_secret")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    Ok((client_id, client_secret))
}

fn registration_endpoint(as_meta: &serde_json::Value) -> Option<String> {
    as_meta
        .get("registration_endpoint")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn as_advertises_cimd(as_meta: &serde_json::Value) -> bool {
    as_meta
        .get("client_id_metadata_document_supported")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Pick OAuth client credentials.
/// Prefer DCR whenever the AS offers it — it binds the exact loopback port.
/// CIMD is only used when there is no registration endpoint (and must be live HTTPS).
fn resolve_oauth_client(
    static_client_id: &str,
    as_meta: &serde_json::Value,
) -> ResolveClientStrategy {
    if !static_client_id.is_empty() {
        return ResolveClientStrategy::Static(static_client_id.to_string());
    }
    if let Some(reg) = registration_endpoint(as_meta) {
        return ResolveClientStrategy::Dcr(reg);
    }
    if as_advertises_cimd(as_meta) {
        return ResolveClientStrategy::Cimd;
    }
    // Some ASs omit both; try CIMD last so we never invent a fake client_id.
    ResolveClientStrategy::Cimd
}

enum ResolveClientStrategy {
    Static(String),
    Cimd,
    Dcr(String),
}

pub fn scopes_from_meta(prm: &serde_json::Value, as_meta: &serde_json::Value) -> String {
    let raw = prm
        .get("scopes_supported")
        .or_else(|| as_meta.get("scopes_supported"))
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|s| s.as_str())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "openid offline_access".to_string());

    if raw.len() <= MAX_SCOPE_CHARS {
        return raw;
    }
    let preferred = ["openid", "offline_access", "read", "write", "mcp:connect", "default"];
    let available: Vec<&str> = raw.split_whitespace().collect();
    let mut picked: Vec<&str> = preferred
        .iter()
        .copied()
        .filter(|p| available.iter().any(|a| a == p))
        .collect();
    if picked.is_empty() {
        for s in &available {
            if picked.join(" ").len() + s.len() + 1 > MAX_SCOPE_CHARS {
                break;
            }
            picked.push(s);
        }
    }
    if picked.is_empty() {
        available.first().copied().unwrap_or("openid").to_string()
    } else {
        picked.join(" ")
    }
}

fn as_metadata_urls(auth_server: &str) -> Vec<String> {
    let base = auth_server.trim_end_matches('/');
    let mut urls = vec![
        format!("{}/.well-known/oauth-authorization-server", base),
        format!("{}/.well-known/openid-configuration", base),
    ];
    if let Ok(parsed) = url::Url::parse(base) {
        let path = parsed.path().trim_matches('/');
        if !path.is_empty() {
            if let Some(origin) = origin_of(base) {
                urls.insert(
                    0,
                    format!("{}/.well-known/oauth-authorization-server/{}", origin, path),
                );
                urls.insert(
                    1,
                    format!("{}/.well-known/openid-configuration/{}", origin, path),
                );
            }
        }
    }
    urls
}

pub fn extract_param(www_auth: &str, key: &str) -> Option<String> {
    let quoted = format!("{}=\"", key);
    if let Some(start) = www_auth.find(&quoted) {
        let rest = &www_auth[start + quoted.len()..];
        let end = rest.find('"')?;
        return Some(rest[..end].to_string());
    }
    let bare = format!("{}=", key);
    let start = www_auth.find(&bare)? + bare.len();
    let rest = www_auth[start..].trim_start();
    let end = rest
        .find(|c: char| c.is_whitespace() || c == ',')
        .unwrap_or(rest.len());
    let value = rest[..end].trim().trim_matches('"');
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

pub fn prm_candidate_urls(mcp_url: &str, www: &str) -> Vec<String> {
    let mut prm_candidates: Vec<String> = Vec::new();
    if let Some(url) = extract_param(www, "resource_metadata") {
        prm_candidates.push(url);
    }
    if let Ok(parsed) = url::Url::parse(mcp_url) {
        if let Some(origin) = origin_of(mcp_url) {
            let path = parsed.path().trim_end_matches('/');
            if !path.is_empty() {
                prm_candidates.push(format!(
                    "{}/.well-known/oauth-protected-resource{}",
                    origin, path
                ));
            }
            prm_candidates.push(format!("{}/.well-known/oauth-protected-resource", origin));
        }
    }
    prm_candidates
}

async fn fetch_json_ok(client: &reqwest::Client, url: &str) -> Option<serde_json::Value> {
    let resp = client.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json().await.ok()
}

/// Bind an ephemeral loopback port and wait for the browser redirect.
async fn wait_loopback_callback(listener: TcpListener) -> Result<String, String> {
    let (mut socket, _) = timeout(OAUTH_TIMEOUT, listener.accept())
        .await
        .map_err(|_| "OAuth timed out — approve in the browser, then try Connect again.".to_string())?
        .map_err(|e| format!("OAuth callback accept failed: {e}"))?;

    let mut buf = vec![0u8; 16_384];
    let n = timeout(Duration::from_secs(10), socket.read(&mut buf))
        .await
        .map_err(|_| "OAuth callback read timed out".to_string())?
        .map_err(|e| format!("OAuth callback read failed: {e}"))?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let first_line = req.lines().next().unwrap_or("");
    // GET /callback?code=...&state=... HTTP/1.1
    let path = first_line
        .split_whitespace()
        .nth(1)
        .ok_or("Malformed OAuth callback request")?;
    let callback_url = format!("http://127.0.0.1{path}");

    let body = r#"<!doctype html><html><head><meta charset="utf-8"><title>Shape</title>
<style>body{font-family:system-ui,sans-serif;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
main{text-align:center}h1{font-size:18px;font-weight:600}p{color:#888;font-size:13px}</style></head>
<body><main><h1>Connected</h1><p>You can close this tab and return to Shape.</p></main></body></html>"#;
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = socket.write_all(resp.as_bytes()).await;
    let _ = socket.shutdown().await;

    Ok(callback_url)
}

/// Start OAuth, wait for loopback approve, exchange tokens. Returns server_id.
pub async fn start_oauth(
    server_id: &str,
    mcp_url: &str,
    static_client_id: Option<&str>,
) -> Result<String, String> {
    let static_client_id = static_client_id.unwrap_or("").to_string();
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind OAuth callback port: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to read OAuth callback port: {e}"))?
        .port();
    let redirect_uri = loopback_redirect_uri(port);

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

    let status = resp.status();
    let www = resp
        .headers()
        .get("www-authenticate")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(
            "MCP endpoint returned 404. For GitHub, remote OAuth is limited to Copilot hosts — connect with a personal access token instead."
                .to_string(),
        );
    }

    let prm_candidates = prm_candidate_urls(mcp_url, &www);
    let mut prm: Option<serde_json::Value> = None;
    for candidate in &prm_candidates {
        if let Some(meta) = fetch_json_ok(&client, candidate).await {
            if meta.get("authorization_servers").is_some() {
                prm = Some(meta);
                break;
            }
        }
    }

    let prm = match prm {
        Some(p) => p,
        None => {
            if status == reqwest::StatusCode::UNAUTHORIZED || !www.is_empty() {
                return Err("Could not discover OAuth metadata for this server.".to_string());
            }
            return Err("PUBLIC_NO_AUTH: Server did not request authentication.".to_string());
        }
    };

    let auth_servers = prm
        .get("authorization_servers")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .ok_or("No authorization server in metadata")?;

    let mut as_meta: Option<serde_json::Value> = None;
    for well_known in as_metadata_urls(auth_servers) {
        if let Some(meta) = fetch_json_ok(&client, &well_known).await {
            if meta.get("authorization_endpoint").is_some() {
                as_meta = Some(meta);
                break;
            }
        }
    }
    let as_meta = as_meta.ok_or("Could not fetch auth server metadata.")?;

    let authorize_url = as_meta
        .get("authorization_endpoint")
        .and_then(|v| v.as_str())
        .ok_or("Missing authorization_endpoint")?;
    let token_url = as_meta
        .get("token_endpoint")
        .and_then(|v| v.as_str())
        .ok_or("Missing token_endpoint")?
        .to_string();

    let auth_method = preferred_token_auth_method(&as_meta);

    let (client_id, client_secret) = match resolve_oauth_client(&static_client_id, &as_meta) {
        ResolveClientStrategy::Static(id) => (id, None),
        ResolveClientStrategy::Cimd => {
            // Hosted CIMD must be reachable — a 404 client_id makes browsers
            // "sign in" then never redirect back to our loopback port.
            if fetch_json_ok(&client, SHAPE_CIMD_CLIENT_ID).await.is_none() {
                return Err(
                    "OAuth client metadata is not published yet (CIMD 404). This server requires Dynamic Client Registration."
                        .to_string(),
                );
            }
            (SHAPE_CIMD_CLIENT_ID.to_string(), None)
        }
        ResolveClientStrategy::Dcr(reg) => {
            try_dynamic_client_registration(&client, &reg, auth_method, &redirect_uri).await?
        }
    };

    let scope = scopes_from_meta(&prm, &as_meta);
    let code_verifier = random_urlsafe(64);
    let nonce = random_urlsafe(24);
    let state = format!("{}:{}", server_id, nonce);
    let challenge = pkce_challenge(&code_verifier);

    let resource = prm
        .get("resource")
        .and_then(|v| v.as_str())
        .unwrap_or(mcp_url)
        .to_string();

    let auth_link = format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&code_challenge={}&code_challenge_method=S256&state={}&scope={}&resource={}",
        authorize_url,
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        challenge,
        urlencoding::encode(&state),
        urlencoding::encode(&scope),
        urlencoding::encode(&resource),
    );

    {
        let mut pending = PENDING.lock().map_err(|e| e.to_string())?;
        pending.insert(
            server_id.to_string(),
            PendingOAuth {
                code_verifier,
                state,
                token_url,
                client_id,
                client_secret,
                resource,
                redirect_uri: redirect_uri.clone(),
            },
        );
    }

    open::that(&auth_link).map_err(|e| format!("Failed to open browser: {}", e))?;

    let callback_url = wait_loopback_callback(listener).await?;
    handle_oauth_callback(&callback_url).await
}

pub async fn handle_oauth_callback(callback_url: &str) -> Result<String, String> {
    let parsed =
        url::Url::parse(callback_url).map_err(|e| format!("Invalid callback URL: {}", e))?;
    if let Some((_, err)) = parsed.query_pairs().find(|(k, _)| k == "error") {
        let desc = parsed
            .query_pairs()
            .find(|(k, _)| k == "error_description")
            .map(|(_, v)| v.to_string())
            .unwrap_or_else(|| err.to_string());
        return Err(format!("OAuth denied: {desc}"));
    }
    let code = parsed
        .query_pairs()
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.to_string())
        .ok_or("Missing authorization code in callback")?;
    let state = parsed
        .query_pairs()
        .find(|(k, _)| k == "state")
        .map(|(_, v)| v.to_string())
        .ok_or("Missing OAuth state in callback")?;

    let server_id = state
        .split_once(':')
        .map(|(id, _)| id.to_string())
        .ok_or("Missing server_id in OAuth state")?;

    let pending = {
        let mut guard = PENDING.lock().map_err(|e| e.to_string())?;
        match guard.remove(&server_id) {
            Some(p) => p,
            None => {
                if get_token(&server_id).is_some() {
                    return Ok(server_id);
                }
                return Err("No pending OAuth session — start Connect again.".to_string());
            }
        }
    };

    if state != pending.state {
        return Err("OAuth state mismatch — start Connect again.".to_string());
    }

    let client = reqwest::Client::new();
    let token_resp = match exchange_code(&client, &pending, &code, true).await {
        Ok(v) if v.get("error").is_none() => v,
        _ => exchange_code(&client, &pending, &code, false).await?,
    };

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
        pending.client_secret.as_deref(),
        Some(pending.resource.as_str()),
        None,
    )?;
    save_token(&server_id, &stored)?;
    Ok(server_id)
}

async fn exchange_code(
    client: &reqwest::Client,
    pending: &PendingOAuth,
    code: &str,
    include_resource: bool,
) -> Result<serde_json::Value, String> {
    let mut form: Vec<(&str, &str)> = vec![
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", pending.redirect_uri.as_str()),
        ("client_id", pending.client_id.as_str()),
        ("code_verifier", pending.code_verifier.as_str()),
    ];
    if let Some(secret) = pending.client_secret.as_deref() {
        form.push(("client_secret", secret));
    }
    if include_resource {
        form.push(("resource", pending.resource.as_str()));
    }

    client
        .post(&pending.token_url)
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Token exchange rejected: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Invalid token response: {}", e))
}
