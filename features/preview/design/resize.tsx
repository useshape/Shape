"use client";

import { cn } from "@/lib/utils";

export function DragEdge({
    side,
    onDrag,
}: {
    side: "left" | "right";
    onDrag: (startWidth: number, dx: number) => void;
}) {
    return (
        <div
            role="separator"
            aria-orientation="vertical"
            className={cn(
                "absolute top-0 z-20 h-full w-1.5 cursor-col-resize hover:bg-accent/50",
                side === "left" ? "left-0" : "right-0",
            )}
            onPointerDown={(event) => {
                event.preventDefault();
                const handle = event.currentTarget;
                const parent = handle.parentElement;
                if (!parent) return;
                const startX = event.clientX;
                const startWidth = parent.getBoundingClientRect().width;
                handle.setPointerCapture(event.pointerId);
                const move = (next: PointerEvent) => onDrag(startWidth, next.clientX - startX);
                const up = () => {
                    handle.removeEventListener("pointermove", move);
                    handle.removeEventListener("pointerup", up);
                };
                handle.addEventListener("pointermove", move);
                handle.addEventListener("pointerup", up);
            }}
        />
    );
}
