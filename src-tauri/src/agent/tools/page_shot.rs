//! Page screenshot helpers: resolve which URL to capture, and place the image
//! inline in the assistant message (after the first prose paragraph, not dumped
//! at the end of the turn).

use std::sync::Mutex;

use regex::Regex;
use url::Url;

static LAST_PREVIEW_URL: Mutex<Option<String>> = Mutex::new(None);

pub fn remember_preview_url(url: &str) {
    let Ok(parsed) = Url::parse(url) else {
        return;
    };
    if !is_loopback(&parsed) {
        return;
    }
    if let Ok(mut g) = LAST_PREVIEW_URL.lock() {
        *g = Some(url.to_string());
    }
}

pub fn last_preview_url() -> Option<String> {
    LAST_PREVIEW_URL.lock().ok().and_then(|g| g.clone())
}

#[cfg(test)]
fn clear_preview_url() {
    if let Ok(mut g) = LAST_PREVIEW_URL.lock() {
        *g = None;
    }
}

pub fn origin_of(url: &str) -> Option<String> {
    let parsed = Url::parse(url).ok()?;
    let host = parsed.host_str().unwrap_or("localhost");
    match parsed.port() {
        Some(port) => Some(format!("{}://{host}:{port}", parsed.scheme())),
        None => Some(format!("{}://{host}", parsed.scheme())),
    }
}

fn is_loopback(url: &Url) -> bool {
    if url.scheme() != "http" && url.scheme() != "https" {
        return false;
    }
    matches!(
        url.host_str().map(|h| h.to_ascii_lowercase()).as_deref(),
        Some("localhost" | "127.0.0.1" | "0.0.0.0" | "[::1]" | "::1")
    )
}

fn rewrite_loopback_to_preview(url: &str) -> String {
    let Ok(mut parsed) = Url::parse(url) else {
        return url.to_string();
    };
    if !is_loopback(&parsed) {
        return url.to_string();
    }
    let Some(last) = last_preview_url() else {
        return url.to_string();
    };
    let Ok(preview) = Url::parse(&last) else {
        return url.to_string();
    };
    if !is_loopback(&preview) {
        return url.to_string();
    }
    let same_port = parsed.port() == preview.port()
        || (parsed.port().is_none() && preview.port().is_none());
    if same_port && parsed.host_str() == preview.host_str() {
        return url.to_string();
    }
    let _ = parsed.set_scheme(preview.scheme());
    let _ = parsed.set_host(preview.host_str());
    let _ = parsed.set_port(preview.port());
    parsed.to_string()
}

pub fn resolve_page_url(url: Option<&str>, path: Option<&str>) -> Result<String, String> {
    if let Some(raw) = url.map(str::trim).filter(|s| !s.is_empty()) {
        let parsed = Url::parse(raw).map_err(|e| format!("Invalid url: {e}"))?;
        if !is_loopback(&parsed) {
            return Err("screenshot_page only captures local preview URLs (localhost).".into());
        }
        return Ok(rewrite_loopback_to_preview(&parsed.to_string()));
    }

    let last = last_preview_url();
    if let Some(raw_path) = path.map(str::trim).filter(|s| !s.is_empty()) {
        let origin = last
            .as_deref()
            .and_then(origin_of)
            .ok_or_else(|| {
                "No local preview URL yet. Open the Preview panel on the running site first, or pass a full url (e.g. http://localhost:5173/pricing).".to_string()
            })?;
        let suffix = if raw_path.starts_with('/') {
            raw_path.to_string()
        } else {
            format!("/{raw_path}")
        };
        let joined = format!("{origin}{suffix}");
        let parsed = Url::parse(&joined).map_err(|e| format!("Invalid path url: {e}"))?;
        return Ok(parsed.to_string());
    }

    last.filter(|u| Url::parse(u).ok().is_some_and(|p| is_loopback(&p)))
        .ok_or_else(|| {
            "No local preview URL yet. Pass path (e.g. /pricing) or url for the page you changed — not only the homepage."
                .into()
        })
}

fn attached_image_re() -> Regex {
    Regex::new(r"(?s)<attached_image\b[^>]*>.*?</attached_image>").expect("screenshot regex")
}

fn extract_attached_images(body: &str) -> (String, Vec<String>) {
    let re = attached_image_re();
    let tags: Vec<String> = re.find_iter(body).map(|m| m.as_str().trim().to_string()).collect();
    let stripped = re.replace_all(body, "").to_string();
    (stripped, tags)
}

fn split_trailing_prose(body: &str) -> (String, String) {
    const CLOSERS: &[&str] = &[
        "</edit>",
        "</edit_pending>",
        "</terminal_command>",
        "</tool_result>",
        "</cat>",
        "</search_result>",
        "</inspect_runtime>",
        "</git_operation>",
        "</status>",
        "</todos>",
        "</think>",
        "</web_visit>",
        "</web_search>",
        "</plugin_call>",
    ];
    let mut last_end = 0usize;
    for closer in CLOSERS {
        if let Some(i) = body.rfind(closer) {
            last_end = last_end.max(i + closer.len());
        }
    }
    if last_end == 0 || last_end >= body.len() {
        return (String::new(), body.to_string());
    }
    (body[..last_end].to_string(), body[last_end..].to_string())
}

fn insert_after_first_paragraph(prose: &str, tags: &str) -> String {
    let trimmed = prose.trim();
    if trimmed.is_empty() {
        return format!("{tags}\n");
    }
    if let Some((first, rest)) = trimmed.split_once("\n\n") {
        let rest = rest.trim();
        if rest.is_empty() {
            format!("{first}\n\n{tags}\n")
        } else {
            format!("{first}\n\n{tags}\n\n{rest}")
        }
    } else {
        format!("{trimmed}\n\n{tags}\n")
    }
}

/// Put page screenshots in the user-facing reply: after the first prose
/// paragraph, never as a trailing dump under the whole message.
pub fn place_page_screenshots(body: &str, extra_tags: &[String]) -> String {
    let (stripped, mut tags) = extract_attached_images(body);
    for tag in extra_tags {
        let t = tag.trim();
        if t.is_empty() {
            continue;
        }
        if !tags.iter().any(|x| x == t) {
            tags.push(t.to_string());
        }
    }
    if tags.is_empty() {
        return body.to_string();
    }
    let joined = tags.join("\n");
    let (prefix, prose) = split_trailing_prose(&stripped);
    let placed = insert_after_first_paragraph(&prose, &joined);
    if prefix.is_empty() {
        placed
    } else if prefix.ends_with('\n') {
        format!("{prefix}{placed}")
    } else {
        format!("{prefix}\n{placed}")
    }
}

pub fn attached_image_tag(name: &str, mime: &str, data_url: &str) -> String {
    format!("<attached_image name=\"{name}\" type=\"{mime}\">{data_url}</attached_image>")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn resolve_explicit_url() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_preview_url();
        let u = resolve_page_url(Some("http://localhost:3000/pricing"), None).unwrap();
        assert_eq!(u, "http://localhost:3000/pricing");
    }

    #[test]
    fn resolve_rejects_remote() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_preview_url();
        assert!(resolve_page_url(Some("https://example.com/"), None).is_err());
    }

    #[test]
    fn path_without_preview_errors() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_preview_url();
        let err = resolve_page_url(None, Some("/pricing")).unwrap_err();
        assert!(err.contains("No local preview URL"));
    }

    #[test]
    fn path_uses_remembered_origin() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_preview_url();
        remember_preview_url("http://localhost:5173/app");
        let u = resolve_page_url(None, Some("/pricing")).unwrap();
        assert_eq!(u, "http://localhost:5173/pricing");
        clear_preview_url();
    }

    #[test]
    fn rewrites_hardcoded_loopback_to_preview_origin() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_preview_url();
        remember_preview_url("http://127.0.0.1:5173/");
        let u = resolve_page_url(Some("http://localhost:3000/pricing"), None).unwrap();
        assert_eq!(u, "http://127.0.0.1:5173/pricing");
        clear_preview_url();
    }

    #[test]
    fn ignores_non_loopback_remember() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_preview_url();
        remember_preview_url("https://example.com/");
        assert!(last_preview_url().is_none());
        assert!(resolve_page_url(None, Some("/x")).is_err());
    }

    #[test]
    fn places_image_after_first_paragraph_not_the_end() {
        let body = "Edits are in.\n\nThe pricing page is two columns now.\n\nAnnual is the default.";
        let tag = "<attached_image name=\"p.png\" type=\"image/jpeg\">data:image/jpeg;base64,xx</attached_image>";
        let out = place_page_screenshots(body, &[tag.to_string()]);
        let img_at = out.find("<attached_image").unwrap();
        let annual_at = out.find("Annual").unwrap();
        assert!(img_at < annual_at);
        assert!(out.contains("two columns"));
    }

    #[test]
    fn moves_trailing_image_up() {
        let body = "Hero is done.\n\nFAQ is on the right.\n\n<attached_image name=\"p.png\" type=\"image/jpeg\">data:x</attached_image>";
        let out = place_page_screenshots(body, &[]);
        let img_at = out.find("<attached_image").unwrap();
        let faq_at = out.find("FAQ").unwrap();
        assert!(img_at < faq_at);
    }
}
