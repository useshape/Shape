"use client";

import { appRoute } from "@/lib/app-route";
import { WebviewWindow } from "@/lib/tauri/client-api";

function popoutLabel(filePath: string) {
    const safe = filePath.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 48);
    return `popout-${safe}`;
}

export async function openEditorPopout(filePath: string) {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        return;
    }

    try {
        const label = popoutLabel(filePath);
        // Seed so the popout page can open the file before searchParams hydrate.
        // localStorage is shared across Shape webviews; sessionStorage is not.
        try {
            localStorage.setItem(`shape-popout-file:${label}`, filePath);
        } catch {
            /* ignore */
        }

        const url = appRoute("/popout", { file: filePath });

        const existing = await WebviewWindow.getByLabel(label);
        if (existing) {
            await existing.show();
            await existing.setFocus();
            return;
        }

        // Create hidden, then show on ready — avoids a long blank decorated wait.
        const created = new WebviewWindow(label, {
            url,
            title: filePath.split(/[\\/]/).pop() || "Editor",
            width: 900,
            height: 700,
            minWidth: 480,
            minHeight: 320,
            decorations: false,
            center: true,
            resizable: true,
            shadow: true,
            visible: false,
            focus: true,
        });

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Editor window creation timed out")), 8000);
            void created.once("tauri://created", () => {
                clearTimeout(timeout);
                resolve();
            });
            void created.once("tauri://error", (event) => {
                clearTimeout(timeout);
                reject(event.payload ?? new Error("Failed to create editor window"));
            });
        });

        await created.show();
        await created.setFocus();
    } catch (error) {
        const { notify } = await import("@/features/notifications");
        notify.error("Editor", error instanceof Error ? error.message : String(error));
    }
}
