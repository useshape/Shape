/// Outbound URL checks for browse / visit_url (SSRF class).

pub fn validate_outbound_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("URL is required.".to_string());
    }
    if trimmed.contains("://")
        && !(trimmed.starts_with("http://") || trimmed.starts_with("https://"))
    {
        return Err("Only http and https URLs are allowed.".to_string());
    }
    let candidate = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let parsed = url::Url::parse(&candidate).map_err(|_| "Invalid URL.".to_string())?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("Only http and https URLs are allowed.".to_string()),
    }
    let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
    if host.is_empty() {
        return Err("URL is missing a host.".to_string());
    }
    const BLOCKED_HOSTS: &[&str] = &[
        "169.254.169.254",
        "metadata.google.internal",
        "metadata.goog",
        "10.20.0.3",
    ];
    if BLOCKED_HOSTS.iter().any(|h| host == *h) {
        return Err("That host cannot be fetched.".to_string());
    }
    Ok(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_https_and_localhost() {
        assert!(validate_outbound_url("https://example.com/docs").is_ok());
        assert!(validate_outbound_url("http://127.0.0.1:5173/").is_ok());
        assert_eq!(
            validate_outbound_url("example.com/a").unwrap(),
            "https://example.com/a"
        );
    }

    #[test]
    fn blocks_file_and_metadata() {
        assert!(validate_outbound_url("file:///etc/passwd").is_err());
        assert!(validate_outbound_url("javascript:alert(1)").is_err());
        assert!(validate_outbound_url("http://169.254.169.254/latest/meta-data").is_err());
        assert!(validate_outbound_url("http://metadata.google.internal/").is_err());
    }
}
