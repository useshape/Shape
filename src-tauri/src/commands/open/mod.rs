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

/// Best-effort pin: Start Menu shortcut plus TaskBar Quick Launch shortcut.
pub fn pin_to_taskbar() -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let exe = std::env::current_exe().map_err(AppError::Io)?;
        let exe_str = exe.to_string_lossy().replace('\'', "''");
        let script = format!(
            "$exe = '{exe_str}'; \
             $shell = New-Object -ComObject WScript.Shell; \
             $start = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\Shape.lnk'; \
             $s = $shell.CreateShortcut($start); $s.TargetPath = $exe; $s.WorkingDirectory = (Split-Path $exe); $s.Save(); \
             $pinDir = Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar'; \
             New-Item -ItemType Directory -Force -Path $pinDir | Out-Null; \
             $pin = Join-Path $pinDir 'Shape.lnk'; \
             $p = $shell.CreateShortcut($pin); $p.TargetPath = $exe; $p.WorkingDirectory = (Split-Path $exe); $p.Save();"
        );
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(AppError::Io)?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
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
