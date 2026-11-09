"use client";

import { useSyncExternalStore } from "react";
import type { DockPlace } from "./tree";

export type DockPrefs = {
    restore: boolean;
    autoTerminal: boolean;
    terminalSize: number;
    chatPlace: DockPlace;
    threadPlace: DockPlace;
    threadFocus: boolean;
    terminalPlace: DockPlace;
};

const KEY = "shape-dock-prefs";

export const DEFAULT_DOCK_PREFS: DockPrefs = {
    restore: true,
    autoTerminal: true,
    terminalSize: 0.22,
    chatPlace: "current",
    threadPlace: "right",
    threadFocus: false,
    terminalPlace: "bottom",
};

let current = DEFAULT_DOCK_PREFS;
const listeners = new Set<() => void>();

function read() {
    if (typeof window === "undefined") return;
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || "") as Partial<DockPrefs>;
        current = { ...DEFAULT_DOCK_PREFS, ...raw };
        current.terminalSize = Math.min(0.45, Math.max(0.12, Number(current.terminalSize) || 0.22));
    } catch {
        current = DEFAULT_DOCK_PREFS;
    }
}

if (typeof window !== "undefined") read();

export function getDockPrefs() {
    return current;
}

export function setDockPrefs(patch: Partial<DockPrefs>) {
    current = { ...current, ...patch };
    try {
        localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
        /* ignore */
    }
    for (const listener of listeners) listener();
    window.dispatchEvent(new CustomEvent("shape-dock-prefs"));
}

export function useDockPrefs() {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getDockPrefs,
        () => DEFAULT_DOCK_PREFS,
    );
}
