#[cfg(not(debug_assertions))]
const PRODUCTION_ORIGIN: &str = "https://www.useshape.org";
const DEV_FALLBACK: &str = "http://localhost:3000";
const COMPILED_WEBSITE_URL: Option<&str> = option_env!("NEXT_PUBLIC_SHAPE_WEBSITE_URL");

/// Production: www.useshape.org (primary host; apex redirects without CORS).
/// Debug: `NEXT_PUBLIC_SHAPE_WEBSITE_URL` or localhost.
pub fn shape_website_base() -> String {
    #[cfg(debug_assertions)]
    {
        if let Ok(v) = std::env::var("NEXT_PUBLIC_SHAPE_WEBSITE_URL") {
            if !v.trim().is_empty() {
                return v.trim_end_matches('/').to_string();
            }
        }
        return COMPILED_WEBSITE_URL
            .filter(|s| !s.is_empty())
            .map(|s| s.trim_end_matches('/').to_string())
            .unwrap_or_else(|| DEV_FALLBACK.to_string());
    }

    #[cfg(not(debug_assertions))]
    {
        PRODUCTION_ORIGIN.to_string()
    }
}
