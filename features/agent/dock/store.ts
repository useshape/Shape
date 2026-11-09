"use client";

import { useSyncExternalStore } from "react";
import {
    closePanel,
    defaultDock,
    dropPanel,
    focusTab,
    isDockState,
    placePanel,
    resizeSplit,
    toggleMaximize,
    type DockPanel,
    type DockPlace,
    type DockState,
    type DropZone,
} from "./tree";
import { getDockPrefs } from "./prefs";

const KEY = "shape-dock-layout";

let state: DockState = defaultDock("__new_chat__", true, 0.22);
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
    try {
        if (getDockPrefs().restore) localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
        /* ignore */
    }
}

function load() {
    if (typeof window === "undefined") return;
    const prefs = getDockPrefs();
    if (!prefs.restore) {
        state = defaultDock("__new_chat__", prefs.autoTerminal, prefs.terminalSize);
        return;
    }
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || "");
        if (isDockState(raw)) {
            state = { ...raw, chatAnchor: raw.chatAnchor || raw.focused };
        } else {
            state = defaultDock("__new_chat__", prefs.autoTerminal, prefs.terminalSize);
        }
    } catch {
        state = defaultDock("__new_chat__", prefs.autoTerminal, prefs.terminalSize);
    }
}

if (typeof window !== "undefined") load();

export function getDock() {
    return state;
}

export function subscribeDock(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useDock() {
    return useSyncExternalStore(subscribeDock, getDock, getDock);
}

export function resetDock(chatId = "__new_chat__") {
    const prefs = getDockPrefs();
    state = defaultDock(chatId, prefs.autoTerminal, prefs.terminalSize);
    emit();
}

export function dockPlace(panel: DockPanel, place: DockPlace, focus: boolean) {
    state = placePanel(state, panel, place, focus);
    emit();
}

export function dockDrop(panel: DockPanel, groupId: string, zone: DropZone, focus = true) {
    state = dropPanel(state, panel, groupId, zone, focus);
    emit();
}

export function dockFocus(groupId: string, panelId: string) {
    state = focusTab(state, groupId, panelId);
    emit();
}

export function dockResize(splitId: string, index: number, left: number, pair: number) {
    state = resizeSplit(state, splitId, index, left, pair);
    emit();
}

export function dockMaximize(groupId: string) {
    state = toggleMaximize(state, groupId);
    emit();
}

export function dockClose(panelId: string) {
    state = closePanel(state, panelId);
    emit();
}
