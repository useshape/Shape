import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { commands } from "@/lib/backend/commands";
import { ProjectState } from "@/lib/backend/types";

const initialState: ProjectState = {
    project_path: null,
    open_files: [],
    active_file: null,
};

let currentState: ProjectState = initialState;
const subscribers = new Set<() => void>();
let initialized = false;

function emitState() {
    subscribers.forEach((listener) => listener());
}

function initializeStateBridge() {
    if (initialized || typeof window === "undefined") return;
    initialized = true;

    commands
        .getProjectState()
        .then((next) => {
            currentState = next;
            emitState();
        })
        .catch(console.error);

    listen<ProjectState>("project-state-update", (event) => {
        const next = event.payload;
        const current = currentState;

        let changed = false;
        if (current.project_path !== next.project_path) changed = true;
        if (current.active_file !== next.active_file) changed = true;

        const openFilesChanged = JSON.stringify(current.open_files) !== JSON.stringify(next.open_files);

        if (changed || openFilesChanged) {
            currentState = {
                project_path: next.project_path,
                active_file: next.active_file,
                open_files: openFilesChanged ? next.open_files : current.open_files,
            };
            emitState();
        }
    }).catch(console.error);
}

function subscribe(listener: () => void) {
    initializeStateBridge();
    subscribers.add(listener);
    return () => {
        subscribers.delete(listener);
    };
}

function getSnapshot() {
    return currentState;
}

export function useProjectState() {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Sync getter for use outside React components (e.g. click handlers in renderers). */
export function getProjectPath(): string | null {
    initializeStateBridge();
    return currentState.project_path;
}

export function getProjectSnapshot(): ProjectState {
    initializeStateBridge();
    return currentState;
}

/** Subscribe to project state changes outside React. */
export function subscribeProjectState(listener: () => void): () => void {
    return subscribe(listener);
}
