/// Model routing for the agent.
///
/// Policy: Shape picks the model. "Auto" is a fixed cheap/fast model — never
/// OpenRouter's server-side auto-router (`openrouter/auto`), which can land on
/// expensive flagship models.

/// Fast included model used for Auto and auxiliary work (titles, explore, etc.).
pub const MODEL_FAST: &str = "deepseek/deepseek-v4-flash";

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
