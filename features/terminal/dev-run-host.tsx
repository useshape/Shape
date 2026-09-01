"use client";

import { useEffect, useRef } from "react";
import { getProjectPath } from "@/lib/backend";
import { resolveDefaultTerminalShell } from "@/lib/settings";
import {
    clearDevRun,
    noteDevRunExit,
    noteDevRunOutput,
    setDevRunPtyId,
    startDevRun,
    useDevRunStatus,
} from "@/features/preview/run-status";
import {
    registerBoundTerminalTab,
    terminalSessionStore,
} from "@/features/terminal/session";

/**
 * Always-mounted: Run works even when the Terminal workspace tab is closed.
 * Spawns a PTY in the background, tracks ready/error for the play badge,
 * buffers scrollback so opening Terminal later shows prior output,
 * and registers a tab so it appears when Terminal is opened.
 */
export function DevRunHost() {
    const run = useDevRunStatus();
    const runRef = useRef(run);
    const activePtyRef = useRef<number | null>(null);
    const cleanupsRef = useRef<Array<() => void>>([]);

    useEffect(() => {
        runRef.current = run;
        activePtyRef.current = run.ptyId;
    }, [run]);

    useEffect(() => {
        const disposeListeners = () => {
            for (const c of cleanupsRef.current) {
                try {
                    c();
                } catch {
                    /* ignore */
                }
            }
            cleanupsRef.current = [];
        };

        const killActive = async () => {
            const id = activePtyRef.current;
            if (id == null) {
                clearDevRun();
                return;
            }
            try {
                const { invoke } = await import("@tauri-apps/api/core");
                await invoke("pty_kill", { id });
            } catch {
                /* ignore */
            }
            terminalSessionStore.clearPtyScrollback(id);
            activePtyRef.current = null;
            clearDevRun();
            disposeListeners();
        };

        const spawnRun = async (command: string) => {
            const trimmed = command.trim();
            if (!trimmed) return;

            const current = runRef.current;
            if (
                (current.status === "starting" || current.status === "running") &&
                current.command === trimmed &&
                activePtyRef.current != null
            ) {
                window.dispatchEvent(new CustomEvent("shape-open-workspace-terminal"));
                return;
            }

            if (activePtyRef.current != null) {
                await killActive();
            }

            try {
                startDevRun(trimmed);
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

                activePtyRef.current = ptyId;
                setDevRunPtyId(ptyId);

                const unOut = await listen<{ id: number; data: string }>("pty-output", (ev) => {
                    if (ev.payload.id !== ptyId) return;
                    terminalSessionStore.appendPtyOutput(ptyId, ev.payload.data);
                    noteDevRunOutput(ev.payload.data);
                });
                const unExit = await listen<{ id: number; exit_code: number | null }>(
                    "pty-exit",
                    (ev) => {
                        if (ev.payload.id !== ptyId) return;
                        noteDevRunExit(ev.payload.exit_code ?? 0);
                        activePtyRef.current = null;
                    },
                );
                cleanupsRef.current.push(() => {
                    unOut();
                    unExit();
                });

                registerBoundTerminalTab({
                    title: `Run: ${trimmed.split(/\s+/).slice(0, 3).join(" ")}`,
                    cwd: cwd ?? "global",
                    shell,
                    boundPtyId: ptyId,
                });

                await new Promise((r) => setTimeout(r, 120));
                let wrote = false;
                for (let attempt = 0; attempt < 8; attempt++) {
                    try {
                        await invoke("pty_write", { id: ptyId, data: `${trimmed}\r\n` });
                        wrote = true;
                        break;
                    } catch {
                        await new Promise((r) => setTimeout(r, 80 + attempt * 60));
                    }
                }
                if (!wrote) throw new Error("Session not found");
            } catch (err) {
                console.error("Dev run failed:", err);
                noteDevRunExit(1);
            }
        };

        const onRun = (e: Event) => {
            const command = (e as CustomEvent<{ command?: string }>).detail?.command?.trim();
            if (!command) return;
            void spawnRun(command);
        };

        const onStop = () => {
            void killActive();
        };

        const onRestart = (e: Event) => {
            const detail = (e as CustomEvent<{ command?: string }>).detail;
            const command = detail?.command?.trim() || runRef.current.command;
            void (async () => {
                await killActive();
                if (command) await spawnRun(command);
            })();
        };

        window.addEventListener("shape-terminal-run", onRun as EventListener);
        window.addEventListener("shape-terminal-run-stop", onStop);
        window.addEventListener("shape-terminal-run-restart", onRestart as EventListener);
        return () => {
            window.removeEventListener("shape-terminal-run", onRun as EventListener);
            window.removeEventListener("shape-terminal-run-stop", onStop);
            window.removeEventListener("shape-terminal-run-restart", onRestart as EventListener);
            disposeListeners();
        };
    }, []);

    return null;
}
