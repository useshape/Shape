/**
 * Persist unsaved editor buffers across restarts so dirty markdown/text
 * survives app quit without forcing a save prompt every time.
 */

const STORAGE_KEY = "shape-dirty-buffers-v1";

export type DirtyBuffer = {
    path: string;
    content: string;
    savedContent: string;
    updatedAt: number;
};

function readAll(): Record<string, DirtyBuffer> {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, DirtyBuffer>;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeAll(map: Record<string, DirtyBuffer>) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        /* quota / private mode */
    }
}

export function saveDirtyBuffer(path: string, content: string, savedContent: string) {
    const map = readAll();
    if (content === savedContent) {
        delete map[path];
    } else {
        map[path] = { path, content, savedContent, updatedAt: Date.now() };
    }
    writeAll(map);
}

export function clearDirtyBuffer(path: string) {
    const map = readAll();
    if (!(path in map)) return;
    delete map[path];
    writeAll(map);
}

export function loadDirtyBuffer(path: string): DirtyBuffer | null {
    return readAll()[path] ?? null;
}

export function listDirtyBuffers(): DirtyBuffer[] {
    return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}
