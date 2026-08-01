"use client";

import React from "react";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { useSettings } from "@/lib/settings";
import { isTauriRuntime, toggleDevTools } from "@/lib/tauri-window";

async function toggleFullscreen() {
    if (!isTauriRuntime()) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const isFs = await win.isFullscreen();
    await win.setFullscreen(!isFs);
}

function resetLayout() {
    window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "primary-sidebar", value: true } }));
    window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
    window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "secondary-sidebar", value: false } }));
    window.dispatchEvent(new Event("shape-layout-reset"));
}

export function GlobalContextMenu({ children }: { children: React.ReactNode }) {
    const settings = useSettings();
    const showDevTools = settings.developer?.enableDevTools === true;

    return (
        <ContextMenu>
            <ContextMenuTrigger id="global-context-menu" className="flex flex-col h-full w-full">
                {children}
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={() => window.location.reload()}>
                    Reload Window
                </ContextMenuItem>
                <ContextMenuItem onClick={() => void toggleFullscreen()}>
                    Toggle Fullscreen
                </ContextMenuItem>
                <ContextMenuItem onClick={resetLayout}>
                    Reset Layout
                </ContextMenuItem>
                {showDevTools ? (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => void toggleDevTools()}>
                            Developer Tools
                        </ContextMenuItem>
                    </>
                ) : null}
            </ContextMenuContent>
        </ContextMenu>
    );
}
