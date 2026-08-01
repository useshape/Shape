const STORAGE_KEY = "shape-workspace-folders";

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function getExtraWorkspaceFolders(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((p): p is string => typeof p === "string" && p.length > 0);
    } catch {
        return [];
    }
}

export function setExtraWorkspaceFolders(folders: string[]): void {
    const unique = [...new Set(folders.map(normalizePath))];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
    window.dispatchEvent(new Event("shape-workspace-folders-changed"));
}

export function clearExtraWorkspaceFolders(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("shape-workspace-folders-changed"));
}

export function addWorkspaceFolder(path: string): void {
    const normalized = normalizePath(path);
    const existing = getExtraWorkspaceFolders();
    if (!existing.includes(normalized)) {
        setExtraWorkspaceFolders([...existing, normalized]);
    }
}

export function removeWorkspaceFolder(path: string): void {
    const normalized = normalizePath(path);
    setExtraWorkspaceFolders(getExtraWorkspaceFolders().filter((p) => p !== normalized));
}

/** All roots in a multi-root workspace (primary project first). */
export function getWorkspaceRoots(primaryPath: string | null): string[] {
    const roots: string[] = [];
    if (primaryPath) {
        roots.push(normalizePath(primaryPath));
    }
    for (const folder of getExtraWorkspaceFolders()) {
        if (!roots.includes(folder)) {
            roots.push(folder);
        }
    }
    return roots;
}

export function workspaceFolderLabel(path: string): string {
    const parts = normalizePath(path).split("/").filter(Boolean);
    return parts[parts.length - 1] || path;
}
