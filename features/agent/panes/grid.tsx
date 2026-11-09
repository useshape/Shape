"use client";

import { useEffect } from "react";
import { DockSurface } from "../dock/view";
import { terminalVisible } from "../strip";

/** Main area. The sidebar lists chats; this grid docks the visible groups. */
export function PaneGrid() {
    useEffect(() => {
        const openTerminal = (focus = true) => {
            window.dispatchEvent(new CustomEvent("shape-dock-open", {
                detail: { id: "terminal", place: "terminal", focus },
            }));
        };
        const onToggle = (event: Event) => {
            const detail = (event as CustomEvent<{ id?: string; value?: boolean }>).detail;
            if (detail?.id !== "terminal" && detail?.id !== "panel") return;
            openTerminal(detail.value !== false);
        };
        const onShortcut = () => openTerminal(!terminalVisible());
        window.addEventListener("shape-layout-toggle", onToggle as EventListener);
        window.addEventListener("shape-open-workspace-terminal", () => openTerminal(true));
        window.addEventListener("shape-terminal-shortcut", onShortcut);
        return () => {
            window.removeEventListener("shape-layout-toggle", onToggle as EventListener);
            window.removeEventListener("shape-terminal-shortcut", onShortcut);
        };
    }, []);

    return <DockSurface />;
}
