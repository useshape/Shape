"use client";

import { useEffect, useState } from "react";
import type { Window } from "@tauri-apps/api/window";
import { WebviewWindow } from "@/lib/tauri/client-api";

async function agentWindowOpen(): Promise<boolean> {
    try {
        const agent = await WebviewWindow.getByLabel("agent");
        return Boolean(agent);
    } catch {
        return false;
    }
}

/**
 * Close behavior:
 * - Main + agent still open → hide main (agent keeps running alone).
 * - Main alone → quit the app.
 * - Agent while main is hidden → close agent and quit.
 * - Agent while main is visible → close agent only.
 * - Other secondary windows → close that window only.
 */
async function closeAppOrWindow(appWindow: Window) {
    try {
        if (appWindow.label === "main") {
            if (await agentWindowOpen()) {
                await appWindow.hide();
                return;
            }
            const { getAllWindows } = await import("@tauri-apps/api/window");
            const windows = await getAllWindows();
            await Promise.all(
                windows
                    .filter((w) => w.label !== "main")
                    .map((w) => w.close().catch(() => undefined)),
            );
            const { exit } = await import("@tauri-apps/plugin-process");
            await exit(0);
            return;
        }

        if (appWindow.label === "agent") {
            const main = await WebviewWindow.getByLabel("main");
            await appWindow.close();
            if (!main) {
                const { exit } = await import("@tauri-apps/plugin-process");
                await exit(0);
                return;
            }
            try {
                const mainVisible = await main.isVisible();
                if (mainVisible) return;
                await main.close().catch(() => undefined);
                const { exit } = await import("@tauri-apps/plugin-process");
                await exit(0);
            } catch {
                /* ignore */
            }
            return;
        }
    } catch {
        // Fall through to close current window.
    }
    await appWindow.close();
}

export function useWindowControls() {
    const [isMaximized, setIsMaximized] = useState(false);
    const [appWindow, setAppWindow] = useState<Window | null>(null);

    useEffect(() => {
        let disposed = false;
        let unlisten: (() => void) | undefined;

        void import("@tauri-apps/api/window").then(async (module) => {
            const win = module.getCurrentWindow();
            if (disposed) return;
            setAppWindow(win);
            setIsMaximized(await win.isMaximized());
            unlisten = await win.listen("tauri://resize", async () => {
                setIsMaximized(await win.isMaximized());
            });
        });

        return () => {
            disposed = true;
            unlisten?.();
        };
    }, []);

    return {
        isMaximized,
        minimize: () => void appWindow?.minimize(),
        toggleMaximize: async () => {
            if (!appWindow) return;
            const maximized = await appWindow.isMaximized();
            if (maximized) await appWindow.unmaximize();
            else await appWindow.maximize();
            setIsMaximized(!maximized);
        },
        close: () => {
            if (appWindow) void closeAppOrWindow(appWindow);
        },
        closeWindow: () => {
            if (appWindow) void closeAppOrWindow(appWindow);
        },
    };
}
