"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type ImageHandle = (typeof HANDLES)[number];

const HANDLE_POS: Record<ImageHandle, string> = {
    nw: "top-[-5px] left-[-5px] cursor-nwse-resize",
    n: "top-[-5px] left-1/2 -ml-1 cursor-ns-resize",
    ne: "top-[-5px] right-[-5px] cursor-nesw-resize",
    e: "top-1/2 right-[-5px] -mt-1 cursor-ew-resize",
    se: "bottom-[-5px] right-[-5px] cursor-nwse-resize",
    s: "bottom-[-5px] left-1/2 -ml-1 cursor-ns-resize",
    sw: "bottom-[-5px] left-[-5px] cursor-nesw-resize",
    w: "top-1/2 left-[-5px] -mt-1 cursor-ew-resize",
};

export function MarkdownImageBox({
    el,
    onResizeStart,
    onMoveStart,
}: {
    el: HTMLImageElement;
    onResizeStart: (handle: ImageHandle, e: React.PointerEvent) => void;
    onMoveStart: (e: React.PointerEvent) => void;
}) {
    const [rect, setRect] = useState(() => el.getBoundingClientRect());

    useEffect(() => {
        const sync = () => setRect(el.getBoundingClientRect());
        sync();
        const ro = new ResizeObserver(sync);
        ro.observe(el);
        window.addEventListener("scroll", sync, true);
        window.addEventListener("resize", sync);
        return () => {
            ro.disconnect();
            window.removeEventListener("scroll", sync, true);
            window.removeEventListener("resize", sync);
        };
    }, [el]);

    const box = (
        <div
            className="pointer-events-none fixed z-dropdown rounded-sm border-[1.5px] border-accent-text shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-text)_35%,transparent)]"
            style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
            }}
        >
            <div className="pointer-events-auto absolute inset-0 cursor-grab" onPointerDown={onMoveStart} />
            {HANDLES.map((handle) => (
                <div
                    key={handle}
                    className={cn(
                        "pointer-events-auto absolute size-[9px] rounded-sm border border-surface-3 bg-accent-text",
                        HANDLE_POS[handle],
                    )}
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        onResizeStart(handle, e);
                    }}
                />
            ))}
        </div>
    );

    return createPortal(box, document.body);
}
