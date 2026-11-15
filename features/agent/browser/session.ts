"use client";

import { useSyncExternalStore } from "react";

export type BrowseFrame = {
    id: string;
    status: "controlling" | "stopped" | "loading" | "error";
    url: string;
    title: string;
    image: string;
    x: number;
    y: number;
    console: string[];
    error: string;
};

type Payload = Partial<BrowseFrame> & {
    id?: string;
    conversationId?: string;
    console?: string[];
    error?: string;
};

let frames: Record<string, BrowseFrame> = {};
let activeId: string | null = null;
const listeners = new Set<() => void>();
let listening = false;

function emit() {
    for (const listener of listeners) listener();
}

export function applyBrowsePayload(payload: Payload) {
    const id = (payload.conversationId || activeId || "").trim();
    if (!id) return;
    if (payload.conversationId) activeId = id;
    const status = payload.status === "stopped" || payload.status === "loading" || payload.status === "error"
        ? payload.status
        : "controlling";
    const prev = frames[id];
    if (status === "stopped" && !payload.image) {
        if (!prev) return;
        frames = { ...frames, [id]: { ...prev, status: "stopped" } };
        emit();
        return;
    }
    frames = {
        ...frames,
        [id]: {
            id: payload.id || prev?.id || "live",
            status,
            url: payload.url || prev?.url || "",
            title: payload.title || prev?.title || "",
            image: status === "error" ? "" : (payload.image || prev?.image || ""),
            x: typeof payload.x === "number" ? payload.x : prev?.x ?? 50,
            y: typeof payload.y === "number" ? payload.y : prev?.y ?? 50,
            console: payload.console || prev?.console || [],
            error: status === "error" ? (payload.error || prev?.error || "This site can't be reached") : "",
        },
    };
    emit();
}

export function getBrowseFrame(conversationId?: string | null): BrowseFrame | null {
    const id = conversationId?.trim();
    if (!id) return null;
    return frames[id] ?? null;
}

export function getControllingBrowseFrame(): BrowseFrame | null {
    for (const frame of Object.values(frames)) {
        if (frame.status === "controlling" || frame.status === "loading") return frame;
    }
    return null;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    ensureBrowseListener();
    return () => listeners.delete(listener);
}

export function useBrowseFrame(conversationId?: string | null): BrowseFrame | null {
    const id = conversationId?.trim() || "";
    return useSyncExternalStore(
        subscribe,
        () => (id ? frames[id] ?? null : null),
        () => (id ? frames[id] ?? null : null),
    );
}

/** The one session the agent is driving right now, for the browser pane. */
export function useControllingBrowseFrame(): BrowseFrame | null {
    return useSyncExternalStore(subscribe, getControllingBrowseFrame, getControllingBrowseFrame);
}

export function ensureBrowseListener() {
    if (listening || typeof window === "undefined") return;
    listening = true;
    void import("@tauri-apps/api/event")
        .then(({ listen }) => listen<Payload>("agent-browse", (event) => applyBrowsePayload(event.payload || {})))
        .catch(() => {
            listening = false;
        });
}
