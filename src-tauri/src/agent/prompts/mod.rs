pub const SYSTEM_MD: &str = include_str!("SYSTEM.MD");
pub const PLAN_MD: &str = include_str!("PLAN.MD");
pub const REVIEW_MD: &str = include_str!("REVIEW.MD");
pub const COMMIT_MD: &str = include_str!("COMMIT.MD");
pub const PR_SUMMARY_MD: &str = include_str!("PR_SUMMARY.MD");
pub const ISSUE_SUMMARY_MD: &str = include_str!("ISSUE_SUMMARY.MD");
pub const CI_EXPLAIN_MD: &str = include_str!("CI_EXPLAIN.MD");
pub const RELEASE_SUMMARY_MD: &str = include_str!("RELEASE_SUMMARY.MD");
pub const EXPLAIN_GIT_MD: &str = include_str!("EXPLAIN_GIT.MD");
pub const DESIGN_MD: &str = include_str!("DESIGN.md");

pub const FAMILY_ANTHROPIC_MD: &str = include_str!("FAMILY_ANTHROPIC.MD");
pub const FAMILY_OPENAI_MD: &str = include_str!("FAMILY_OPENAI.MD");
pub const FAMILY_DEEPSEEK_MD: &str = include_str!("FAMILY_DEEPSEEK.MD");
pub const FAMILY_GOOGLE_MD: &str = include_str!("FAMILY_GOOGLE.MD");
pub const FAMILY_XAI_MD: &str = include_str!("FAMILY_XAI.MD");
pub const FAMILY_DEFAULT_MD: &str = include_str!("FAMILY_DEFAULT.MD");

use crate::agent::model_router::ModelFamily;

/// Per-family harness overlay (Cursor-style model-specific instructions).
pub fn family_prompt(family: ModelFamily) -> &'static str {
    match family {
        ModelFamily::Anthropic => FAMILY_ANTHROPIC_MD,
        ModelFamily::OpenAi => FAMILY_OPENAI_MD,
        ModelFamily::DeepSeek => FAMILY_DEEPSEEK_MD,
        ModelFamily::Google => FAMILY_GOOGLE_MD,
        ModelFamily::XAi => FAMILY_XAI_MD,
        ModelFamily::Other => FAMILY_DEFAULT_MD,
    }
}
