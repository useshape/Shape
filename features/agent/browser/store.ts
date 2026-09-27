"use client";

import { useSyncExternalStore } from "react";
import { commands } from "@/lib/backend";
import type { BrowserTab, BrowserTabsPayload } from "@/lib/backend/types";

export type BrowserState = {
    tabs: BrowserTab[];
    activeId: string | null;
    /** Latest frame per tab (data URL). */
    frames: Record<string, string>;
    ready: boolean;
    /** Why the browser engine could not start, if it failed. */
    error: string | null;
};

let state: BrowserState = { tabs: [], activeId: null, frames: {}, ready: false, error: null };

function messageOf(err: unknown): string {
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
    return "The browser engine could not start.";
}
const listeners = new Set<() => void>();
let listening = false;

function emit() {
    for (const listener of listeners) listener();
}

function setState(patch: Partial<BrowserState>) {
    state = { ...state, ...patch };
    emit();
}

function applyTabs(payload: BrowserTabsPayload) {
    const ids = new Set(payload.tabs.map((t) => t.id));
    const frames: Record<string, string> = {};
    for (const [id, image] of Object.entries(state.frames)) {
        if (ids.has(id)) frames[id] = image;
    }
    setState({ tabs: payload.tabs, activeId: payload.activeId, frames, ready: true, error: null });
}

export function ensureBrowserListener() {
    if (listening || typeof window === "undefined") return;
    listening = true;
    void import("@tauri-apps/api/event")
        .then(async ({ listen }) => {
            await listen<BrowserTabsPayload>("browser-tabs", (event) => applyTabs(event.payload));
            await listen<{ tabId: string; image: string }>("browser-frame", (event) => {
                const { tabId, image } = event.payload;
                if (!tabId || !image) return;
                setState({ frames: { ...state.frames, [tabId]: image } });
            });
            try {
                applyTabs(await commands.browserTabs());
            } catch (err) {
                setState({ ready: true, error: messageOf(err) });
            }
        })
        .catch(() => {
            listening = false;
        });
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    ensureBrowserListener();
    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot() {
    return state;
}

export function useBrowserStore(): BrowserState {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function activeBrowserTab(s: BrowserState = state): BrowserTab | null {
    return s.tabs.find((t) => t.id === s.activeId) ?? null;
}

/** Typed text → URL. Bare words go to a web search. */
export function resolveBrowserInput(raw: string): string {
    const s = raw.trim();
    if (!s) return "";
    if (/^(https?|about|file):/i.test(s)) return s;
    if (/^localhost(:\d+)?([/?#].*)?$/i.test(s) || /^127\.0\.0\.1(:\d+)?([/?#].*)?$/.test(s)) {
        return `http://${s}`;
    }
    if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/i.test(s) && !/\s/.test(s)) {
        return `https://${s}`;
    }
    return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}

export async function openBrowserTab(url?: string): Promise<BrowserTab | null> {
    try {
        const resolved = url ? resolveBrowserInput(url) : undefined;
        const tab = await commands.browserOpenTab(resolved || undefined, true);
        if (state.error) setState({ error: null });
        return tab;
    } catch (err) {
        setState({ error: messageOf(err) });
        return null;
    }
}

export function closeBrowserTab(id: string) {
    void commands.browserCloseTab(id).catch(() => {});
}

export function activateBrowserTab(id: string) {
    if (state.activeId === id) return;
    setState({ activeId: id });
    void commands.browserActivateTab(id).catch(() => {});
}

export function navigateBrowser(id: string, raw: string) {
    const url = resolveBrowserInput(raw);
    if (!url) return;
    void commands.browserNavigate(id, url).catch(() => {});
}
