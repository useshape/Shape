"use client";

const PIN_KEY = "shape-sidebar-pinned-chats";
const UNREAD_KEY = "shape-sidebar-unread-chats";
const COLOR_KEY = "shape-sidebar-chat-colors";
const COLLECTION_KEY = "shape-sidebar-collections";

export const COLLECTION_ICONS = [
    "star",
    "flag",
    "bookmark",
    "rocket",
    "lightbulb",
    "beaker",
    "code",
    "book",
    "heart",
    "target",
    "home",
    "people",
    "calendar",
    "camera",
    "cloud",
    "globe",
    "mail",
    "shield",
    "bug",
    "gift",
    "key",
    "trophy",
    "bot",
    "sparkle",
    "planet",
    "flash",
    "music",
    "leaf",
    "wrench",
    "airplane",
] as const;
export type CollectionIcon = (typeof COLLECTION_ICONS)[number];

export type ChatCollection = {
    id: string;
    name: string;
    icon: CollectionIcon;
    color: ChatColor;
    chatIds: string[];
};

export const CHAT_COLORS = ["blue", "teal", "green", "amber", "rose", "violet"] as const;
export type ChatColor = (typeof CHAT_COLORS)[number];

export const CHAT_COLOR_HEX: Record<ChatColor, string> = {
    blue: "#6ea8ff",
    teal: "#3ecfb2",
    green: "#5dce7a",
    amber: "#e2b15a",
    rose: "#ef7d9b",
    violet: "#b08cff",
};

const EMPTY: ReadonlySet<string> = new Set();

let pinnedCache: ReadonlySet<string> | null = null;
let unreadCache: ReadonlySet<string> | null = null;
let colorCache: Readonly<Record<string, ChatColor>> | null = null;

const EMPTY_COLORS: Readonly<Record<string, ChatColor>> = {};

function isChatColor(value: string): value is ChatColor {
    return (CHAT_COLORS as readonly string[]).includes(value);
}

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

function readColors(): Readonly<Record<string, ChatColor>> {
    if (typeof window === "undefined") return EMPTY_COLORS;
    try {
        const raw = window.localStorage.getItem(COLOR_KEY);
        if (!raw) return EMPTY_COLORS;
        const parsed = JSON.parse(raw) as Record<string, string>;
        if (!parsed || typeof parsed !== "object") return EMPTY_COLORS;
        const next: Record<string, ChatColor> = {};
        for (const [id, color] of Object.entries(parsed)) {
            if (isChatColor(color)) next[id] = color;
        }
        return Object.keys(next).length === 0 ? EMPTY_COLORS : next;
    } catch {
        return EMPTY_COLORS;
    }
}

const colorListeners = new Set<() => void>();

export function subscribeChatColors(cb: () => void) {
    colorListeners.add(cb);
    return () => {
        colorListeners.delete(cb);
    };
}

export function getChatColors(): Readonly<Record<string, ChatColor>> {
    if (!colorCache) colorCache = readColors();
    return colorCache;
}

export function getChatColorsServer(): Readonly<Record<string, ChatColor>> {
    return EMPTY_COLORS;
}

const EMPTY_COLLECTIONS: readonly ChatCollection[] = [];
let collectionCache: readonly ChatCollection[] | null = null;
const collectionListeners = new Set<() => void>();

function isCollectionIcon(value: string): value is CollectionIcon {
    return (COLLECTION_ICONS as readonly string[]).includes(value);
}

function readCollections(): readonly ChatCollection[] {
    if (typeof window === "undefined") return EMPTY_COLLECTIONS;
    try {
        const raw = window.localStorage.getItem(COLLECTION_KEY);
        if (!raw) return EMPTY_COLLECTIONS;
        const parsed = JSON.parse(raw) as ChatCollection[];
        if (!Array.isArray(parsed)) return EMPTY_COLLECTIONS;
        const next = parsed.filter(
            (item) =>
                item
                && typeof item.id === "string"
                && typeof item.name === "string"
                && isCollectionIcon(item.icon)
                && isChatColor(item.color)
                && Array.isArray(item.chatIds),
        );
        return next.length === 0 ? EMPTY_COLLECTIONS : next;
    } catch {
        return EMPTY_COLLECTIONS;
    }
}

function writeCollections(next: readonly ChatCollection[]) {
    try {
        window.localStorage.setItem(COLLECTION_KEY, JSON.stringify(next));
    } catch {
        /* ignore */
    }
    collectionCache = next.length === 0 ? EMPTY_COLLECTIONS : next;
    for (const listener of collectionListeners) listener();
}

export function subscribeCollections(cb: () => void) {
    collectionListeners.add(cb);
    return () => {
        collectionListeners.delete(cb);
    };
}

export function getCollections(): readonly ChatCollection[] {
    if (!collectionCache) collectionCache = readCollections();
    return collectionCache;
}

export function getCollectionsServer(): readonly ChatCollection[] {
    return EMPTY_COLLECTIONS;
}

function withoutChats(list: readonly ChatCollection[], chatIds: string[]): ChatCollection[] {
    const drop = new Set(chatIds);
    return list
        .map((collection) => ({
            ...collection,
            chatIds: collection.chatIds.filter((id) => !drop.has(id)),
        }))
        .filter((collection) => collection.chatIds.length > 0);
}

export function createCollection(input: {
    name: string;
    icon: CollectionIcon;
    color: ChatColor;
    chatIds: string[];
}): ChatCollection {
    const chatIds = [...new Set(input.chatIds.filter(Boolean))];
    const collection: ChatCollection = {
        id: `col-${Date.now().toString(36)}`,
        name: input.name.trim() || "Collection",
        icon: input.icon,
        color: input.color,
        chatIds,
    };
    writeCollections([...withoutChats(getCollections(), chatIds), collection]);
    return collection;
}

export function updateCollection(
    id: string,
    patch: Partial<Pick<ChatCollection, "name" | "icon" | "color" | "chatIds">>,
) {
    const current = getCollections();
    const chatIds = patch.chatIds ? [...new Set(patch.chatIds.filter(Boolean))] : undefined;
    const base = chatIds ? withoutChats(current, chatIds) : [...current];
    writeCollections(
        base
            .map((collection) => {
                if (collection.id !== id) return collection;
                return {
                    ...collection,
                    ...patch,
                    name: patch.name?.trim() || collection.name,
                    chatIds: chatIds ?? collection.chatIds,
                };
            })
            .filter((collection) => collection.chatIds.length > 0),
    );
}

export function deleteCollection(id: string) {
    writeCollections(getCollections().filter((collection) => collection.id !== id));
}

export function setChatColor(id: string, color: ChatColor | null) {
    const next: Record<string, ChatColor> = { ...getChatColors() };
    if (color) next[id] = color;
    else delete next[id];
    try {
        window.localStorage.setItem(COLOR_KEY, JSON.stringify(next));
    } catch {
        /* ignore */
    }
    colorCache = Object.keys(next).length === 0 ? EMPTY_COLORS : next;
    for (const l of colorListeners) l();
}

export function clearChatUnread(id: string) {
    if (!id) return;
    const next = new Set(getUnreadChatIds());
    if (!next.delete(id)) return;
    writeSet(UNREAD_KEY, next);
    unreadCache = next.size === 0 ? EMPTY : next;
    for (const l of unreadListeners) l();
}
