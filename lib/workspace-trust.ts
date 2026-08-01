const STORAGE_KEY = "shape-trusted-workspaces";

function normalizeWorkspacePath(path: string): string {
    const trimmed = path.trim().replace(/[\\/]+$/, "");
    return trimmed.replace(/\\/g, "/").toLowerCase();
}

function loadTrustedSet(): Set<string> {
    if (typeof window === "undefined") return new Set();
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.map((p) => normalizeWorkspacePath(String(p))));
    } catch {
        return new Set();
    }
}

function saveTrustedSet(set: Set<string>): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function isWorkspaceTrusted(path: string | null | undefined): boolean {
    if (!path) return false;
    return loadTrustedSet().has(normalizeWorkspacePath(path));
}

export function trustWorkspace(path: string): void {
    const set = loadTrustedSet();
    set.add(normalizeWorkspacePath(path));
    saveTrustedSet(set);
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("shape-workspace-trusted", { detail: { path } }));
    }
}

export function untrustWorkspace(path: string): void {
    const set = loadTrustedSet();
    set.delete(normalizeWorkspacePath(path));
    saveTrustedSet(set);
}

export function listTrustedWorkspaces(): string[] {
    return [...loadTrustedSet()];
}

export function notifyWorkspaceOpened(path: string): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("shape-workspace-opened", { detail: { path } }));
}

export function notifyWorkspaceClosed(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("shape-workspace-opened", { detail: { path: null } }));
}

export { normalizeWorkspacePath };
