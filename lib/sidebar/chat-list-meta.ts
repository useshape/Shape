"use client";

const PIN_KEY = "shape-sidebar-pinned-chats";
const UNREAD_KEY = "shape-sidebar-unread-chats";

const EMPTY: ReadonlySet<string> = new Set();

let pinnedCache: ReadonlySet<string> | null = null;
let unreadCache: ReadonlySet<string> | null = null;

function readSet(key: string): ReadonlySet<string> {
    if (typeof window === "undefined") return EMPTY;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return EMPTY;
        const parsed = JSON.parse(raw) as string[];
        if (!Array.isArray(parsed) || parsed.length === 0) return EMPTY;
        return new Set(parsed);
    } catch {
        return EMPTY;
    }
}

function writeSet(key: string, ids: ReadonlySet<string>) {
    try {
        window.localStorage.setItem(key, JSON.stringify([...ids]));
    } catch {
        /* ignore */
    }
}

const pinListeners = new Set<() => void>();
const unreadListeners = new Set<() => void>();

export function subscribePinnedChats(cb: () => void) {
    pinListeners.add(cb);
    return () => {
        pinListeners.delete(cb);
    };
}

export function subscribeUnreadChats(cb: () => void) {
    unreadListeners.add(cb);
    return () => {
        unreadListeners.delete(cb);
    };
}

/** Stable snapshot for useSyncExternalStore. */
export function getPinnedChatIds(): ReadonlySet<string> {
    if (!pinnedCache) pinnedCache = readSet(PIN_KEY);
    return pinnedCache;
}

export function getPinnedChatIdsServer(): ReadonlySet<string> {
    return EMPTY;
}

export function isChatPinned(id: string): boolean {
    return getPinnedChatIds().has(id);
}

export function setChatPinned(id: string, pinned: boolean) {
    const next = new Set(getPinnedChatIds());
    if (pinned) next.add(id);
    else next.delete(id);
    writeSet(PIN_KEY, next);
    pinnedCache = next.size === 0 ? EMPTY : next;
    for (const l of pinListeners) l();
    window.dispatchEvent(new CustomEvent("shape-chat-pins-changed"));
}

/** Stable snapshot for useSyncExternalStore. */
export function getUnreadChatIds(): ReadonlySet<string> {
    if (!unreadCache) unreadCache = readSet(UNREAD_KEY);
    return unreadCache;
}

export function getUnreadChatIdsServer(): ReadonlySet<string> {
    return EMPTY;
}

export function markChatUnread(id: string) {
    if (!id) return;
    const next = new Set(getUnreadChatIds());
    if (next.has(id)) return;
    next.add(id);
    writeSet(UNREAD_KEY, next);
    unreadCache = next;
    for (const l of unreadListeners) l();
}

export function clearChatUnread(id: string) {
    if (!id) return;
    const next = new Set(getUnreadChatIds());
    if (!next.delete(id)) return;
    writeSet(UNREAD_KEY, next);
    unreadCache = next.size === 0 ? EMPTY : next;
    for (const l of unreadListeners) l();
}
