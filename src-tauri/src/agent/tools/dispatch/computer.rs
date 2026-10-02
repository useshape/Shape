//! Typed decisions and a done-check for the agent.

use serde_json::{json, Value};

use super::common::{error_outcome, get_str};
use super::{ToolCtx, ToolOutcome};

pub(super) async fn tool_decide(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let state = match get_str(args, "state") {
        Ok(s) => s,
        Err(e) => return error_outcome("decide", &e),
    };
    let prompt = match get_str(args, "prompt") {
        Ok(s) => s,
        Err(e) => return error_outcome("decide", &e),
    };
    let options = args
        .get("options")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if options.len() < 2 {
        return error_outcome("decide", "options needs at least two choices.");
    }
    match crate::agent::tools::plugins::plugin_request(
        "POST",
        "/api/agent/decide",
        ctx.api_key,
        Some(json!({ "state": state, "prompt": prompt, "options": options })),
        ctx.turn_id.as_deref(),
        ctx.conversation_id.as_deref(),
    )
    .await
    {
        Ok(data) => {
            let text = serde_json::to_string_pretty(&data).unwrap_or_else(|_| data.to_string());
            ToolOutcome {
                tool_result: text,
                ui_chunk: String::new(),
                side_effect: None,
            }
        }
        Err(e) => error_outcome("decide", &e),
    }
}

fn evidence_ok(claim: &str, evidence: &str) -> Result<(), String> {
    let claim = claim.trim();
    let evidence = evidence.trim();
    if claim.len() < 8 {
        return Err("Say what you claim is done.".into());
    }
    if evidence.len() < 24 {
        return Err("Evidence is too short. Paste a tool result, diff, or test output.".into());
    }
    let bare = evidence
        .trim_matches(|c: char| c.is_ascii_punctuation() || c.is_whitespace())
        .to_ascii_lowercase();
    if matches!(bare.as_str(), "done" | "completed" | "success" | "it works" | "fixed") {
        return Err("That is a label, not evidence.".into());
    }
    Ok(())
}

pub(super) async fn tool_check_done(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let claim = match get_str(args, "claim") {
        Ok(s) => s,
        Err(e) => return error_outcome("check_done", &e),
    };
    let evidence = match get_str(args, "evidence") {
        Ok(s) => s,
        Err(e) => return error_outcome("check_done", &e),
    };
    if let Err(e) = evidence_ok(&claim, &evidence) {
        return ToolOutcome {
            tool_result: format!("FAIL. {e}"),
            ui_chunk: format!("\n<insight_card title=\"Checked\">FAIL. {e}</insight_card>\n"),
            side_effect: None,
        };
    }
    let gate = crate::agent::tools::plugins::fetch_gate(
        ctx.api_key,
        json!({
            "kind": "check_done",
            "claim": claim,
            "evidence": evidence,
        }),
        ctx.turn_id.as_deref(),
        ctx.conversation_id.as_deref(),
    )
    .await;
    if crate::agent::tools::plugins::gate_action(&gate) == "fail" {
        let reason = gate
            .get("reason")
            .and_then(|v| v.as_str())
            .unwrap_or("Evidence does not support the claim.");
        return ToolOutcome {
            tool_result: format!("FAIL. {reason}"),
            ui_chunk: format!("\n<insight_card title=\"Checked\">FAIL. {reason}</insight_card>\n"),
            side_effect: None,
        };
    }
    ToolOutcome {
        tool_result: "PASS. The evidence is concrete. You may tell the user, and mention what you checked.".into(),
        ui_chunk: "\n<insight_card title=\"Checked\">PASS</insight_card>\n".into(),
        side_effect: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_done_rejects_empty_evidence() {
        assert!(evidence_ok("the button submits", "done").is_err());
        assert!(evidence_ok("the button submits", "npm test\n1 passed, 0 failed").is_ok());
    }
}
