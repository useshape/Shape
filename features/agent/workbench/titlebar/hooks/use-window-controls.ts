"use client";

import { useEffect, useState } from "react";
import type { Window } from "@tauri-apps/api/window";

/** Hide the main window to the tray. Agents and routines keep running. */
async function hideMainWindow(appWindow: Window) {
    try {
        await appWindow.hide();
    } catch {
        await appWindow.close();
    }
}

/** Explicit quit from File → Exit. */
async function quitApp(appWindow: Window) {
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
            const syncChrome = async () => {
                const maximized = await win.isMaximized();
                const fullscreen = await win.isFullscreen().catch(() => false);
                let snapped = false;
                if (!maximized && !fullscreen) {
                    try {
                        const [pos, size, monitor] = await Promise.all([
                            win.outerPosition(),
                            win.outerSize(),
                            module.currentMonitor(),
                        ]);
                        const area = monitor?.workArea;
                        if (area) {
                            const near = (a: number, b: number) => Math.abs(a - b) <= 8;
                            const halfW = area.size.width / 2;
                            const halfH = area.size.height / 2;
                            const matchW = near(size.width, area.size.width) || near(size.width, halfW);
                            const matchH = near(size.height, area.size.height) || near(size.height, halfH);
                            const left = near(pos.x, area.position.x);
                            const top = near(pos.y, area.position.y);
                            const right = near(pos.x + size.width, area.position.x + area.size.width);
                            const bottom = near(pos.y + size.height, area.position.y + area.size.height);
                            const edges = [left, top, right, bottom].filter(Boolean).length;
                            snapped = matchW && matchH && edges >= 2;
                        }
                    } catch {
                        snapped = false;
                    }
                }
                if (disposed) return;
                const flush = maximized || fullscreen || snapped;
                setIsMaximized(maximized);
                document.documentElement.toggleAttribute("data-window-maximized", maximized || fullscreen);
                document.documentElement.toggleAttribute("data-window-flush", flush);
            };
            await syncChrome();
            const onChrome = () => {
                void syncChrome();
            };
            const unlistenResize = await win.listen("tauri://resize", onChrome);
            const unlistenMove = await win.listen("tauri://move", onChrome);
            unlisten = () => {
                unlistenResize();
                unlistenMove();
            };
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
            if (appWindow) void hideMainWindow(appWindow);
        },
        closeWindow: () => {
            if (appWindow) void hideMainWindow(appWindow);
        },
        quit: () => {
            if (appWindow) void quitApp(appWindow);
        },
    };
}
