"use client";

/**
 * Design Mode preview runner.
 * Uses the shared background Run (`pty_spawn_run` in Rust) — same process the
 * Terminal tab attaches to. Ready comes from Rust (`preview-ready` scrape + TCP).
 */

import { commands } from "@/lib/backend";
import {
    ensureBackgroundRun,
    getBackgroundRunPtyId,
    getLastPreviewReadyUrl,
    sameDevCommand,
    stopBackgroundRun,
    subscribePreviewReady,
} from "@/features/terminal/background-run";

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
    command: string | null;
    /** Kept for API compat; UI no longer shows a console panel. */
    console: string;
};

let state: SessionState = {
    phase: "idle",
    url: null,
    error: null,
    command: null,
    console: "",
};
const listeners = new Set<Listener>();
let gen = 0;
let phaseTimer: ReturnType<typeof setTimeout> | null = null;
let readyTimer: ReturnType<typeof setTimeout> | null = null;
let unReady: (() => void) | null = null;
/** When true, Exit should kill the background run we started. */
let ownsRun = false;

function emit() {
    for (const l of listeners) l();
}

function setState(patch: Partial<SessionState>) {
    state = { ...state, ...patch };
    emit();
}

function clearTimers() {
    if (phaseTimer) {
        clearTimeout(phaseTimer);
        phaseTimer = null;
    }
    if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = null;
    }
}

function disposeReady() {
    try {
        unReady?.();
    } catch {
        /* ignore */
    }
    unReady = null;
}

function schedulePhases(myGen: number) {
    const steps: Array<{ ms: number; phase: DesignPreviewPhase }> = [
        { ms: 200, phase: "starting" },
        { ms: 900, phase: "compiling" },
        { ms: 2800, phase: "almost" },
    ];
    let i = 0;
    const tick = () => {
        if (myGen !== gen) return;
        if (state.phase === "ready" || state.phase === "error" || state.phase === "idle") return;
        const step = steps[i++];
        if (!step) return;
        setState({ phase: step.phase });
        const next = steps[i];
        phaseTimer = setTimeout(tick, next ? next.ms - step.ms : 1500);
    };
    phaseTimer = setTimeout(tick, steps[0]!.ms);
}

function scheduleReadyTimeout(myGen: number) {
    readyTimer = setTimeout(() => {
        if (myGen !== gen) return;
        if (state.phase === "ready" || state.phase === "idle") return;
        clearTimers();
        setState({
            phase: "error",
            error: "Preview never became ready. Check the Run tab for server output.",
        });
    }, 50_000);
}

function normalizeLocal(raw: string): string {
    try {
        const u = new URL(raw.includes("://") ? raw : `http://${raw}`);
        if (u.hostname === "0.0.0.0" || u.hostname === "[::1]" || u.hostname === "::1") {
            u.hostname = "127.0.0.1";
        }
        if (u.hostname === "localhost") u.hostname = "127.0.0.1";
        let s = u.toString();
        if (!s.endsWith("/")) s += "/";
        return s;
    } catch {
        return raw;
    }
}

function markReady(myGen: number, url: string) {
    if (myGen !== gen) return;
    if (state.phase === "ready" && state.url) return;
    clearTimers();
    setState({ phase: "ready", url: normalizeLocal(url), error: null });
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

/** Prefer binding Next to IPv4 so TCP probe + iframe work on Windows. */
export function preferIpv4DevCommand(command: string): string {
    const t = command.trim();
    // Hostname binding is applied in Rust (`pty_spawn_run`). Never append
    // `-- -H` here — it collapsed to `---H` under Windows cmd.exe.
    if (/--hostname\b| -H\s| -H$|---H/i.test(t)) return t.replace(/---H/gi, "-- --hostname");
    return t;
}

/**
 * Exit Design Mode tracking. Does not kill a run the user started via Play —
 * only kills if Design Mode started it.
 */
export async function stopDesignPreview() {
    const myGen = ++gen;
    clearTimers();
    disposeReady();
    const kill = ownsRun;
    ownsRun = false;
    setState({
        phase: "idle",
        url: null,
        error: null,
        command: null,
        console: "",
    });
    if (kill) {
        await stopBackgroundRun();
    }
    void myGen;
}

/** Strict remount — keep the background run alive. */
export function detachDesignPreview() {
    // no-op
}

export async function startDesignPreview(command: string, hint?: string | null) {
    const trimmed = preferIpv4DevCommand(command.trim());
    if (!trimmed) {
        setState({ phase: "error", error: "No start script found", url: null, console: "" });
        return;
    }

    // Already booting/ready for this command (Strict remount) — do not respawn.
    if (
        state.command
        && sameDevCommand(state.command, trimmed)
        && (state.phase === "preparing"
            || state.phase === "starting"
            || state.phase === "compiling"
            || state.phase === "almost"
            || state.phase === "ready")
    ) {
        if (state.phase === "ready" && state.url) return;
        const existing = getLastPreviewReadyUrl();
        if (existing) {
            markReady(gen, existing);
        }
        return;
    }

    // Live Run tab / previous Design session — attach, don't spawn a second Next.
    const liveUrl = getLastPreviewReadyUrl();
    if (liveUrl && getBackgroundRunPtyId() != null) {
        const myGen = ++gen;
        clearTimers();
        disposeReady();
        setState({
            phase: "almost",
            url: null,
            error: null,
            command: trimmed,
            console: "",
        });
        unReady = subscribePreviewReady((url) => {
            markReady(myGen, url);
        });
        markReady(myGen, liveUrl);
        return;
    }

    const myGen = ++gen;
    clearTimers();
    disposeReady();

    setState({
        phase: "preparing",
        url: null,
        error: null,
        command: trimmed,
        console: "",
    });

    const hintUrl = hint ? normalizeLocal(hint) : null;
    void hintUrl;

    schedulePhases(myGen);
    scheduleReadyTimeout(myGen);

    unReady = subscribePreviewReady((url) => {
        markReady(myGen, url);
    });

    try {
        const before = getLastPreviewReadyUrl();
        await ensureBackgroundRun(trimmed);
        ownsRun = true;
        const after = getLastPreviewReadyUrl();
        if (after && after !== before) {
            markReady(myGen, after);
        }
        void (async () => {
            for (let i = 0; i < 120; i++) {
                if (myGen !== gen || state.phase === "ready") return;
                const owned = getLastPreviewReadyUrl();
                if (owned && owned !== before) {
                    markReady(myGen, owned);
                    return;
                }
                await new Promise((r) => setTimeout(r, 400));
            }
        })();
    } catch (err) {
        if (myGen !== gen) return;
        clearTimers();
        setState({
            phase: "error",
            error: err instanceof Error ? err.message : String(err),
        });
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
