#[cfg(not(debug_assertions))]
const PRODUCTION_ORIGIN: &str = "https://www.useshape.org";
#[cfg(debug_assertions)]
const DEV_FALLBACK: &str = "http://localhost:3000";
#[cfg(debug_assertions)]
const COMPILED_WEBSITE_URL: Option<&str> = option_env!("NEXT_PUBLIC_SHAPE_WEBSITE_URL");

fn trim_origin(value: &str) -> String {
    value.trim().trim_end_matches('/').to_string()
}

/// Loopback Cloud AI — allowed in release so a production binary can hit a local
/// website without shipping a special build. Public hosts stay on useshape.org.
pub fn is_loopback_origin(url: &str) -> bool {
    let Ok(parsed) = url::Url::parse(url) else {
        return false;
    };
    matches!(
        parsed.host_str(),
        Some("localhost" | "127.0.0.1" | "::1")
    )
}

fn env_website_url() -> Option<String> {
    let raw = std::env::var("NEXT_PUBLIC_SHAPE_WEBSITE_URL").ok()?;
    let trimmed = trim_origin(&raw);
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed)
}

/// Production: www.useshape.org (primary host; apex redirects without CORS).
/// Debug: `NEXT_PUBLIC_SHAPE_WEBSITE_URL` or localhost.
/// Release: the same env var is honored only when it is loopback.
pub fn shape_website_base() -> String {
    if let Some(v) = env_website_url() {
        #[cfg(debug_assertions)]
        {
            return v;
        }
        #[cfg(not(debug_assertions))]
        {
            if is_loopback_origin(&v) {
                return v;
            }
        }
    }

    #[cfg(debug_assertions)]
    {
        return COMPILED_WEBSITE_URL
            .filter(|s| !s.is_empty())
            .map(|s| trim_origin(s))
            .unwrap_or_else(|| DEV_FALLBACK.to_string());
    }

    #[cfg(not(debug_assertions))]
    {
        PRODUCTION_ORIGIN.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_origins() {
        assert!(is_loopback_origin("http://localhost:3000"));
        assert!(is_loopback_origin("http://127.0.0.1:3000/"));
        assert!(!is_loopback_origin("https://www.useshape.org"));
        assert!(!is_loopback_origin("https://evil.example"));
        assert!(!is_loopback_origin("not a url"));
    }
}
