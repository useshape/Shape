//! Capture a screen or window without focusing it or sending input.

use crate::agent::tools::desktop::WindowShot;

pub fn capture_screen() -> Result<WindowShot, String> {
    capture(None)
}

pub fn capture_named_window(query: &str) -> Result<WindowShot, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("Pass query with part of the window title.".into());
    }
    capture(Some(query))
}

#[cfg(windows)]
fn capture(query: Option<&str>) -> Result<WindowShot, String> {
    unsafe { capture_windows(query) }
}

#[cfg(not(windows))]
fn capture(query: Option<&str>) -> Result<WindowShot, String> {
    let _ = query;
    Err("Desktop capture is only available on Windows in this build.".into())
}

#[cfg(windows)]
unsafe fn capture_windows(query: Option<&str>) -> Result<WindowShot, String> {
    use std::ffi::c_void;
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        SRCCOPY,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect;

    let (hwnd, title, width, height) = if let Some(query) = query {
        let found = find_window(query)?;
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetWindowRect(found.hwnd, &mut rect) == 0 {
            return Err(format!("Could not measure window \"{}\".", found.title));
        }
        let width = (rect.right - rect.left).max(0) as u32;
        let height = (rect.bottom - rect.top).max(0) as u32;
        if width < 8 || height < 8 {
            return Err(format!(
                "Window \"{}\" has no drawable area. It was not restored or focused.",
                found.title
            ));
        }
        (found.hwnd, found.title, width, height)
    } else {
        let width = windows_sys::Win32::UI::WindowsAndMessaging::GetSystemMetrics(0).max(0) as u32;
        let height = windows_sys::Win32::UI::WindowsAndMessaging::GetSystemMetrics(1).max(0) as u32;
        (std::ptr::null_mut(), "Screen".to_string(), width, height)
    };

    if width == 0 || height == 0 {
        return Err("Nothing to capture.".into());
    }

    let screen = GetDC(std::ptr::null_mut());
    if screen.is_null() {
        return Err("Could not open a display device.".into());
    }
    let mem = CreateCompatibleDC(screen);
    if mem.is_null() {
        ReleaseDC(std::ptr::null_mut(), screen);
        return Err("Could not create a capture surface.".into());
    }
    let bitmap = CreateCompatibleBitmap(screen, width as i32, height as i32);
    if bitmap.is_null() {
        DeleteDC(mem);
        ReleaseDC(std::ptr::null_mut(), screen);
        return Err("Could not allocate a capture bitmap.".into());
    }
    let previous = SelectObject(mem, bitmap as *mut c_void);

    let copied = if hwnd.is_null() {
        BitBlt(mem, 0, 0, width as i32, height as i32, screen, 0, 0, SRCCOPY) != 0
    } else {
        // PW_RENDERFULLCONTENT draws the window's own surface. It does not
        // activate, move, or restore the window.
            print_window(hwnd, mem, 2) != 0
    };
    if !copied && !hwnd.is_null() {
        let window_dc = GetDC(hwnd);
        if !window_dc.is_null() {
            BitBlt(mem, 0, 0, width as i32, height as i32, window_dc, 0, 0, SRCCOPY);
            ReleaseDC(hwnd, window_dc);
        }
    }

    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [windows_sys::Win32::Graphics::Gdi::RGBQUAD {
            rgbBlue: 0,
            rgbGreen: 0,
            rgbRed: 0,
            rgbReserved: 0,
        }],
    };
    let mut bgra = vec![0u8; (width as usize) * (height as usize) * 4];
    let rows = GetDIBits(
        mem,
        bitmap,
        0,
        height,
        bgra.as_mut_ptr().cast(),
        &mut info,
        DIB_RGB_COLORS,
    );
    SelectObject(mem, previous);
    DeleteObject(bitmap as *mut c_void);
    DeleteDC(mem);
    ReleaseDC(std::ptr::null_mut(), screen);

    if rows == 0 {
        return Err(format!("Could not read pixels for \"{title}\"."));
    }
    let (width, height, rgba) = downscale(width, height, &bgra_to_rgba(&bgra));
    if image_is_blank(&rgba) {
        return Err(format!(
            "\"{title}\" captured as a blank image. The window was left as-is and was not restored or focused. If it is minimized, the capture has nothing to read."
        ));
    }
    let png = encode_png(width, height, &rgba)?;
    Ok(WindowShot { png, title })
}

#[cfg(windows)]
struct FoundWindow {
    hwnd: windows_sys::Win32::Foundation::HWND,
    title: String,
}

#[cfg(windows)]
fn find_window(query: &str) -> Result<FoundWindow, String> {
    use windows_sys::Win32::Foundation::{HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{EnumWindows, IsIconic, IsWindow};

    let mut found: Vec<(isize, String, bool)> = Vec::new();
    unsafe {
        EnumWindows(Some(enum_titles), &mut found as *mut _ as LPARAM);
    }
    let needle = query.to_ascii_lowercase();
    let mut matches: Vec<_> = found
        .into_iter()
        .filter(|(_, title, _)| title.to_ascii_lowercase().contains(&needle))
        .filter(|(_, title, _)| !crate::agent::tools::host::sensitive_title(title))
        .collect();
    if matches.is_empty() {
        return Err(format!(
            "No window title contains \"{query}\". The desktop was not changed."
        ));
    }
    matches.sort_by_key(|(_, title, iconic)| (*iconic, usize::MAX - title.len()));
    let (hwnd, title, iconic) = matches.remove(0);
    if iconic && matches.iter().all(|item| item.2) {
        return Err(format!(
            "\"{title}\" is minimized. It was not restored, because that would change the desktop."
        ));
    }
    let hwnd = hwnd as HWND;
    unsafe {
        if IsWindow(hwnd) == 0 {
            return Err("The window closed before it could be captured.".into());
        }
        let _ = IsIconic(hwnd);
    }
    Ok(FoundWindow { hwnd, title })
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn PrintWindow(
        hwnd: windows_sys::Win32::Foundation::HWND,
        hdc: windows_sys::Win32::Graphics::Gdi::HDC,
        flags: u32,
    ) -> i32;
}

#[cfg(windows)]
unsafe fn print_window(
    hwnd: windows_sys::Win32::Foundation::HWND,
    hdc: windows_sys::Win32::Graphics::Gdi::HDC,
    flags: u32,
) -> i32 {
    PrintWindow(hwnd, hdc, flags)
}

#[cfg(windows)]
unsafe extern "system" fn enum_titles(
    hwnd: windows_sys::Win32::Foundation::HWND,
    lparam: windows_sys::Win32::Foundation::LPARAM,
) -> i32 {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowTextW, IsIconic};
    let out = &mut *(lparam as *mut Vec<(isize, String, bool)>);
    let mut buf = [0u16; 512];
    let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
    if n > 0 {
        let title = String::from_utf16_lossy(&buf[..n as usize]);
        let title = title.trim().to_string();
        if !title.is_empty() {
            out.push((hwnd as isize, title, IsIconic(hwnd) != 0));
        }
    }
    1
}

fn bgra_to_rgba(bgra: &[u8]) -> Vec<u8> {
    let mut rgba = vec![0u8; bgra.len()];
    for (chunk, out) in bgra.chunks_exact(4).zip(rgba.chunks_exact_mut(4)) {
        out[0] = chunk[2];
        out[1] = chunk[1];
        out[2] = chunk[0];
        out[3] = 255;
    }
    rgba
}

fn downscale(width: u32, height: u32, rgba: &[u8]) -> (u32, u32, Vec<u8>) {
    let max_edge = 1280u32;
    let edge = width.max(height);
    if edge <= max_edge || width == 0 || height == 0 {
        return (width, height, rgba.to_vec());
    }
    let scale = max_edge as f32 / edge as f32;
    let nw = ((width as f32) * scale).round().max(1.0) as u32;
    let nh = ((height as f32) * scale).round().max(1.0) as u32;
    let mut out = vec![0u8; (nw as usize) * (nh as usize) * 4];
    for y in 0..nh {
        let sy = ((y as u64) * (height as u64) / (nh as u64)) as u32;
        for x in 0..nw {
            let sx = ((x as u64) * (width as u64) / (nw as u64)) as u32;
            let src = ((sy as usize) * (width as usize) + (sx as usize)) * 4;
            let dst = ((y as usize) * (nw as usize) + (x as usize)) * 4;
            out[dst..dst + 4].copy_from_slice(&rgba[src..src + 4]);
        }
    }
    (nw, nh, out)
}

fn image_is_blank(rgba: &[u8]) -> bool {
    if rgba.len() < 16 {
        return true;
    }
    let mut min = [255u8; 3];
    let mut max = [0u8; 3];
    let step = (rgba.len() / 4 / 400).max(1) * 4;
    let mut i = 0;
    while i + 3 < rgba.len() {
        for c in 0..3 {
            min[c] = min[c].min(rgba[i + c]);
            max[c] = max[c].max(rgba[i + c]);
        }
        i += step;
    }
    max.iter().zip(min).all(|(hi, lo)| hi.saturating_sub(lo) < 6)
}

fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder
        .write_header()
        .map_err(|err| format!("Could not encode the screenshot: {err}"))?;
    writer
        .write_image_data(rgba)
        .map_err(|err| format!("Could not encode the screenshot: {err}"))?;
    drop(writer);
    Ok(out)
}
