//! Read-only discovery of the machine Shape is running on.
//! The agent uses this to find programs, processes, and windows instead of guessing.
//! Capture is Windows-only. Lookup and process listing work on every desktop OS.

use std::path::PathBuf;
use std::process::Command;

const MAX_HITS: usize = 8;
const MAX_ROWS: usize = 40;
const MAX_CAPTURE_W: i32 = 1280;
const MAX_CAPTURE_H: i32 = 800;

pub struct WindowShot {
    pub title: String,
    pub png: Vec<u8>,
}

pub fn summary(project: &str, computer_use: bool, shell_automation: bool) -> String {
    let home = dirs::home_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "(unknown)".into());
    let user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "(unknown)".into());
    let workspace = if project.is_empty() {
        "(none open)".to_string()
    } else {
        project.to_string()
    };
    let shell = if cfg!(windows) {
        "PowerShell"
    } else {
        "sh"
    };
    format!(
        "OS: {} {}\nShell: {shell}\nUser: {user}\nHome: {home}\nWorkspace: {workspace}\nComputer use: {}\nShell automation: {}",
        std::env::consts::OS,
        std::env::consts::ARCH,
        if computer_use { "on" } else { "off" },
        if shell_automation { "on" } else { "off" },
    )
}

/// Find executables on PATH. `query` is a program name, not a path or a shell command.
pub fn lookup_program(query: &str) -> Result<String, String> {
    let name = query.trim();
    if name.is_empty() {
        return Err("Pass the program name to look up, for example ffmpeg.".into());
    }
    if !is_program_name(name) {
        return Err("lookup takes a program name, not a path or a shell command.".into());
    }
    let hits = programs_on_path(name);
    if hits.is_empty() {
        return Ok(format!(
            "No `{name}` on PATH. It may be installed somewhere else, or not installed."
        ));
    }
    let lines: Vec<String> = hits.iter().map(|p| p.display().to_string()).collect();
    Ok(format!("`{name}` on PATH:\n{}", lines.join("\n")))
}

pub fn list_processes(query: &str) -> Result<String, String> {
    let needle = query.trim().to_ascii_lowercase();
    if needle.is_empty() {
        return Err("Pass a program name to filter. A full process list is not available.".into());
    }
    if is_sensitive_surface(&needle) {
        return Err("That process list is hidden.".into());
    }
    let output = if cfg!(windows) {
        Command::new("tasklist")
            .args(["/FO", "CSV", "/NH"])
            .output()
    } else {
        Command::new("ps").args(["-ax", "-o", "pid=,comm="]).output()
    }
    .map_err(|e| format!("Could not list processes: {e}"))?;
    if !output.status.success() && output.stdout.is_empty() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Process list failed: {}", err.trim()));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut rows = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if is_sensitive_surface(line) {
            continue;
        }
        if !line.to_ascii_lowercase().contains(&needle) {
            continue;
        }
        rows.push(line.to_string());
        if rows.len() >= MAX_ROWS {
            break;
        }
    }
    if rows.is_empty() {
        return Ok(format!("No running process matched `{needle}`."));
    }
    let mut body = rows.join("\n");
    if rows.len() == MAX_ROWS {
        body.push_str("\n(list truncated)");
    }
    Ok(body)
}

pub fn list_windows(query: &str) -> Result<String, String> {
    let windows = visible_windows()?;
    let needle = query.trim().to_ascii_lowercase();
    let mut rows = Vec::new();
    let mut hidden = 0usize;
    for win in windows {
        if is_sensitive_surface(&win.title) {
            hidden += 1;
            continue;
        }
        if !needle.is_empty() && !win.title.to_ascii_lowercase().contains(&needle) {
            continue;
        }
        rows.push(format!("{}  pid {}", win.title, win.pid));
        if rows.len() >= MAX_ROWS {
            break;
        }
    }
    if rows.is_empty() {
        let hidden_note = if hidden > 0 {
            format!(" {hidden} window(s) hidden (password managers, authenticators, and similar).")
        } else {
            String::new()
        };
        return Ok(if needle.is_empty() {
            format!("No visible windows.{hidden_note}")
        } else {
            format!("No visible window title contains `{needle}`.{hidden_note}")
        });
    }
    let mut body = rows.join("\n");
    if hidden > 0 {
        body.push_str(&format!(
            "\n{hidden} window(s) hidden (password managers, authenticators, and similar)."
        ));
    }
    Ok(body)
}

pub fn capture_window(query: &str) -> Result<WindowShot, String> {
    let needle = query.trim();
    if needle.is_empty() {
        return Err("Pass part of the window title to capture.".into());
    }
    if is_sensitive_surface(needle) {
        return Err(
            "That window is hidden. Password managers, authenticators, and similar apps are not captured."
                .into(),
        );
    }
    let windows = visible_windows()?;
    let lower = needle.to_ascii_lowercase();
    let matches: Vec<_> = windows
        .into_iter()
        .filter(|win| win.title.to_ascii_lowercase().contains(&lower))
        .take(MAX_HITS)
        .collect();
    let Some(first) = matches.iter().find(|win| !is_sensitive_surface(&win.title)) else {
        return Err(format!(
            "No capturable window title contains `{needle}`. Password managers and similar windows are hidden."
        ));
    };
    let png = capture_hwnd(first.hwnd)?;
    Ok(WindowShot {
        title: first.title.clone(),
        png,
    })
}

fn is_program_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains(['/', '\\', ':', ';', '&', '|', '>', '<', ' ', '\n', '\r', '"', '\''])
        && !name.contains("..")
}

fn programs_on_path(name: &str) -> Vec<PathBuf> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    let exts = path_extensions();
    let mut hits = Vec::new();
    for dir in std::env::split_paths(&path) {
        for ext in &exts {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                hits.push(candidate);
                if hits.len() >= MAX_HITS {
                    return hits;
                }
            }
        }
    }
    hits
}

fn path_extensions() -> Vec<String> {
    if !cfg!(windows) {
        return vec![String::new()];
    }
    let mut exts: Vec<String> = std::env::var("PATHEXT")
        .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into())
        .split(';')
        .map(|ext| ext.trim().to_string())
        .filter(|ext| !ext.is_empty())
        .collect();
    if !exts.iter().any(|ext| ext.is_empty()) {
        exts.insert(0, String::new());
    }
    exts
}

struct ListedWindow {
    hwnd: isize,
    title: String,
    pid: u32,
}

fn visible_windows() -> Result<Vec<ListedWindow>, String> {
    #[cfg(windows)]
    {
        enumerate_windows()
    }
    #[cfg(not(windows))]
    {
        Err("Window listing is available on Windows.".into())
    }
}

fn capture_hwnd(hwnd: isize) -> Result<Vec<u8>, String> {
    #[cfg(windows)]
    {
        capture_hwnd_windows(hwnd)
    }
    #[cfg(not(windows))]
    {
        let _ = hwnd;
        Err("Window capture is available on Windows.".into())
    }
}

#[cfg(windows)]
fn enumerate_windows() -> Result<Vec<ListedWindow>, String> {
    use std::sync::Mutex;
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows_core::BOOL;
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowLongW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId,
        IsIconic, IsWindowVisible, GWL_EXSTYLE, GWL_STYLE, WS_CHILD, WS_EX_TOOLWINDOW,
    };

    struct EnumCtx {
        list: Vec<ListedWindow>,
        self_pid: u32,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut EnumCtx);
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return BOOL(1);
        }
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if style & WS_CHILD.0 != 0 || ex & WS_EX_TOOLWINDOW.0 != 0 {
            return BOOL(1);
        }
        let mut rect = windows::Win32::Foundation::RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return BOOL(1);
        }
        if rect.right - rect.left < 64 || rect.bottom - rect.top < 64 {
            return BOOL(1);
        }
        let mut pid = 0u32;
        let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == ctx.self_pid {
            return BOOL(1);
        }
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut buf);
        if len == 0 {
            return BOOL(1);
        }
        let title = String::from_utf16_lossy(&buf[..len as usize]);
        if title.trim().is_empty() {
            return BOOL(1);
        }
        ctx.list.push(ListedWindow {
            hwnd: hwnd.0 as isize,
            title,
            pid,
        });
        BOOL(1)
    }

    // EnumWindows requires a stable pointer for the duration of the call.
    let ctx = Mutex::new(EnumCtx {
        list: Vec::new(),
        self_pid: std::process::id(),
    });
    let mut ctx = ctx.into_inner().unwrap_or_else(|p| p.into_inner());
    unsafe {
        EnumWindows(Some(enum_proc), LPARAM(&mut ctx as *mut _ as isize))
            .map_err(|e| format!("Could not list windows: {e}"))?;
    }
    ctx.list
        .sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(ctx.list)
}

#[cfg(windows)]
fn capture_hwnd_windows(hwnd: isize) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
        ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HDC,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    use windows_core::BOOL;

    #[link(name = "user32")]
    extern "system" {
        fn PrintWindow(hwnd: HWND, hdc: HDC, flags: u32) -> BOOL;
    }
    const PW_RENDERFULLCONTENT: u32 = 2;

    let hwnd = HWND(hwnd as *mut _);
    unsafe {
        let mut rect = windows::Win32::Foundation::RECT::default();
        GetWindowRect(hwnd, &mut rect).map_err(|e| format!("Could not measure window: {e}"))?;
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width < 1 || height < 1 || width > 8000 || height > 8000 {
            return Err("Window size is not capturable.".into());
        }
        let screen = GetDC(None);
        if screen.is_invalid() {
            return Err("Could not open a device context.".into());
        }
        let mem = CreateCompatibleDC(Some(screen));
        if mem.is_invalid() {
            ReleaseDC(None, screen);
            return Err("Could not create a device context.".into());
        }
        let bitmap = CreateCompatibleBitmap(screen, width, height);
        if bitmap.is_invalid() {
            let _ = DeleteDC(mem);
            ReleaseDC(None, screen);
            return Err("Could not create a bitmap.".into());
        }
        let previous = SelectObject(mem, bitmap.into());
        let printed = PrintWindow(hwnd, mem, PW_RENDERFULLCONTENT);
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [Default::default()],
        };
        let mut pixels = vec![0u8; (width as usize) * (height as usize) * 4];
        let rows = GetDIBits(
            mem,
            bitmap,
            0,
            height as u32,
            Some(pixels.as_mut_ptr().cast()),
            &mut info,
            DIB_RGB_COLORS,
        );
        let _ = SelectObject(mem, previous);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(mem);
        ReleaseDC(None, screen);
        if !printed.as_bool() || rows == 0 {
            return Err("The window did not produce an image. It may be minimized or protected.".into());
        }
        bgra_to_rgba(&mut pixels);
        let (w, h, rgba) = downscale(&pixels, width, height, MAX_CAPTURE_W, MAX_CAPTURE_H);
        encode_png(w, h, &rgba)
    }
}

#[cfg(windows)]
fn bgra_to_rgba(pixels: &mut [u8]) {
    for px in pixels.chunks_exact_mut(4) {
        px.swap(0, 2);
        px[3] = 255;
    }
}

#[cfg(windows)]
fn downscale(pixels: &[u8], width: i32, height: i32, max_w: i32, max_h: i32) -> (u32, u32, Vec<u8>) {
    let scale = 1i32.max((width + max_w - 1) / max_w).max((height + max_h - 1) / max_h);
    if scale <= 1 {
        return (width as u32, height as u32, pixels.to_vec());
    }
    let w = (width / scale).max(1);
    let h = (height / scale).max(1);
    let mut out = Vec::with_capacity((w as usize) * (h as usize) * 4);
    for y in 0..h {
        for x in 0..w {
            let sx = (x * scale).min(width - 1) as usize;
            let sy = (y * scale).min(height - 1) as usize;
            let i = (sy * width as usize + sx) * 4;
            out.extend_from_slice(&pixels[i..i + 4]);
        }
    }
    (w as u32, h as u32, out)
}

#[cfg(windows)]
fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    let mut encoder = png::Encoder::new(&mut buf, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder
        .write_header()
        .map_err(|e| format!("Could not encode screenshot: {e}"))?;
    writer
        .write_image_data(rgba)
        .map_err(|e| format!("Could not encode screenshot: {e}"))?;
    drop(writer);
    Ok(buf)
}

/// Shell text that would read or write a credential file. Used when automation is on,
/// so ordinary scripts still run and secret files stay out of the shell.
/// Titles and process names that must not be listed or captured.
/// Screen contents of these apps can include passwords, codes, and keys.
pub fn is_sensitive_surface(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    const MARKERS: &[&str] = &[
        "1password",
        "bitwarden",
        "keepass",
        "lastpass",
        "dashlane",
        "nordpass",
        "password manager",
        "authenticator",
        "authy",
        "seed phrase",
        "recovery phrase",
        "metamask",
        "keychain access",
    ];
    MARKERS.iter().any(|marker| lower.contains(marker))
}

pub fn command_targets_secret(command: &str) -> bool {
    let lower = command.to_ascii_lowercase();
    const MARKERS: &[&str] = &[
        ".env",
        "id_rsa",
        "id_ed25519",
        "id_ecdsa",
        ".pem",
        ".p12",
        ".pfx",
        "credentials.json",
        "service-account.json",
        "secrets.json",
        "token.json",
        "mcp.json",
        ".npmrc",
        ".ssh",
        ".aws",
        ".gnupg",
    ];
    MARKERS.iter().any(|marker| lower.contains(marker))
}

fn sealed_path_mentioned(text: &str, project: &str) -> bool {
    let hay = text.replace('\\', "/").to_ascii_lowercase();
    let needle = project.replace('\\', "/").trim_matches('/').to_ascii_lowercase();
    needle.len() >= 3 && hay.contains(&needle)
}

/// Chat shell must not name the open code project, including inside a script it is about to run.
pub fn touches_sealed_project(command: &str, project: &str, cwd: &str) -> bool {
    if sealed_path_mentioned(command, project) {
        return true;
    }
    for token in command.split_whitespace() {
        let token = token.trim_matches(|c: char| c == '"' || c == '\'' || c == ',');
        let lower = token.to_ascii_lowercase();
        if !(lower.ends_with(".py")
            || lower.ends_with(".ps1")
            || lower.ends_with(".js")
            || lower.ends_with(".mjs")
            || lower.ends_with(".bat")
            || lower.ends_with(".cmd")
            || lower.ends_with(".sh"))
        {
            continue;
        }
        let path = if std::path::Path::new(token).is_absolute() {
            std::path::PathBuf::from(token)
        } else {
            std::path::PathBuf::from(cwd).join(token)
        };
        if let Ok(text) = std::fs::read_to_string(&path) {
            if sealed_path_mentioned(&text, project) {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookup_rejects_paths_and_shell() {
        assert!(lookup_program("../python").is_err());
        assert!(lookup_program("python -c").is_err());
        assert!(lookup_program("C:\\Windows\\notepad.exe").is_err());
        assert!(lookup_program("").is_err());
    }

    #[test]
    fn secret_markers_match_env_files() {
        assert!(command_targets_secret("python -c \"open('.env').read()\""));
        assert!(command_targets_secret("type id_rsa"));
        assert!(!command_targets_secret("python script.py"));
        assert!(!command_targets_secret("ffmpeg -i in.wav out.mp3"));
    }

    #[test]
    fn sensitive_windows_are_hidden() {
        assert!(is_sensitive_surface("1Password"));
        assert!(is_sensitive_surface("Bitwarden - Vault"));
        assert!(!is_sensitive_surface("Visual Studio Code"));
        assert!(!is_sensitive_surface("password.rs - Cursor"));
        assert!(!is_sensitive_surface("Blender"));
    }

    #[test]
    fn chat_shell_cannot_name_the_open_project() {
        let dir = std::env::temp_dir().join(format!("shape-sealed-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let script = dir.join("write_proj.py");
        std::fs::write(&script, "open(r'C:/Users/me/code-project/a.ts','w').write('x')").unwrap();
        assert!(touches_sealed_project(
            "python write_proj.py",
            r"C:\Users\me\code-project",
            dir.to_str().unwrap(),
        ));
        assert!(touches_sealed_project(
            r"Set-Content C:\Users\me\code-project\a.ts hi",
            r"C:\Users\me\code-project",
            dir.to_str().unwrap(),
        ));
        assert!(!touches_sealed_project("python script.py", r"C:\Users\me\code-project", dir.to_str().unwrap()));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn program_names_are_single_tokens() {
        assert!(is_program_name("ffmpeg"));
        assert!(is_program_name("python3"));
        assert!(!is_program_name("npm install"));
        assert!(!is_program_name("..\\cmd"));
    }
}
