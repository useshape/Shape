/**
 * Module-level background Run — survives React remounts and works with the
 * Terminal panel closed. Design Mode and the play button both use this.
 * Rust owns spawn (`pty_spawn_run`), URL scrape, and TCP probe.
 */

import { getProjectPath } from "@/lib/backend";
import {
    clearDevRun,
    noteDevRunExit,
    noteDevRunOutput,
    setDevRunPtyId,
    startDevRun,
    getDevRunSnapshot,
} from "@/features/preview/run-status";
import {
    registerBoundTerminalTab,
    terminalSessionStore,
} from "@/features/terminal/session";
import { resolveDefaultTerminalShell } from "@/lib/settings";

type ReadyListener = (url: string) => void;

type Runtime = {
    ptyId: number;
    command: string;
    cwd: string;
    unOut: () => void;
    unExit: () => void;
    unReady: () => void;
};

let runtime: Runtime | null = null;
let starting: { command: string; cwd: string; promise: Promise<number> } | null = null;
const readyListeners = new Set<ReadyListener>();
let lastReadyUrl: string | null = null;

function preferIpv4DevCommand(command: string): string {
    const t = command.trim();
    // Rust `pty_spawn_run` applies `-- --hostname 127.0.0.1`. Do not append
    // `-- -H` here — Windows cmd joining collapsed it into the broken `---H`.
    if (/--hostname\b| -H\s| -H$|---H/i.test(t)) return t.replace(/---H/gi, "-- --hostname");
    return t;
}

/** Compare run commands ignoring hostname flags Rust may add. */
export function sameDevCommand(a: string, b: string): boolean {
    const strip = (s: string) =>
        s
            .replace(/\s+--\s+--hostname\s+\S+/gi, "")
            .replace(/\s+--hostname\s+\S+/gi, "")
            .replace(/\s+/g, " ")
            .trim();
    return strip(a) === strip(b);
}

export function getBackgroundRunPtyId(): number | null {
    return runtime?.ptyId ?? getDevRunSnapshot().ptyId;
}

export function getBackgroundRunCommand(): string | null {
    return runtime?.command ?? getDevRunSnapshot().command;
}

export function getBackgroundRunCwd(): string | null {
    return runtime?.cwd ?? null;
}

export function getLastPreviewReadyUrl(): string | null {
    return lastReadyUrl;
}

export function subscribePreviewReady(cb: ReadyListener): () => void {
    readyListeners.add(cb);
    if (lastReadyUrl) {
        try {
            cb(lastReadyUrl);
        } catch {
            /* ignore */
        }
    }
    return () => {
        readyListeners.delete(cb);
    };
}

function emitReady(url: string) {
    lastReadyUrl = url;
    for (const l of readyListeners) {
        try {
            l(url);
        } catch {
            /* ignore */
        }
    }
}

async function attachListeners(ptyId: number) {
    const { listen } = await import("@tauri-apps/api/event");

    const unOut = await listen<{ id: number; data: string }>("pty-output", (ev) => {
        if (ev.payload.id !== ptyId) return;
        terminalSessionStore.appendPtyOutput(ptyId, ev.payload.data);
        noteDevRunOutput(ev.payload.data);
    });

    const unExit = await listen<{ id: number; exit_code?: number | null }>("pty-exit", (ev) => {
        if (ev.payload.id !== ptyId) return;
        noteDevRunExit(ev.payload.exit_code ?? 0);
        if (runtime?.ptyId === ptyId) {
            runtime.unOut();
            runtime.unExit();
            runtime.unReady();
            runtime = null;
        }
    });

    const unReady = await listen<{ id: number; url: string }>("preview-ready", (ev) => {
        if (ev.payload.id !== ptyId) return;
        console.info("[preview] ready event", ev.payload.url);
        emitReady(ev.payload.url);
    });

    return { unOut, unExit, unReady };
}

/**
 * Ensure a background run is alive for `command`. Idempotent for the same
 * command — Strict Mode remounts will not kill/respawn.
 */
export async function ensureBackgroundRun(command: string, cwdOverride?: string): Promise<number> {
    const trimmed = preferIpv4DevCommand(command);
    if (!trimmed) throw new Error("Empty run command");

    const cwd = cwdOverride || getProjectPath();
    if (!cwd) throw new Error("No project open");
    const sameCwd = (a: string, b: string) =>
        a.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
        === b.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

    if (runtime && sameDevCommand(runtime.command, trimmed) && sameCwd(runtime.cwd, cwd)) {
        return runtime.ptyId;
    }
    if (starting) {
        const pending = starting;
        if (sameDevCommand(pending.command, trimmed) && sameCwd(pending.cwd, cwd)) {
            return pending.promise;
        }
        try {
            await pending.promise;
        } catch {
            // The new project still gets its own start attempt below.
        }
        return ensureBackgroundRun(trimmed, cwd);
    }

    const promise = (async () => {
        if (runtime) {
            await stopBackgroundRun();
        }

        startDevRun(trimmed);
        lastReadyUrl = null;

        // Listen for preview-ready BEFORE spawn. Next can boot in <1s; attaching
        // after invoke was racing the event and leaving Design Mode on a white canvas.
        const { listen } = await import("@tauri-apps/api/event");
        const { invoke } = await import("@tauri-apps/api/core");
        const spawnId: { current: number | null } = { current: null };
        const earlyReady = await listen<{ id: number; url: string }>("preview-ready", (ev) => {
            if (spawnId.current === null || ev.payload.id !== spawnId.current) return;
            console.info("[preview] ready event (early)", ev.payload.url);
            emitReady(ev.payload.url);
        });

        console.info("[preview] invoking pty_spawn_run", trimmed);
        const ptyId = await invoke<number>("pty_spawn_run", {
            cwd,
            command: trimmed,
        });
        spawnId.current = ptyId;
        console.info("[preview] pty_spawn_run =>", ptyId);

        setDevRunPtyId(ptyId);
        const listeners = await attachListeners(ptyId);
        earlyReady();

        registerBoundTerminalTab({
            title: `Run: ${trimmed.split(/\s+/).slice(0, 3).join(" ")}`,
            cwd,
            shell: resolveDefaultTerminalShell(),
            boundPtyId: ptyId,
        });

        runtime = {
            ptyId,
            command: trimmed,
            cwd,
            unOut: () => listeners.unOut(),
            unExit: () => listeners.unExit(),
            unReady: () => listeners.unReady(),
        };

        return ptyId;
    })();
    starting = { command: trimmed, cwd, promise };

    try {
        return await promise;
    } finally {
        if (starting?.promise === promise) starting = null;
    }
}

export async function stopBackgroundRun() {
    const current = runtime;
    runtime = null;
    lastReadyUrl = null;
    if (!current) {
        clearDevRun();
        return;
    }
    try {
        current.unOut();
        current.unExit();
        current.unReady();
    } catch {
        /* ignore */
    }
    try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("pty_kill", { id: current.ptyId });
    } catch {
        /* ignore */
    }
    terminalSessionStore.clearPtyScrollback(current.ptyId);
    clearDevRun();
}
