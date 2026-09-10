export function isTauriRuntime(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Sync check for the focused editor popout route (`/popout`). */
export function isPopoutPath(pathname?: string | null): boolean {
    const path =
        pathname ??
        (typeof window !== "undefined" ? window.location.pathname : "");
    return path === "/popout" || path.startsWith("/popout/");
}

export async function getTauriWindowLabel(): Promise<string | null> {
    if (!isTauriRuntime()) return null;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().label;
}

export async function isMainTauriWindow(): Promise<boolean> {
    const label = await getTauriWindowLabel();
    return label === "main";
}

export async function toggleDevTools(): Promise<void> {
    if (!isTauriRuntime()) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("plugin:webview|internal_toggle_devtools");
}
