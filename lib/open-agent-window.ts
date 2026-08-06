"use client";

import { appRoute } from "@/lib/app-route";
import { WebviewWindow } from "@/lib/tauri/client-api";

export async function focusMainWindow(): Promise<void> {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        return;
    }

    try {
        const main = await WebviewWindow.getByLabel("main");
        if (!main) return;
        const visible = await main.isVisible().catch(() => true);
        if (!visible) {
            await main.show();
        }
        // Windows: unminimize + raise so an already-open IDE comes to the front.
        try {
            const minimized = await main.isMinimized();
            if (minimized) await main.unminimize();
        } catch {
            /* older webview may lack isMinimized */
        }
        await main.setFocus();
    } catch (error) {
        const { notify } = await import("@/features/notifications");
        notify.error("Editor", error instanceof Error ? error.message : String(error));
    }
}

export async function closeAgentWindow(): Promise<void> {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        return;
    }

    try {
        const agent = await WebviewWindow.getByLabel("agent");
        if (agent) {
            await agent.close();
        }
        const main = await WebviewWindow.getByLabel("main");
        if (main) {
            const visible = await main.isVisible().catch(() => true);
            if (visible) {
                await main.setFocus();
            } else {
                await main.show();
                await main.setFocus();
            }
        }
    } catch (error) {
        const { notify } = await import("@/features/notifications");
        notify.error("Agent", error instanceof Error ? error.message : String(error));
    }
}

export async function openAgentWindow(opts?: { hideMain?: boolean }): Promise<void> {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        return;
    }

    try {
        const existing = await WebviewWindow.getByLabel("agent");
        if (existing) {
            await existing.show();
            await existing.setFocus();
            if (opts?.hideMain) {
                const main = await WebviewWindow.getByLabel("main");
                await main?.hide();
            }
            return;
        }

        const created = new WebviewWindow("agent", {
            url: appRoute("/agent"),
            title: "Agent",
            width: 1100,
            height: 760,
            minWidth: 720,
            minHeight: 520,
            decorations: false,
            center: true,
            resizable: true,
            maximizable: true,
            shadow: true,
            visible: true,
        });

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Agent window creation timed out")), 10000);
            void created.once("tauri://created", () => {
                clearTimeout(timeout);
                resolve();
            });
            void created.once("tauri://error", (event) => {
                clearTimeout(timeout);
                reject(event.payload ?? new Error("Failed to create agent window"));
            });
        });

        await created.setFocus();
        if (opts?.hideMain) {
            const main = await WebviewWindow.getByLabel("main");
            await main?.hide();
        }
    } catch (error) {
        const { notify } = await import("@/features/notifications");
        notify.error("Agent", error instanceof Error ? error.message : String(error));
    }
}
