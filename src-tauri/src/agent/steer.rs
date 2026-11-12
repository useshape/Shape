//! Optional Jev pack fill for turns the kernel is not sure about.
//!
//! Confident turns stay on the local kernel (microseconds). A Jev round trip is
//! ~100–200ms and ~600 tokens, which is cheaper than a mistaken `load_tools`
//! replay on the main model, but slower than doing nothing. Call it only when
//! `TurnDecision.confident` is false. Fail closed: a timeout, HTTP error, or
//! `source: fallback` leaves the kernel packs unchanged (writes still stripped).
//! Jev cannot grant workspace/terminal on Ask/Plan.

use serde_json::{json, Value};
use std::time::Duration;

use super::decide::{Capability, Locks, Packs};

const STEER_TIMEOUT_MS: u64 = 800;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SteerReply {
    pub packs: Packs,
    pub source: String,
    pub hint: String,
}

pub fn is_trusted_source(source: &str) -> bool {
    matches!(source, "jev" | "plugins")
}

pub fn parse_steer_body(value: &Value) -> Option<SteerReply> {
    if !value.is_object() {
        return None;
    }
    let source = value
        .get("source")
        .and_then(|s| s.as_str())
        .unwrap_or("fallback");
    if !is_trusted_source(source) {
        return None;
    }
    Some(SteerReply {
        packs: Packs {
            workspace: flag(value, "workspace"),
            plugins: flag(value, "plugins"),
            browse: flag(value, "browse"),
            web: flag(value, "web"),
            git: flag(value, "git"),
            terminal: flag(value, "terminal"),
            media: flag(value, "media"),
            reverse: flag(value, "reverse"),
        },
        source: source.to_string(),
        hint: value
            .get("hint")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

fn flag(value: &Value, key: &str) -> bool {
    value.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

/// Merge a trusted Jev/plugin reply into an unconfident kernel decision.
/// Untrusted or missing replies keep the small list (no writes).
pub fn apply_unconfident(
    mut packs: Packs,
    capability: Capability,
    locks: Locks,
    reply: Option<&SteerReply>,
) -> Packs {
    if let Some(reply) = reply.filter(|r| is_trusted_source(&r.source)) {
        packs = packs.union(reply.packs);
        if capability.is_read_only() {
            packs.workspace = false;
            packs.terminal = false;
        }
        return packs.clamp(locks.browse_enabled, locks.shell_enabled);
    }
    packs.workspace = false;
    packs.terminal = false;
    packs.clamp(locks.browse_enabled, locks.shell_enabled)
}

pub async fn fetch(
    access_token: &str,
    message: &str,
    mode: &str,
    turn_id: Option<&str>,
    conversation_id: Option<&str>,
) -> Option<SteerReply> {
    if access_token.trim().is_empty() || message.trim().is_empty() {
        return None;
    }
    let base = crate::core::website_url::shape_website_base();
    let url = format!("{}/api/agent/steer", base.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(STEER_TIMEOUT_MS))
        .build()
        .ok()?;
    let mut req = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&json!({ "message": message, "mode": mode }));
    if let Some(turn_id) = turn_id.filter(|s| !s.is_empty()) {
        req = req.header("X-Shape-Turn-Id", turn_id);
    }
    if let Some(conversation_id) = conversation_id.filter(|s| !s.is_empty()) {
        req = req.header("X-Shape-Conversation-Id", conversation_id);
    }
    let resp = req.send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let body = resp.json::<Value>().await.ok()?;
    parse_steer_body(&body)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_on_json() -> Value {
        json!({
            "workspace": true, "plugins": true, "browse": true, "web": true,
            "git": true, "terminal": true, "media": true, "hint": ""
        })
    }

    #[test]
    fn fail_open_catalog_without_source_is_ignored() {
        assert!(parse_steer_body(&all_on_json()).is_none());
        assert!(parse_steer_body(&json!({"source": "fallback", "workspace": true})).is_none());
    }

    #[test]
    fn trusted_noul_picks_are_kept() {
        let reply = parse_steer_body(&json!({
            "source": "jev",
            "workspace": true,
            "terminal": true,
            "web": false,
            "hint": "workspace, terminal"
        }))
        .expect("jev");
        assert!(reply.packs.workspace);
        assert!(reply.packs.terminal);
        assert!(!reply.packs.web);
    }

    #[test]
    fn unconfident_code_can_gain_workspace_from_jev() {
        let kernel = Packs::default();
        let reply = SteerReply {
            packs: Packs {
                workspace: true,
                ..Packs::default()
            },
            source: "jev".into(),
            hint: String::new(),
        };
        let out = apply_unconfident(kernel, Capability::Code, Locks::default(), Some(&reply));
        assert!(out.workspace);
        assert!(!out.terminal);
    }

    #[test]
    fn jev_cannot_grant_writes_on_ask() {
        let reply = SteerReply {
            packs: Packs {
                workspace: true,
                terminal: true,
                web: true,
                ..Packs::default()
            },
            source: "jev".into(),
            hint: String::new(),
        };
        let out = apply_unconfident(Packs::default(), Capability::Ask, Locks::default(), Some(&reply));
        assert!(!out.workspace);
        assert!(!out.terminal);
        assert!(out.web);
    }

    #[test]
    fn missing_jev_keeps_unconfident_code_small() {
        let mut kernel = Packs::default();
        kernel.web = true;
        let out = apply_unconfident(kernel, Capability::Code, Locks::default(), None);
        assert!(!out.workspace);
        assert!(!out.terminal);
        assert!(out.web);
    }
}
