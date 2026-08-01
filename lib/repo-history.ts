export type RepoHistoryEntry = {
    path: string;
    lastOpenedAt: number;
};

const REPO_HISTORY_KEY = "shape:repo-history";
const MAX_REPO_HISTORY_ITEMS = 15;

export function getRepoName(path: string): string {
    if (!path) return path;
    const normalized = path.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? path;
}

export function cleanPath(path: string): string {
    if (!path) return path;
    const normalized = path.replace(/\\/g, "/");
    // Replace C:/Users/Something/ with ~/
    const userMatch = normalized.match(/^C:\/Users\/[^/]+\/(.*)$/i);
    if (userMatch && userMatch[1]) {
        return `~/${userMatch[1]}`;
    }
    return path;
}

export function formatTimeAgo(timestamp: number): string {
    const diffMs = Date.now() - timestamp;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs < minute) return "just now";
    if (diffMs < hour) {
        const minutes = Math.floor(diffMs / minute);
        return `${minutes}m ago`;
    }
    if (diffMs < day) {
        const hours = Math.floor(diffMs / hour);
        return `${hours}h ago`;
    }
    const days = Math.floor(diffMs / day);
    return `${days}d ago`;
}

export function loadRepoHistory(): RepoHistoryEntry[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(REPO_HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as RepoHistoryEntry[];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (entry) =>
                typeof entry?.path === "string" &&
                entry.path.length > 0 &&
                typeof entry?.lastOpenedAt === "number"
        );
    } catch {
        return [];
    }
}

export function saveRepoHistory(entries: RepoHistoryEntry[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(REPO_HISTORY_KEY, JSON.stringify(entries));
}

export function upsertRepoHistory(path: string) {
    const now = Date.now();
    const current = loadRepoHistory();
    const next = [
        { path, lastOpenedAt: now },
        ...current.filter((entry) => entry.path !== path),
    ].slice(0, MAX_REPO_HISTORY_ITEMS);
    saveRepoHistory(next);
    return next;
}

export function clearRepoHistory() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(REPO_HISTORY_KEY);
}
