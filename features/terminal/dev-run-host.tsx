"use client";

import { useEffect, useRef } from "react";
import { useDevRunStatus } from "@/features/preview/run-status";
import {
    ensureBackgroundRun,
    sameDevCommand,
    stopBackgroundRun,
} from "@/features/terminal/background-run";

/**
 * Always-mounted: Run works even when the Terminal workspace tab is closed.
 * Delegates to module-level `ensureBackgroundRun` so listeners survive remounts
 * and Design Mode shares the same PTY.
 */
export function DevRunHost() {
    const run = useDevRunStatus();
    const runRef = useRef(run);

    useEffect(() => {
        runRef.current = run;
    }, [run]);

    useEffect(() => {
        const onRun = (e: Event) => {
            const detail = (e as CustomEvent<{ command?: string; background?: boolean }>).detail;
            const command = detail?.command?.trim();
            if (!command) return;

            const current = runRef.current;
            if (
                (current.status === "starting" || current.status === "running")
                && current.command
                && sameDevCommand(current.command, command)
                && current.ptyId != null
            ) {
                // Already running — only open Terminal if the user clicked Play
                // (Design Mode passes background: true and stays put).
                if (!detail?.background) {
                    window.dispatchEvent(new CustomEvent("shape-open-workspace-terminal"));
                }
                return;
            }

            void ensureBackgroundRun(command);
            // Do not force-open Terminal on first start — it keeps running in the
            // background; opening Terminal later shows the bound tab + Rust buffer.
        };

        const onStop = () => {
            void stopBackgroundRun();
        };

        const onRestart = (e: Event) => {
            const detail = (e as CustomEvent<{ command?: string }>).detail;
            const command = detail?.command?.trim() || runRef.current.command;
            void (async () => {
                await stopBackgroundRun();
                if (command) await ensureBackgroundRun(command);
            })();
        };

        window.addEventListener("shape-terminal-run", onRun as EventListener);
        window.addEventListener("shape-terminal-run-stop", onStop);
        window.addEventListener("shape-terminal-run-restart", onRestart as EventListener);
        return () => {
            window.removeEventListener("shape-terminal-run", onRun as EventListener);
            window.removeEventListener("shape-terminal-run-stop", onStop);
            window.removeEventListener("shape-terminal-run-restart", onRestart as EventListener);
            // Do NOT kill the PTY on remount — module-level runtime owns it.
        };
    }, []);

    return null;
}
