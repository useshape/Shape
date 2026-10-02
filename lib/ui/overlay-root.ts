"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";

/** Visible window shell. Overlays must mount here or they paint on the transparent HWND. */
export function getOverlayRoot(): HTMLElement | undefined {
    if (typeof document === "undefined") return undefined;
    return (
        document.getElementById("shape-overlays")
        ?? document.getElementById("shape-workbench")
        ?? document.getElementById("shape-settings")
        ?? document.getElementById("shape-popout")
        ?? document.body
    );
}

const OverlayRootContext = createContext<HTMLElement | undefined>(undefined);

export function OverlayRootProvider({
    value,
    children,
}: {
    value: HTMLElement | undefined;
    children: ReactNode;
}) {
    return createElement(OverlayRootContext.Provider, { value }, children);
}

export function useOverlayRoot(): HTMLElement | undefined {
    const override = useContext(OverlayRootContext);
    const [node, setNode] = useState<HTMLElement | undefined>(undefined);
    useEffect(() => {
        setNode(getOverlayRoot());
    }, []);
    return override ?? node;
}
