"use client";

import { appRoute } from "@/lib/app-route";
import { emit, WebviewWindow } from "@/lib/tauri/client-api";

export async function openSettingsWindow(options?: {
    category?: string;
    section?: string;
    /** Open a settings sub-route directly instead of the default `/settings` page. */
    path?: string;
}) {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        return;
    }

    const targetPath = options?.path
        ? appRoute(options.path.startsWith("/") ? options.path : `/${options.path}`)
        : (() => {
              const query: Record<string, string> = {};
              if (options?.category) query.category = options.category;
              if (options?.section) query.section = options.section;
              return appRoute("/settings", Object.keys(query).length > 0 ? query : undefined);
          })();

    const hasDeepLink = !!(options?.path || options?.category || options?.section);

    try {
        const existing = await WebviewWindow.getByLabel("settings");
        if (existing) {
            await existing.show();
            await existing.setFocus();
            if (hasDeepLink) {
                if (options?.path) {
                    await emit("shape-settings-navigate", { path: targetPath });
                } else {
                    await emit("shape-settings-navigate", {
                        category: options?.category ?? "",
                        section: options?.section ?? "",
                    });
                }
            }
            return;
        }

        const created = new WebviewWindow("settings", {
            url: targetPath,
            title: "Settings",
            width: 960,
            height: 720,
            minWidth: 720,
            minHeight: 480,
            decorations: false,
            center: true,
            resizable: true,
            visible: true,
        });

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Settings window creation timed out")), 10000);
            void created.once("tauri://created", () => {
                clearTimeout(timeout);
                resolve();
            });
            void created.once("tauri://error", (event) => {
                clearTimeout(timeout);
                reject(event.payload ?? new Error("Failed to create settings window"));
            });
        });

        await created.setFocus();
    } catch (error) {
        const { notify } = await import("@/features/notifications");
        notify.error("Settings", error instanceof Error ? error.message : String(error));
    }
}
