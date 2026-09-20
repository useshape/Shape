import { toTimestampMs } from "@/lib/ui/timestamp";

export type RepoHistoryEntry = {
    path: string;
    lastOpenedAt: number;
};

const REPO_HISTORY_KEY = "shape:repo-history";
const MAX_REPO_HISTORY_ITEMS = 15;
/** How many recents the composer/empty-state dropdown lists. Older entries stay in history. */
export const MAX_REPO_DROPDOWN_ITEMS = 8;

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
    const diffMs = Date.now() - toTimestampMs(timestamp);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs < 0 || diffMs > 3650 * day) return "—";
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

/** Compact sidebar timestamp: `14h`, `13d`, `now`. */
export function formatCompactAgo(timestamp: number): string {
    const full = formatTimeAgo(timestamp);
    if (full === "just now") return "now";
    if (full === "—") return "—";
    return full.replace(" ago", "");
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
    const existing = current.findIndex((entry) => entry.path === path);
    let next: RepoHistoryEntry[];
    if (existing >= 0) {
        // Keep user order — only refresh timestamp in place.
        next = current.map((entry, i) =>
            i === existing ? { ...entry, lastOpenedAt: now } : entry,
        );
    } else {
        next = [{ path, lastOpenedAt: now }, ...current].slice(0, MAX_REPO_HISTORY_ITEMS);
    }
    saveRepoHistory(next);
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("shape-repo-history-changed"));
    }
    return next;
}

export function clearRepoHistory() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(REPO_HISTORY_KEY);
}

export function removeFromRepoHistory(path: string) {
    if (typeof window === "undefined") return;
    const norm = path.replace(/\\/g, "/").toLowerCase();
    const next = loadRepoHistory().filter(
        (e) => e.path.replace(/\\/g, "/").toLowerCase() !== norm,
    );
    saveRepoHistory(next);
    window.dispatchEvent(new Event("shape-repo-history-changed"));
}
