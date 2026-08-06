"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "shape-agent-pinned-workspaces";

type Listener = () => void;

let cachedRaw: string | null | undefined;
let cachedSet: ReadonlySet<string> = new Set();
const listeners = new Set<Listener>();

function readRaw(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function parseIds(raw: string | null): ReadonlySet<string> {
    if (!raw) return new Set();
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
    } catch {
        return new Set();
    }
}

function getSnapshot(): ReadonlySet<string> {
    const raw = readRaw();
    if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedSet = parseIds(raw);
    }
    return cachedSet;
}

function getServerSnapshot(): ReadonlySet<string> {
    return cachedSet;
}

function emit() {
    for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY || e.key === null) {
            cachedRaw = undefined;
            emit();
        }
    };
    if (typeof window !== "undefined") {
        window.addEventListener("storage", onStorage);
    }
    return () => {
        listeners.delete(listener);
        if (typeof window !== "undefined") {
            window.removeEventListener("storage", onStorage);
        }
    };
}

function writeIds(ids: ReadonlySet<string>) {
    const next = JSON.stringify([...ids]);
    try {
        localStorage.setItem(STORAGE_KEY, next);
    } catch {
        /* ignore quota / private mode */
    }
    cachedRaw = next;
    cachedSet = new Set(ids);
    emit();
}

export function usePinnedWorkspaces() {
    const pinned = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const isPinned = useCallback((id: string) => pinned.has(id), [pinned]);

    const togglePin = useCallback((id: string) => {
        const next = new Set(getSnapshot());
        if (next.has(id)) next.delete(id);
        else next.add(id);
        writeIds(next);
    }, []);

    const pin = useCallback((id: string) => {
        const next = new Set(getSnapshot());
        if (next.has(id)) return;
        next.add(id);
        writeIds(next);
    }, []);

    const unpin = useCallback((id: string) => {
        const next = new Set(getSnapshot());
        if (!next.has(id)) return;
        next.delete(id);
        writeIds(next);
    }, []);

    return { pinned, isPinned, togglePin, pin, unpin };
}
