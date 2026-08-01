"use client";

import { appRoute } from "@/lib/app-route";
import { emit, WebviewWindow } from "@/lib/tauri/client-api";

/** Open the per-project Statistics window (LOC + time tracking). */
export async function openStatsWindow() {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        return;
    }

    try {
        const existing = await WebviewWindow.getByLabel("stats");
        if (existing) {
            await emit("shape-stats-refresh", {});
            await existing.show();
            await existing.setFocus();
            return;
        }

        const created = new WebviewWindow("stats", {
            url: appRoute("/stats"),
            title: "Project Statistics",
            width: 960,
            height: 720,
            minWidth: 720,
            minHeight: 520,
            decorations: false,
            center: true,
            resizable: true,
            visible: true,
        });

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error("Statistics window creation timed out")),
                10000,
            );
            void created.once("tauri://created", () => {
                clearTimeout(timeout);
                resolve();
            });
            void created.once("tauri://error", (event) => {
                clearTimeout(timeout);
                reject(event.payload ?? new Error("Failed to create Statistics window"));
            });
        });

        await created.setFocus();
    } catch (error) {
        const { notify } = await import("@/features/notifications");
        notify.error("Statistics", error instanceof Error ? error.message : String(error));
    }
}
