"use client";

import { useEffect, useState } from "react";

export type LayoutState = {
    primarySidebarOpen: boolean;
    panelOpen: boolean;
    secondarySidebarOpen: boolean;
};

export function useLayoutState() {
    const [layoutState, setLayoutState] = useState<LayoutState>({
        primarySidebarOpen: true,
        panelOpen: false,
        secondarySidebarOpen: false,
    });

    useEffect(() => {
        const handleLayoutUpdate = (e: Event) => {
            const custom = e as CustomEvent<LayoutState>;
            if (custom.detail) setLayoutState(custom.detail);
        };
        window.addEventListener("shape-layout-state", handleLayoutUpdate as EventListener);
        window.dispatchEvent(new Event("shape-layout-request-state"));
        return () => {
            window.removeEventListener("shape-layout-state", handleLayoutUpdate as EventListener);
        };
    }, []);

    const toggleLayout = (id: string) => {
        window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id } }));
    };

    return { layoutState, toggleLayout };
}
