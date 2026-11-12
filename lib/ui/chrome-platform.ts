"use client";

import { useSyncExternalStore } from "react";

export type ChromeKind = "windows" | "macos" | "linux";

const STORAGE_KEY = "shape:chrome-preview";
const QUERY_KEY = "shape-chrome";
const CHANGE_EVENT = "shape-chrome-preview";

const listeners = new Set<() => void>();

function parseChrome(value: string | null | undefined): ChromeKind | null {
    const normalized = value?.trim().toLowerCase();
    if (normalized === "macos" || normalized === "mac" || normalized === "darwin") return "macos";
    if (normalized === "windows" || normalized === "win") return "windows";
    if (normalized === "linux") return "linux";
    return null;
}

export function nativeChromeKind(): ChromeKind {
    if (typeof navigator === "undefined") return "windows";
    const platform = (navigator.platform || "").toLowerCase();
    const userAgent = (navigator.userAgent || "").toLowerCase();
    if (platform.includes("mac") || userAgent.includes("mac os")) return "macos";
    if (platform.includes("linux") || userAgent.includes("linux")) return "linux";
    return "windows";
}

function previewChromeKind(): ChromeKind | null {
    if (typeof window !== "undefined") {
        const fromQuery = parseChrome(new URLSearchParams(window.location.search).get(QUERY_KEY));
        if (fromQuery) return fromQuery;
        try {
            const stored = parseChrome(window.localStorage.getItem(STORAGE_KEY));
            if (stored) return stored;
        } catch {
            /* ignore */
        }
    }
    return parseChrome(process.env.NEXT_PUBLIC_SHAPE_CHROME);
}

export function resolveChromeKind(): ChromeKind {
    return previewChromeKind() ?? nativeChromeKind();
}

export function chromePreviewOverride(): ChromeKind | "auto" {
    return previewChromeKind() ?? "auto";
}

export function setChromePreview(kind: ChromeKind | "auto") {
    if (typeof window === "undefined") return;
    try {
        if (kind === "auto") window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, kind);
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
    emitChrome();
}

function emitChrome() {
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (typeof window !== "undefined") {
        window.addEventListener(CHANGE_EVENT, listener);
        window.addEventListener("storage", listener);
    }
    return () => {
        listeners.delete(listener);
        if (typeof window !== "undefined") {
            window.removeEventListener(CHANGE_EVENT, listener);
            window.removeEventListener("storage", listener);
        }
    };
}

export function useChromeKind(): ChromeKind {
    return useSyncExternalStore(subscribe, resolveChromeKind, nativeChromeKind);
}

export function useChromePreviewOverride(): ChromeKind | "auto" {
    return useSyncExternalStore(subscribe, chromePreviewOverride, () => "auto" as const);
}

export function applyChromeDataset(root: HTMLElement, kind: ChromeKind) {
    root.dataset.chrome = kind;
}

/** Traffic-light cluster width + left margin (macOS overlay chrome). */
export const TRAFFIC_LIGHTS_INSET = 78;
export const WINDOWS_CONTROLS_WIDTH = 46 * 3;
