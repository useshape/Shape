import type { DesignSourceLoc } from "./types";

export const MAX_UNDO = 250;
export const COALESCE_MS = 400;

export function historyKey(url: string): string {
    try {
        const u = new URL(url);
        let path = u.pathname || "/";
        if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
        return `design:${u.origin}${path}${u.search}`;
    } catch {
        return `design:${url}`;
    }
}

export type HistoryEntry = {
    at: number;
    id: string;
    selector?: string;
    label: string;
    before: Record<string, string>;
    after: Record<string, string>;
    textBefore?: string;
    textAfter?: string;
};

export type HistorySession = {
    key: string;
    pending: Array<{
        id: string;
        selector?: string;
        className?: string;
        tag?: string;
        locateText?: string;
        source?: DesignSourceLoc;
        label: string;
        styles: Record<string, string>;
        text?: string;
    }>;
    undo: HistoryEntry[];
    redo: HistoryEntry[];
    updatedAt: number;
};

function sameKeys(a: Record<string, string>, b: Record<string, string>): boolean {
    const bk = Object.keys(b);
    if (bk.length === 0) return false;
    return bk.every((k) => Object.prototype.hasOwnProperty.call(a, k));
}

export function shouldCoalesce(prev: HistoryEntry, next: HistoryEntry): boolean {
    if (next.at - prev.at > COALESCE_MS) return false;
    if (prev.id !== next.id) return false;
    if (next.textAfter != null && prev.textAfter != null) return true;
    return sameKeys(prev.after, next.after);
}

export function pushEntry(undo: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
    const last = undo[undo.length - 1];
    if (last && shouldCoalesce(last, entry)) {
        const merged: HistoryEntry = {
            ...last,
            after: { ...last.after, ...entry.after },
            textAfter: entry.textAfter ?? last.textAfter,
            at: entry.at,
        };
        return [...undo.slice(0, -1), merged];
    }
    const next = [...undo, entry];
    if (next.length > MAX_UNDO) return next.slice(next.length - MAX_UNDO);
    return next;
}

const DB_NAME = "shape-design-history";
const STORE = "sessions";
const MEM_CAP_BYTES = 1_500_000;

let memory: HistorySession | null = null;
const sessions = new Map<string, HistorySession>();
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((l) => l());
}

export function subscribeHistory(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getHistorySession() {
    return memory;
}

function openDb(): Promise<IDBDatabase> | null {
    if (typeof indexedDB === "undefined") return null;
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) {
                req.result.createObjectStore(STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;

function estimateSize(session: HistorySession): number {
    try {
        return JSON.stringify(session).length;
    } catch {
        return 0;
    }
}

function trimForStorage(session: HistorySession): HistorySession {
    if (estimateSize(session) <= MEM_CAP_BYTES) return session;
    const undo = session.undo.slice(-Math.floor(MAX_UNDO / 2));
    return { ...session, undo, redo: [] };
}

async function flushPersist() {
    if (!memory) return;
    const packed = trimForStorage(memory);
    sessions.set(packed.key, packed);
    const dbp = openDb();
    if (!dbp) return;
    try {
        const db = await dbp;
        const packed = trimForStorage(memory);
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(packed, packed.key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch {
        /* quota / private mode */
    }
}

function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        void flushPersist();
    }, 200);
}

export function initHistory(key: string, session?: HistorySession | null) {
    memory = session && session.key === key
        ? session
        : sessions.get(key) ?? { key, pending: [], undo: [], redo: [], updatedAt: Date.now() };
    sessions.set(memory.key, memory);
    emit();
}

export async function restoreHistory(key: string): Promise<HistorySession> {
    if (memory?.key === key) return memory;
    if (memory) await persistHistoryNow();
    const ram = sessions.get(key);
    if (ram && ram.key === key) {
        memory = ram;
        emit();
        return ram;
    }
    const dbp = openDb();
    if (dbp) {
        try {
            const db = await dbp;
            const stored = await new Promise<HistorySession | undefined>((resolve, reject) => {
                const tx = db.transaction(STORE, "readonly");
                const req = tx.objectStore(STORE).get(key);
                req.onsuccess = () => resolve(req.result as HistorySession | undefined);
                req.onerror = () => reject(req.error);
            });
            db.close();
            if (stored && stored.key === key) {
                memory = stored;
                sessions.set(key, stored);
                emit();
                return stored;
            }
        } catch {
            /* ignore */
        }
    }
    initHistory(key);
    return memory!;
}

export async function switchHistory(nextKey: string, pending: HistorySession["pending"]): Promise<HistorySession> {
    if (memory) {
        memory = { ...memory, pending, updatedAt: Date.now() };
        sessions.set(memory.key, memory);
        if (memory.key === nextKey) {
            schedulePersist();
            emit();
            return memory;
        }
        await persistHistoryNow();
    }
    return restoreHistory(nextKey);
}

export function recordChange(entry: Omit<HistoryEntry, "at"> & { at?: number }) {
    if (!memory) initHistory("default");
    const full: HistoryEntry = { ...entry, at: entry.at ?? Date.now() };
    memory = {
        ...memory!,
        undo: pushEntry(memory!.undo, full),
        redo: [],
        updatedAt: full.at,
    };
    sessions.set(memory.key, memory);
    emit();
    schedulePersist();
}

export function historyUndo(): HistoryEntry | null {
    if (!memory || memory.undo.length === 0) return null;
    const entry = memory.undo[memory.undo.length - 1]!;
    memory = {
        ...memory,
        undo: memory.undo.slice(0, -1),
        redo: [...memory.redo, entry],
        updatedAt: Date.now(),
    };
    sessions.set(memory.key, memory);
    emit();
    schedulePersist();
    return entry;
}

export function historyRedo(): HistoryEntry | null {
    if (!memory || memory.redo.length === 0) return null;
    const entry = memory.redo[memory.redo.length - 1]!;
    memory = {
        ...memory,
        undo: [...memory.undo, entry],
        redo: memory.redo.slice(0, -1),
        updatedAt: Date.now(),
    };
    sessions.set(memory.key, memory);
    emit();
    schedulePersist();
    return entry;
}

export function setHistoryPending(pending: HistorySession["pending"]) {
    if (!memory) initHistory("default");
    memory = { ...memory!, pending, updatedAt: Date.now() };
    sessions.set(memory.key, memory);
    schedulePersist();
}

export function clearHistory() {
    if (!memory) return Promise.resolve();
    const key = memory.key;
    memory = { key, pending: [], undo: [], redo: [], updatedAt: Date.now() };
    sessions.set(key, memory);
    emit();
    return flushPersist();
}

export function persistHistoryNow() {
    if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = undefined;
    }
    return flushPersist();
}

if (typeof window !== "undefined") {
    window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void persistHistoryNow();
    });
    window.addEventListener("pagehide", () => {
        void persistHistoryNow();
    });
    window.addEventListener("beforeunload", () => {
        void persistHistoryNow();
    });
}
