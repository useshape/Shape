/// Model routing and family classification for the agent harness.
///
/// Policy: Shape picks the model. "Auto" is a fixed cheap/fast model — never
/// OpenRouter's server-side auto-router (`openrouter/auto`), which can land on
/// expensive flagship models.
///
/// Families drive per-model prompt overlays and tool shapes (Cursor-style harness
/// customization): OpenAI-trained models prefer apply_patch; Anthropic/DeepSeek
/// prefer SEARCH/REPLACE string edits.

/// Fast included model used for Auto and auxiliary work (titles, explore, etc.).
pub const MODEL_FAST: &str = "deepseek/deepseek-v4-flash";

/// Provider family used to select prompts and edit tools.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ModelFamily {
    Anthropic,
    OpenAi,
    DeepSeek,
    Google,
    XAi,
    Other,
}

impl ModelFamily {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::OpenAi => "openai",
            Self::DeepSeek => "deepseek",
            Self::Google => "google",
            Self::XAi => "xai",
            Self::Other => "other",
        }
    }

    /// OpenAI / Codex-style models use `apply_patch` instead of `edit_file`.
    pub fn uses_apply_patch(self) -> bool {
        matches!(self, Self::OpenAi)
    }
}

/// Resolve a user-facing model id to the OpenRouter model slug we actually call.
pub fn normalize_model(model: &str) -> String {
    match model.trim() {
        // Shape Auto = our cheap default, not OpenRouter Auto Router.
        "auto" | "openrouter/auto" => MODEL_FAST.to_string(),
        other => other.to_string(),
    }
}

/// True when the user selected Shape's Auto option (included usage), not a paid pick.
pub fn is_auto_selection(model: &str) -> bool {
    matches!(model.trim(), "auto" | "openrouter/auto")
}

/// Classify a normalized OpenRouter model slug into a harness family.
pub fn model_family(model: &str) -> ModelFamily {
    let m = model.trim().to_ascii_lowercase();
    if m.is_empty() {
        return ModelFamily::Other;
    }

    // Provider prefix (openrouter style: `anthropic/claude-…`).
    if let Some((provider, rest)) = m.split_once('/') {
        match provider {
            "anthropic" => return ModelFamily::Anthropic,
            "openai" | "openai-compatible" | "chatgpt" | "azure" | "azure-openai" => {
                return ModelFamily::OpenAi;
            }
            "deepseek" => return ModelFamily::DeepSeek,
            "google" | "google-ai" | "gemini" => return ModelFamily::Google,
            "x-ai" | "xai" => return ModelFamily::XAi,
            // Some routers nest: `openrouter/openai/gpt-…` — rare; check rest.
            _ if rest.starts_with("openai/") || rest.starts_with("gpt-") => {
                return ModelFamily::OpenAi;
            }
            _ if rest.starts_with("anthropic/") || rest.starts_with("claude") => {
                return ModelFamily::Anthropic;
            }
            _ if rest.starts_with("deepseek") => return ModelFamily::DeepSeek,
            _ if rest.starts_with("gemini") || rest.starts_with("google/") => {
                return ModelFamily::Google;
            }
            _ => {}
        }
    }

    // Bare / alias ids without a provider prefix.
    if m.starts_with("gpt-")
        || m.starts_with("chatgpt")
        || m.starts_with("o1")
        || m.starts_with("o3")
        || m.starts_with("o4")
        || m.contains("codex")
    {
        return ModelFamily::OpenAi;
    }
    if m.starts_with("claude") {
        return ModelFamily::Anthropic;
    }
    if m.starts_with("deepseek") {
        return ModelFamily::DeepSeek;
    }
    if m.starts_with("gemini") {
        return ModelFamily::Google;
    }
    if m.starts_with("grok") {
        return ModelFamily::XAi;
    }

    ModelFamily::Other
}

/// Mid-chat switch hint when the previous turn used a different family.
pub fn mid_chat_switch_hint(previous: ModelFamily, current: ModelFamily) -> Option<String> {
    if previous == current {
        return None;
    }
    let edit_note = if current.uses_apply_patch() {
        "Your edit tool is `apply_patch` (*** Begin Patch format). Ignore any prior SEARCH/REPLACE or `edit_file` calls in this chat history — those tools are not in your current tool set."
    } else {
        "Your edit tool is `edit_file` with SEARCH/REPLACE blocks. Ignore any prior `apply_patch` calls in this chat history — that tool is not in your current tool set."
    };
    Some(format!(
        "\n<model_switch>\nYou are taking over mid-chat from a {prev} family model. Only use tools in your current tool list. Do not call tools that appear only in earlier transcript history.\n{edit_note}\n</model_switch>\n",
        prev = previous.as_str(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_auto() {
        assert_eq!(normalize_model("auto"), MODEL_FAST);
        assert_eq!(normalize_model("openrouter/auto"), MODEL_FAST);
        assert_eq!(normalize_model("anthropic/claude-sonnet-4"), "anthropic/claude-sonnet-4");
    }

    #[test]
    fn classify_families() {
        assert_eq!(
            model_family("anthropic/claude-sonnet-4"),
            ModelFamily::Anthropic
        );
        assert_eq!(model_family("openai/gpt-5.1"), ModelFamily::OpenAi);
        assert_eq!(model_family("openai/gpt-5.1-codex"), ModelFamily::OpenAi);
        assert_eq!(model_family("vendor/foo-codex-bar"), ModelFamily::OpenAi);
        assert_eq!(model_family("azure/gpt-4o"), ModelFamily::OpenAi);
        assert_eq!(model_family("chatgpt-4o-latest"), ModelFamily::OpenAi);
        assert_eq!(
            model_family("deepseek/deepseek-v4-flash"),
            ModelFamily::DeepSeek
        );
        assert_eq!(model_family("google/gemini-2.5-pro"), ModelFamily::Google);
        assert_eq!(model_family("x-ai/grok-3"), ModelFamily::XAi);
        assert_eq!(model_family("gpt-4o"), ModelFamily::OpenAi);
        assert_eq!(model_family("claude-3-5-sonnet"), ModelFamily::Anthropic);
        assert_eq!(model_family("some-vendor/mystery"), ModelFamily::Other);
    }

    #[test]
    fn apply_patch_only_openai() {
        assert!(ModelFamily::OpenAi.uses_apply_patch());
        assert!(!ModelFamily::Anthropic.uses_apply_patch());
        assert!(!ModelFamily::DeepSeek.uses_apply_patch());
    }

    #[test]
    fn switch_hint_when_families_differ() {
        assert!(mid_chat_switch_hint(ModelFamily::DeepSeek, ModelFamily::OpenAi).is_some());
        assert!(mid_chat_switch_hint(ModelFamily::OpenAi, ModelFamily::OpenAi).is_none());
    }
}
