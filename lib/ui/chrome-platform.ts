export type ChromePlatform = "macos" | "windows";

const STORAGE_KEY = "shape-dev-platform";
const listeners = new Set<() => void>();

function detectPlatform(): ChromePlatform {
    if (typeof navigator === "undefined") return "windows";
    const platform = navigator.platform?.toLowerCase() ?? "";
    const ua = navigator.userAgent?.toLowerCase() ?? "";
    if (platform.includes("mac") || ua.includes("mac os")) return "macos";
    return "windows";
}

/** Real OS in production. Development may override via localStorage. */
export function chromePlatform(): ChromePlatform {
    const detected = detectPlatform();
    if (process.env.NODE_ENV === "production") return detected;
    try {
        const override = localStorage.getItem(STORAGE_KEY);
        if (override === "macos" || override === "windows") return override;
    } catch {
        /* ignore */
    }
    return detected;
}

export function subscribeChromePlatform(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function setDevChromePlatform(next: ChromePlatform | null) {
    if (process.env.NODE_ENV === "production") return;
    try {
        if (next) localStorage.setItem(STORAGE_KEY, next);
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
    listeners.forEach((listener) => listener());
}

export function devChromeOverride(): ChromePlatform | null {
    if (process.env.NODE_ENV === "production") return null;
    try {
        const override = localStorage.getItem(STORAGE_KEY);
        if (override === "macos" || override === "windows") return override;
    } catch {
        /* ignore */
    }
    return null;
}
