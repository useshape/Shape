//! Shape Cloud build attestation for official / maintainer builds.
//!
//! The HMAC secret is never committed. It is either:
//! - injected at compile time via `SHAPE_CLOUD_BUILD_SECRET` (release CI), or
//! - read at runtime from the same env var (`tauri dev` for maintainers).

use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// Resolve the build secret: runtime env wins (maintainer override), then compile-time embed.
pub fn build_secret() -> Option<String> {
    if let Ok(s) = std::env::var("SHAPE_CLOUD_BUILD_SECRET") {
        let trimmed = s.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    match option_env!("SHAPE_CLOUD_BUILD_SECRET") {
        Some(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
        _ => None,
    }
}

pub fn client_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// `timestamp.nonce.hmac_hex` over `version|timestamp|nonce|deviceId`
pub fn build_attestation_header(device_id: &str) -> Option<String> {
    let secret = build_secret()?;
    let version = client_version();
    let timestamp = chrono_like_unix_secs();
    let nonce = uuid::Uuid::new_v4().to_string().replace('-', "");
    let payload = format!("{version}|{timestamp}|{nonce}|{device_id}");

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).ok()?;
    mac.update(payload.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());
    Some(format!("{timestamp}.{nonce}.{sig}"))
}

fn chrono_like_unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attestation_roundtrip_shape() {
        // Without a secret, header is omitted (fork / unsigned build).
        if build_secret().is_none() {
            assert!(build_attestation_header("dev").is_none());
        }
    }
}
