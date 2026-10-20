"use client";

import { useEffect, useRef } from "react";
import { dueRoutines, markRoutine } from "@/lib/cowork/routines";
import { chatMark } from "@/lib/sidebar/chat-lanes";

export function RoutinesHost() {
    const inFlight = useRef(new Set<string>());

    useEffect(() => {
        const run = async () => {
            for (const row of dueRoutines()) {
                if (inFlight.current.has(row.id) || row.running) continue;
                inFlight.current.add(row.id);
                markRoutine(row.id, { running: true, lastError: null });
                const missed = row.lastRun > 0;
                const stored = chatMark(row.workerId);
                const instruction =
                    row.instruction.trim()
                    || stored?.taught
                    || stored?.job
                    || "Do your job.";
                const text = missed
                    ? `This routine was missed and is running now.\n\n${instruction}`
                    : instruction;
                window.dispatchEvent(new CustomEvent("shape-chat-load", { detail: { id: row.workerId } }));
                await new Promise((resolve) => window.setTimeout(resolve, 400));
                window.dispatchEvent(new CustomEvent("shape-chat-send-text", { detail: { text } }));
                markRoutine(row.id, { running: false, lastRun: Date.now() });
                inFlight.current.delete(row.id);
            }
        };
        void run();
        const timer = window.setInterval(() => {
            void run();
        }, 60_000);
        return () => window.clearInterval(timer);
    }, []);

    return null;
}
