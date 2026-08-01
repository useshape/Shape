#[cfg(windows)]
pub fn hide_console(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn hide_console(_cmd: &mut std::process::Command) {}

#[cfg(windows)]
pub fn hide_console_tokio(cmd: &mut tokio::process::Command) {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn hide_console_tokio(_cmd: &mut tokio::process::Command) {}

/// Release builds use `windows_subsystem = "windows"` (no console). ConPTY then
/// allocates a visible fallback console per child shell. Allocate a hidden
/// console for the parent so PTY children inherit it — same pattern as VS Code /
/// node-pty. Skip in debug so `cargo run` keeps the developer terminal.
#[cfg(all(windows, not(debug_assertions)))]
pub fn ensure_hidden_console_for_conpty() {
    use std::sync::Once;
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        // SAFETY: AllocConsole / ShowWindow are process-wide init, called once at startup.
        unsafe {
            type BOOL = i32;
            type HWND = *mut std::ffi::c_void;
            #[link(name = "kernel32")]
            unsafe extern "system" {
                fn AllocConsole() -> BOOL;
                fn GetConsoleWindow() -> HWND;
            }
            #[link(name = "user32")]
            unsafe extern "system" {
                fn ShowWindow(hwnd: HWND, n_cmd_show: i32) -> BOOL;
            }
            const SW_HIDE: i32 = 0;
            let _ = AllocConsole();
            let hwnd = GetConsoleWindow();
            if !hwnd.is_null() {
                let _ = ShowWindow(hwnd, SW_HIDE);
            }
        }
    });
}

#[cfg(not(all(windows, not(debug_assertions))))]
pub fn ensure_hidden_console_for_conpty() {}

/// On Windows, disable resolving executables from the process current directory.
pub fn apply_trusted_binary_env(cmd: &mut std::process::Command) {
    #[cfg(windows)]
    {
        cmd.env("NoDefaultCurrentDirectoryInExePath", "1");
    }
}

#[cfg(windows)]
pub fn apply_trusted_binary_env_tokio(cmd: &mut tokio::process::Command) {
    cmd.env("NoDefaultCurrentDirectoryInExePath", "1");
}

#[cfg(not(windows))]
pub fn apply_trusted_binary_env_tokio(_cmd: &mut tokio::process::Command) {}
