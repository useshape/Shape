use crate::core::error::AppError;

pub fn open_url_external(url: String) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW avoids a console flash. Quote the URL so cmd does not
        // treat `&` query separators as additional commands (breaks OAuth).
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let safe = url.replace('"', "");
        let cmdline = format!("/c start \"\" \"{safe}\"");
        std::process::Command::new("cmd")
            .raw_arg(cmdline)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(AppError::Io)?;
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(AppError::Io)?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map_err(AppError::Io)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn oauth_url_stays_one_cmd_argument() {
        let url = "https://example.com/oauth/authorize?redirect_uri=shape://x&state=abc&scope=openid&code_challenge=xyz&code_challenge_method=S256";
        let safe = url.replace('"', "");
        let cmdline = format!("/c start \"\" \"{safe}\"");
        assert!(cmdline.contains("&state=abc"));
        assert!(!cmdline.contains("\" &"));
        assert!(cmdline.ends_with("\""));
    }
}
