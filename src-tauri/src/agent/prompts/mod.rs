pub const SYSTEM_MD: &str = include_str!("SYSTEM.MD");
#[allow(dead_code)]
pub const CHAT_MD: &str = include_str!("CHAT.MD");
pub const TALK_MD: &str = include_str!("TALK.MD");
pub const TALK_VOICE_MD: &str = include_str!("TALK_VOICE.MD");
pub const PLAN_MD: &str = include_str!("PLAN.MD");
#[allow(dead_code)]
pub const REVIEW_MD: &str = include_str!("REVIEW.MD");
pub const COMMIT_MD: &str = include_str!("COMMIT.MD");
pub const PR_SUMMARY_MD: &str = include_str!("PR_SUMMARY.MD");
pub const PR_WALKTHROUGH_MD: &str = include_str!("PR_WALKTHROUGH.MD");
pub const PR_REVIEW_MD: &str = include_str!("PR_REVIEW.MD");
pub const PR_DRAFT_MD: &str = include_str!("PR_DRAFT.MD");
pub const ISSUE_SUMMARY_MD: &str = include_str!("ISSUE_SUMMARY.MD");
pub const CI_EXPLAIN_MD: &str = include_str!("CI_EXPLAIN.MD");
pub const RELEASE_SUMMARY_MD: &str = include_str!("RELEASE_SUMMARY.MD");
pub const EXPLAIN_GIT_MD: &str = include_str!("EXPLAIN_GIT.MD");
#[allow(dead_code)]
pub const DESIGN_MD: &str = include_str!("DESIGN.md");

pub const FAMILY_ANTHROPIC_MD: &str = include_str!("FAMILY_ANTHROPIC.MD");
pub const FAMILY_OPENAI_MD: &str = include_str!("FAMILY_OPENAI.MD");
pub const FAMILY_DEEPSEEK_MD: &str = include_str!("FAMILY_DEEPSEEK.MD");
pub const FAMILY_GOOGLE_MD: &str = include_str!("FAMILY_GOOGLE.MD");
pub const FAMILY_XAI_MD: &str = include_str!("FAMILY_XAI.MD");
pub const FAMILY_ZAI_MD: &str = include_str!("FAMILY_ZAI.MD");
pub const FAMILY_QWEN_MD: &str = include_str!("FAMILY_QWEN.MD");
pub const FAMILY_DEFAULT_MD: &str = include_str!("FAMILY_DEFAULT.MD");
pub const SUBAGENT_MD: &str = include_str!("SUBAGENT.MD");
pub const SKILL_TERMINAL: &str = include_str!("skills/terminal.md");
pub const SKILL_GIT: &str = include_str!("skills/git.md");
pub const SKILL_EDITS: &str = include_str!("skills/edits.md");
pub const SKILL_BROWSE: &str = include_str!("skills/browse.md");
pub const SKILL_PLAN: &str = include_str!("skills/plan.md");
pub const SKILL_REVIEW: &str = include_str!("skills/review.md");

/// Built-in procedure text. Unknown names return nothing so a model cannot
/// load an arbitrary file through `load_skill`.
pub fn skill_body(name: &str) -> Option<&'static str> {
    match name.trim().to_ascii_lowercase().as_str() {
        "terminal" => Some(SKILL_TERMINAL),
        "git" => Some(SKILL_GIT),
        "edits" => Some(SKILL_EDITS),
        "browse" => Some(SKILL_BROWSE),
        "plan" => Some(SKILL_PLAN),
        "review" => Some(SKILL_REVIEW),
        _ => None,
    }
}

use crate::agent::model_router::ModelFamily;

/// Per-family harness overlay (Cursor-style model-specific instructions).
pub fn family_prompt(family: ModelFamily) -> &'static str {
    match family {
        ModelFamily::Anthropic => FAMILY_ANTHROPIC_MD,
        ModelFamily::OpenAi => FAMILY_OPENAI_MD,
        ModelFamily::DeepSeek => FAMILY_DEEPSEEK_MD,
        ModelFamily::Google => FAMILY_GOOGLE_MD,
        ModelFamily::XAi => FAMILY_XAI_MD,
        ModelFamily::ZAi => FAMILY_ZAI_MD,
        ModelFamily::Qwen => FAMILY_QWEN_MD,
        ModelFamily::Other => FAMILY_DEFAULT_MD,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plan_md_stops_after_save() {
        assert!(PLAN_MD.contains("Do not say the user wants you to continue"));
        assert!(PLAN_MD.contains("Wait until they click **Build**"));
        assert!(SKILL_PLAN.contains("save_plan"));
        assert!(skill_body("plan").is_some());
        assert!(skill_body("../SYSTEM.MD").is_none());
    }

    #[test]
    fn system_md_forbids_weakening_tests() {
        assert!(SYSTEM_MD.contains("Never delete, skip, ignore, or weaken tests"));
        assert!(SYSTEM_MD.contains("Do not create a git branch unprompted"));
        assert!(SYSTEM_MD.contains("Never `Stop-Process -Name node`"));
    }
}
