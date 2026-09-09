"use client";

import { useSyncExternalStore } from "react";

export type DevRunStatus = "idle" | "starting" | "running" | "error";

type State = {
    status: DevRunStatus;
    command: string | null;
    ptyId: number | null;
};

let state: State = { status: "idle", command: null, ptyId: null };
const listeners = new Set<() => void>();
let startingTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
    for (const l of listeners) l();
}

function clearStartingTimer() {
    if (startingTimer) {
        clearTimeout(startingTimer);
        startingTimer = null;
    }
}

const READY_RE =
    /\b(ready|started|listening|compiled successfully|local:|network:|✓ ready|ready in|Local:\s+http|➜\s+Local|VITE\s+v|webpack compiled|Next\.js|serving at)\b/i;
const URL_RE = /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+/i;
const ERR_RE =
    /\b(error|EADDRINUSE|ECONNREFUSED|failed to compile|ELIFECYCLE|panic|fatal|crash|exited with code [1-9])/i;

export function startDevRun(command: string, ptyId?: number | null) {
    clearStartingTimer();
    state = { status: "starting", command, ptyId: ptyId ?? state.ptyId };
    emit();
    startingTimer = setTimeout(() => {
        if (state.status === "starting") {
            state = { ...state, status: "running" };
            emit();
        }
    }, 14_000);
}

export function setDevRunPtyId(ptyId: number | null) {
    state = { ...state, ptyId };
    emit();
}

export function noteDevRunOutput(chunk: string) {
    if (state.status === "idle") return;
    if (ERR_RE.test(chunk) && !READY_RE.test(chunk) && !URL_RE.test(chunk)) {
        clearStartingTimer();
        state = { ...state, status: "error" };
        emit();
        return;
    }
    if (READY_RE.test(chunk) || URL_RE.test(chunk)) {
        clearStartingTimer();
        state = { ...state, status: "running" };
        emit();
    }
}

export function noteDevRunExit(code: number | null) {
    clearStartingTimer();
    if (state.status === "idle") return;
    if (code === 0) {
        state = { status: "idle", command: null, ptyId: null };
    } else {
        state = { ...state, status: "error", ptyId: null };
    }
    emit();
}

export function clearDevRun() {
    clearStartingTimer();
    state = { status: "idle", command: null, ptyId: null };
    emit();
}

export function getDevRunSnapshot(): State {
    return state;
}

function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

function getSnapshot() {
    return state;
}

export function useDevRunStatus() {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
