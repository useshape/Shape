"use client";

import { useSyncExternalStore } from "react";

export const WORKSPACE_MODES = [
    { id: "Code", verb: "Build", description: "Edit a project with files, terminal, and git" },
    { id: "Chat", verb: "Ask", description: "A conversation that can run tools, scripts, and creative work" },
] as const;

export const WORKSPACE_MODE_ICON = "/code.png";

export function isTalkWorkspace(id: string) {
    return id === "Chat";
}

export type WorkspaceModeId = (typeof WORKSPACE_MODES)[number]["id"];

const KEY = "shape:workspace-mode";

let current: WorkspaceModeId = "Code";
const listeners = new Set<() => void>();

function isMode(value: string | null): value is WorkspaceModeId {
    return WORKSPACE_MODES.some((mode) => mode.id === value);
}

function coerceMode(value: string | null): WorkspaceModeId | null {
    if (value === "GTM" || value === "Cowork" || value === "Image") return "Chat";
    return isMode(value) ? value : null;
}

function readStored() {
    try {
        const stored = localStorage.getItem(KEY);
        const mode = coerceMode(stored);
        if (mode) current = mode;
    } catch {
        /* ignore */
    }
}

if (typeof window !== "undefined") readStored();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useWorkspaceMode() {
    return useSyncExternalStore(subscribe, getWorkspaceMode, () => "Code" as WorkspaceModeId);
}

export function getWorkspaceMode(): WorkspaceModeId {
    const stored = current as string;
    if (stored === "GTM" || stored === "Cowork" || stored === "Image") current = "Chat";
    return current;
}

export function setWorkspaceMode(id: WorkspaceModeId) {
    if (current === id) return;
    current = id;
    try {
        localStorage.setItem(KEY, id);
    } catch {
        /* ignore */
    }
    for (const listener of listeners) listener();
}

export function workspaceMode(id: WorkspaceModeId) {
    return WORKSPACE_MODES.find((mode) => mode.id === id) ?? WORKSPACE_MODES[0];
}
