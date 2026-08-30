"use client";

import { appRoute } from "@/lib/app-route";
import { emit, WebviewWindow } from "@/lib/tauri/client-api";
import { isMainTauriWindow, isTauriRuntime } from "@/lib/tauri-window";

function openInline(section?: string) {
    window.dispatchEvent(
        new CustomEvent("shape-agent-overlay", {
            detail: { type: "git", section },
        }),
    );
}

/** Open Git Manager in the main agent shell (inline). */
export async function openGitWindow(section?: string) {
    if (typeof window === "undefined") return;

    if (!isTauriRuntime()) {
        openInline(section);
        return;
    }

    try {
        const isMain = await isMainTauriWindow();
        if (isMain) {
            openInline(section);
            return;
        }
    } catch {
        openInline(section);
        return;
    }

    const query = section ? { section } : undefined;

    try {
        const existing = await WebviewWindow.getByLabel("git");
        if (existing) {
            if (section) {
                await emit("shape-git-section", { section });
            }
            await existing.show();
            await existing.setFocus();
            return;
        }

        const legacy = await WebviewWindow.getByLabel("branch");
        if (legacy) {
            try {
                await legacy.close();
            } catch {
                /* ignore */
            }
        }

        const created = new WebviewWindow("git", {
            url: appRoute("/git", query),
            title: "Git",
            width: 960,
            height: 680,
            minWidth: 560,
            minHeight: 400,
            decorations: false,
            center: true,
            resizable: true,
            visible: true,
        });

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Git window creation timed out")), 10000);
            void created.once("tauri://created", () => {
                clearTimeout(timeout);
                resolve();
            });
            void created.once("tauri://error", (event) => {
                clearTimeout(timeout);
                reject(event.payload ?? new Error("Failed to create Git window"));
            });
        });

        await created.setFocus();
    } catch (error) {
        const { notify } = await import("@/features/notifications");
        notify.error("Git", error instanceof Error ? error.message : String(error));
    }
}

/** @deprecated Use openGitWindow */
export async function openBranchWindow() {
    return openGitWindow("branches");
}
