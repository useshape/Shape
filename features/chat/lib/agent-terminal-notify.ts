"use client";

import { listen } from "@tauri-apps/api/event";
import { notify } from "@/features/notifications";

type AgentTerminalEvent = {
    commandId?: string;
    sessionId?: number;
    kind?: string;
    exitCode?: number;
    cancelled?: boolean;
};

const backgroundIds = new Set<string>();

function keyOf(event: AgentTerminalEvent): string | null {
    if (event.commandId) return `c:${event.commandId}`;
    if (event.sessionId != null) return `s:${event.sessionId}`;
    return null;
}

/** Toast when an agent command that went background later exits. */
export function startAgentBackgroundExitToasts(): () => void {
    let disposed = false;
    const unlisten = listen<AgentTerminalEvent>("agent-terminal-stream", (event) => {
        if (disposed) return;
        const payload = event.payload ?? {};
        const key = keyOf(payload);
        if (!key) return;
        if (payload.kind === "background") {
            backgroundIds.add(key);
            if (payload.sessionId != null) backgroundIds.add(`s:${payload.sessionId}`);
            return;
        }
        if (payload.kind !== "exit") return;
        const tracked =
            backgroundIds.has(key)
            || (payload.sessionId != null && backgroundIds.has(`s:${payload.sessionId}`));
        backgroundIds.delete(key);
        if (payload.sessionId != null) backgroundIds.delete(`s:${payload.sessionId}`);
        if (!tracked || payload.cancelled) return;
        const code = payload.exitCode ?? 0;
        notify.info("Background command finished", `Exit code ${code}`);
    });
    return () => {
        disposed = true;
        void unlisten.then((fn) => fn()).catch(() => undefined);
    };
}
