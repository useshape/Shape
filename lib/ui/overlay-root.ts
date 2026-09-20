"use client";

import { useEffect, useState } from "react";

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

export function useOverlayRoot(): HTMLElement | undefined {
    const [node, setNode] = useState<HTMLElement | undefined>(undefined);
    useEffect(() => {
        setNode(getOverlayRoot());
    }, []);
    return node;
}
