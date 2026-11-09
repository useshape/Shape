"use client";

import { useSyncExternalStore } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

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
    path?: string;
    seq?: number;
    console?: string[];
    error?: string;
};

let frame: BrowseFrame | null = null;
const listeners = new Set<() => void>();
let listening = false;

function emit() {
    for (const listener of listeners) listener();
}

function srcFromPayload(payload: Payload, previous: string): string {
    const path = payload.path?.trim();
    if (path) {
        try {
            const base = convertFileSrc(path);
            return payload.seq != null ? `${base}?v=${payload.seq}` : base;
        } catch {
            return previous;
        }
    }
    if (payload.image) return payload.image;
    return previous;
}

export function applyBrowsePayload(payload: Payload) {
    const status = payload.status === "stopped" || payload.status === "loading" || payload.status === "error"
        ? payload.status
        : "controlling";
    if (status === "stopped" && !payload.image && !payload.path) {
        if (frame) frame = { ...frame, status: "stopped" };
        emit();
        return;
    }
    frame = {
        id: payload.id || frame?.id || "live",
        status,
        url: payload.url || frame?.url || "",
        title: payload.title || frame?.title || "",
        image: status === "error" ? "" : srcFromPayload(payload, frame?.image || ""),
        x: typeof payload.x === "number" ? payload.x : frame?.x ?? 50,
        y: typeof payload.y === "number" ? payload.y : frame?.y ?? 50,
        console: payload.console || frame?.console || [],
        error: status === "error" ? (payload.error || frame?.error || "This site can't be reached") : "",
    };
    emit();
}

export function getBrowseFrame(): BrowseFrame | null {
    return frame;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    ensureBrowseListener();
    return () => listeners.delete(listener);
}

export function useBrowseFrame(): BrowseFrame | null {
    return useSyncExternalStore(subscribe, getBrowseFrame, getBrowseFrame);
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
