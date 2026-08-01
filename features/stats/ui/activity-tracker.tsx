"use client";

import { useEffect, useRef } from "react";
import { commands, useProjectState } from "@/lib/backend";
import { useChatStreamOptional } from "@/features/chat/lib/chat-stream-store";
import { isMainTauriWindow, isTauriRuntime } from "@/lib/tauri-window";

const TICK_MS = 15_000;
const IDLE_MS = 90_000;

/**
 * Local activity logger for project statistics.
 * Runs only in the main workbench window — records coding / AI / focused time.
 */
export function ProjectStatsActivityTracker() {
    const { project_path } = useProjectState();
    const stream = useChatStreamOptional();
    const lastInputRef = useRef(Date.now());
    const aiGeneratingRef = useRef(false);

    useEffect(() => {
        aiGeneratingRef.current = !!stream.isLoading;
    }, [stream.isLoading]);

    useEffect(() => {
        if (!isTauriRuntime() || !project_path) return;

        let disposed = false;
        let timer: number | undefined;
        const cleanups: Array<() => void> = [];

        void isMainTauriWindow().then((isMain) => {
            if (disposed || !isMain) return;

            const markInput = () => {
                lastInputRef.current = Date.now();
            };
            window.addEventListener("keydown", markInput, true);
            window.addEventListener("pointerdown", markInput, true);
            window.addEventListener("mousemove", markInput, { passive: true, capture: true });
            cleanups.push(() => {
                window.removeEventListener("keydown", markInput, true);
                window.removeEventListener("pointerdown", markInput, true);
                window.removeEventListener("mousemove", markInput, true);
            });

            timer = window.setInterval(() => {
                const focused = document.hasFocus() && !document.hidden;
                const recentlyActive = Date.now() - lastInputRef.current < IDLE_MS;
                const delta: {
                    codingMs?: number;
                    aiGeneratingMs?: number;
                    focusedMs?: number;
                } = {};

                if (focused) {
                    delta.focusedMs = TICK_MS;
                    if (recentlyActive) delta.codingMs = TICK_MS;
                }
                if (aiGeneratingRef.current) {
                    delta.aiGeneratingMs = TICK_MS;
                }

                if (!delta.codingMs && !delta.aiGeneratingMs && !delta.focusedMs) return;

                void commands.recordProjectActivity(delta, project_path).catch(() => undefined);
            }, TICK_MS);
        });

        return () => {
            disposed = true;
            if (timer !== undefined) window.clearInterval(timer);
            cleanups.forEach((fn) => fn());
        };
    }, [project_path]);

    return null;
}
