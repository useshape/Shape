//! WebView2 DevTools endpoint for the in-app inspector.
//! Loopback only, one port per process, and not open to every website origin.

use std::sync::OnceLock;

static PORT: OnceLock<u16> = OnceLock::new();

pub fn port() -> u16 {
    *PORT.get_or_init(|| {
        std::net::TcpListener::bind("127.0.0.1:0")
            .and_then(|listener| listener.local_addr())
            .map(|addr| addr.port())
            .unwrap_or(0)
    })
}

pub fn base_url() -> String {
    format!("http://127.0.0.1:{}", port())
}

/// Must run before the Tauri webview is created.
pub fn install_env() {
    #[cfg(windows)]
    {
        let port = port();
        if port == 0 {
            return;
        }
        let port_flag = format!("--remote-debugging-port={port}");
        let flags = [
            port_flag.as_str(),
            "--remote-debugging-address=127.0.0.1",
            "--site-per-process",
        ];
        let mut existing = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
        for flag in flags {
            let present = if flag.starts_with("--remote-debugging-port=") {
                existing.contains("remote-debugging-port")
            } else {
                existing.split_whitespace().any(|part| part == flag)
            };
            if present {
                continue;
            }
            if existing.trim().is_empty() {
                existing = flag.to_string();
            } else {
                existing = format!("{existing} {flag}");
            }
        }
        // Drop a wildcard allow-list if something else injected one.
        existing = existing
            .split_whitespace()
            .filter(|part| *part != "--remote-allow-origins=*")
            .collect::<Vec<_>>()
            .join(" ");
        let origin = format!("--remote-allow-origins=http://127.0.0.1:{port}");
        if !existing.contains("remote-allow-origins=") {
            existing = format!("{existing} {origin}");
        }
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", existing.trim());
    }
}
