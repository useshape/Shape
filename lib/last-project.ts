const LAST_PROJECT_KEY = "shape:last-project";

/** Path restored when Shape is reopened (not when New Window is used). */
export function loadLastProject(): string | null {
    if (typeof window === "undefined") return null;
    try {
        const path = window.localStorage.getItem(LAST_PROJECT_KEY);
        return path && path.trim() ? path : null;
    } catch {
        return null;
    }
}

export function saveLastProject(path: string | null) {
    if (typeof window === "undefined") return;
    try {
        if (!path?.trim()) {
            window.localStorage.removeItem(LAST_PROJECT_KEY);
            return;
        }
        window.localStorage.setItem(LAST_PROJECT_KEY, path.trim().replace(/[\\/]+$/, ""));
    } catch {
        /* ignore quota / private mode */
    }
}
