"use client";

import { useEffect, useState } from "react";
import type { Window } from "@tauri-apps/api/window";

async function closeAppOrWindow(appWindow: Window) {
    try {
        if (appWindow.label === "main") {
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
