"use client";

import { useSyncExternalStore } from "react";

export const WORKSPACE_MODES = [
    { id: "Code", verb: "Build", icon: "/code.png" },
    { id: "Chat", verb: "Ask", icon: "/chat.png" },
    { id: "GTM", verb: "Launch", icon: "/gtm.png" },
    { id: "Cowork", verb: "Plan", icon: "/cowork.png" },
] as const;

export function isTalkWorkspace(id: string) {
    return id === "Chat" || id === "GTM" || id === "Cowork";
}

export type WorkspaceModeId = (typeof WORKSPACE_MODES)[number]["id"];

const KEY = "shape:workspace-mode";

let current: WorkspaceModeId = "Code";
const listeners = new Set<() => void>();

function isMode(value: string | null): value is WorkspaceModeId {
    return WORKSPACE_MODES.some((mode) => mode.id === value);
}

function readStored() {
    try {
        const stored = localStorage.getItem(KEY);
        if (isMode(stored)) current = stored;
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
    return useSyncExternalStore(subscribe, () => current, () => "Code" as WorkspaceModeId);
}

export function getWorkspaceMode(): WorkspaceModeId {
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
