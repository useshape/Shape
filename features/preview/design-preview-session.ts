"use client";

/**
 * Private Design Mode preview runner — not the agent Run / Terminal.
 * Spawns a PTY, scrapes localhost URL from output, kills on stop.
 */

import { getProjectPath } from "@/lib/backend";
import { resolveDefaultTerminalShell } from "@/lib/settings";

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g;
const URL_RE =
    /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::(\d+))?/gi;

export type DesignPreviewPhase =
    | "idle"
    | "preparing"
    | "starting"
    | "compiling"
    | "almost"
    | "ready"
    | "error";

type Listener = () => void;

type SessionState = {
    phase: DesignPreviewPhase;
    url: string | null;
    error: string | null;
    ptyId: number | null;
    command: string | null;
};

const COMMON_PORTS = [3000, 5173, 4173, 8080, 8000, 4200, 4321, 5000, 24678];

let state: SessionState = {
    phase: "idle",
    url: null,
    error: null,
    ptyId: null,
    command: null,
};
const listeners = new Set<Listener>();
let gen = 0;
let unlistenOut: (() => void) | null = null;
let unlistenExit: (() => void) | null = null;
let phaseTimer: ReturnType<typeof setTimeout> | null = null;
let probeTimer: ReturnType<typeof setInterval> | null = null;

function emit() {
    for (const l of listeners) l();
}

function setState(patch: Partial<SessionState>) {
    state = { ...state, ...patch };
    emit();
}

function clearPhaseTimer() {
    if (phaseTimer) {
        clearTimeout(phaseTimer);
        phaseTimer = null;
    }
}

function clearProbeTimer() {
    if (probeTimer) {
        clearInterval(probeTimer);
        probeTimer = null;
    }
}

function schedulePhases(myGen: number) {
    clearPhaseTimer();
    const steps: Array<{ ms: number; phase: DesignPreviewPhase }> = [
        { ms: 300, phase: "starting" },
        { ms: 900, phase: "compiling" },
        { ms: 2000, phase: "almost" },
    ];
    let i = 0;
    const tick = () => {
        if (myGen !== gen) return;
        if (state.phase === "ready" || state.phase === "error" || state.phase === "idle") return;
        const step = steps[i++];
        if (!step) return;
        setState({ phase: step.phase });
        phaseTimer = setTimeout(tick, steps[i] ? steps[i]!.ms - step.ms : 1500);
    };
    phaseTimer = setTimeout(tick, steps[0]!.ms);
}

function markReady(myGen: number, url: string) {
    if (myGen !== gen) return;
    clearPhaseTimer();
    clearProbeTimer();
    setState({ phase: "ready", url: normalizeLocal(url), error: null });
}

async function disposeListeners() {
    try {
        unlistenOut?.();
    } catch {
        /* ignore */
    }
    try {
        unlistenExit?.();
    } catch {
        /* ignore */
    }
    unlistenOut = null;
    unlistenExit = null;
}

async function killPty(id: number | null) {
    if (id == null) return;
    try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("pty_kill", { id });
    } catch {
        /* ignore */
    }
}

function scrapeUrl(chunk: string): string | null {
    const clean = chunk.replace(ANSI_RE, "");
    const matches = [...clean.matchAll(URL_RE)];
    if (matches.length === 0) return null;
    return normalizeLocal(matches[matches.length - 1]![0]!);
}

async function probeUrl(url: string): Promise<boolean> {
    try {
        const { commands } = await import("@/lib/backend");
        return await commands.probePreviewUrl(url);
    } catch {
        return false;
    }
}

function startPortProbing(myGen: number, urlHint: string | null) {
    clearProbeTimer();
    const candidates: string[] = [];
    if (urlHint) candidates.push(normalizeLocal(urlHint));
    for (const port of COMMON_PORTS) {
        const u = `http://127.0.0.1:${port}`;
        if (!candidates.includes(u)) candidates.push(u);
    }

    let idx = 0;
    const tick = () => {
        if (myGen !== gen || state.phase === "ready" || state.phase === "error") {
            clearProbeTimer();
            return;
        }
        const url = candidates[idx % candidates.length]!;
        idx += 1;
        void probeUrl(url).then((ok) => {
            if (ok) markReady(myGen, url);
        });
    };

    window.setTimeout(tick, 400);
    probeTimer = setInterval(tick, 700);
}

export function getDesignPreviewSnapshot(): SessionState {
    return state;
}

export function subscribeDesignPreview(cb: Listener) {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

export async function stopDesignPreview() {
    const myGen = ++gen;
    clearPhaseTimer();
    clearProbeTimer();
    await disposeListeners();
    const id = state.ptyId;
    setState({
        phase: "idle",
        url: null,
        error: null,
        ptyId: null,
        command: null,
    });
    await killPty(id);
    void myGen;
}

export async function startDesignPreview(command: string, urlHint?: string | null) {
    const trimmed = command.trim();
    if (!trimmed) {
        setState({ phase: "error", error: "No start script found", url: null });
        return;
    }

    const myGen = ++gen;
    clearPhaseTimer();
    clearProbeTimer();
    await disposeListeners();
    const prevId = state.ptyId;
    setState({
        phase: "preparing",
        url: null,
        error: null,
        ptyId: null,
        command: trimmed,
    });
    await killPty(prevId);

    schedulePhases(myGen);
    startPortProbing(myGen, urlHint ?? null);

    try {
        const { invoke } = await import("@tauri-apps/api/core");
        const { listen } = await import("@tauri-apps/api/event");
        const cwd = getProjectPath();
        const shell = resolveDefaultTerminalShell();
        const clientId = Math.floor(100_000 + Math.random() * 2_000_000_000);

        const ptyId = await invoke<number>("pty_spawn", {
            cwd: cwd ?? null,
            shell,
            clientId,
            rows: 24,
            cols: 80,
        });

        if (myGen !== gen) {
            await killPty(ptyId);
            return;
        }

        setState({ ptyId });

        unlistenOut = await listen<{ id: number; data: string }>("pty-output", (ev) => {
            if (myGen !== gen || ev.payload.id !== ptyId) return;
            const found = scrapeUrl(ev.payload.data);
            if (found) markReady(myGen, found);
        });

        unlistenExit = await listen<{ id: number; exit_code: number | null }>("pty-exit", (ev) => {
            if (myGen !== gen || ev.payload.id !== ptyId) return;
            if (state.phase !== "ready") {
                clearPhaseTimer();
                clearProbeTimer();
                setState({
                    phase: "error",
                    error: "Preview process exited",
                    ptyId: null,
                });
            } else {
                setState({ ptyId: null });
            }
        });

        let wrote = false;
        for (let attempt = 0; attempt < 10; attempt++) {
            if (myGen !== gen) return;
            await new Promise((r) => setTimeout(r, 60 + attempt * 50));
            try {
                await invoke("pty_write", { id: ptyId, data: `${trimmed}\r\n` });
                wrote = true;
                break;
            } catch {
                /* retry */
            }
        }
        if (!wrote && myGen === gen) {
            clearPhaseTimer();
            clearProbeTimer();
            setState({ phase: "error", error: "Could not start preview", ptyId: null });
            await killPty(ptyId);
        }
    } catch (err) {
        if (myGen !== gen) return;
        clearPhaseTimer();
        clearProbeTimer();
        setState({
            phase: "error",
            error: err instanceof Error ? err.message : String(err),
            ptyId: null,
        });
    }
}

function normalizeLocal(raw: string): string {
    try {
        const u = new URL(raw.includes("://") ? raw : `http://${raw}`);
        if (u.hostname === "0.0.0.0" || u.hostname === "[::1]") u.hostname = "127.0.0.1";
        if (u.hostname === "localhost") u.hostname = "127.0.0.1";
        return u.toString().replace(/\/$/, "");
    } catch {
        return raw;
    }
}

export function designPhaseLabel(phase: DesignPreviewPhase): string {
    switch (phase) {
        case "preparing":
            return "Preparing";
        case "starting":
            return "Starting";
        case "compiling":
            return "Compiling";
        case "almost":
            return "Almost ready";
        case "ready":
            return "Ready";
        case "error":
            return "Something went wrong";
        default:
            return "Loading";
    }
}
