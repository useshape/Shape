import React, { useRef } from "react";
import type { HSVA } from "./color-utils";

interface ColorCanvasProps {
    hsva: HSVA;
    hueColor: string;
    sPct: number;
    vPct: number;
    onDrag: (next: HSVA) => void;
}

function getPoint(e: MouseEvent | TouchEvent | PointerEvent, rect: DOMRect) {
    const x = ("touches" in e && e.touches[0] ? e.touches[0].clientX : (e as MouseEvent).clientX) - rect.left;
    const y = ("touches" in e && e.touches[0] ? e.touches[0].clientY : (e as MouseEvent).clientY) - rect.top;
    return {
        x: Math.max(0, Math.min(1, x / rect.width)),
        y: Math.max(0, Math.min(1, y / rect.height)),
    };
}

/** Hold the pointer down and move to scrub. Releases on pointer up. */
function useHoldDrag(
    ref: React.RefObject<HTMLDivElement | null>,
    onUpdate: (pt: { x: number; y: number }) => void,
) {
    const dragging = useRef(false);
    return {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            const el = ref.current;
            if (!el) return;
            document.body.style.cursor = "crosshair";
            document.body.style.userSelect = "none";
            onUpdate(getPoint(e.nativeEvent, el.getBoundingClientRect()));
        },
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
            if (!dragging.current) return;
            const el = ref.current;
            if (!el) return;
            onUpdate(getPoint(e.nativeEvent, el.getBoundingClientRect()));
        },
        onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
            dragging.current = false;
            try {
                e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
                /* ignore */
            }
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        },
    };
}

export function ColorCanvas({ hsva, hueColor, sPct, vPct, onDrag }: ColorCanvasProps) {
    const svRef = useRef<HTMLDivElement>(null);
    const alphaRef = useRef<HTMLDivElement>(null);
    const hueRef = useRef<HTMLDivElement>(null);

    const sv = useHoldDrag(svRef, (pt) => {
        onDrag({ ...hsva, s: pt.x * 100, v: (1 - pt.y) * 100 });
    });
    const hue = useHoldDrag(hueRef, (pt) => {
        onDrag({ ...hsva, h: pt.y * 360 });
    });
    const alpha = useHoldDrag(alphaRef, (pt) => {
        onDrag({ ...hsva, a: 1 - pt.y });
    });

    return (
        <div className="flex h-[180px] min-h-[180px] w-full items-stretch gap-2">
            <div
                ref={svRef}
                className="relative h-full min-w-0 cursor-crosshair touch-none overflow-hidden rounded-lg"
                style={{
                    flex: "1 1 0%",
                    backgroundImage: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
                }}
                {...sv}
            >
                <div
                    className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_4px_rgba(0,0,0,0.5)]"
                    style={{ left: `${sPct}%`, top: `${100 - vPct}%` }}
                />
            </div>

            <div
                ref={alphaRef}
                className="relative h-full w-3 shrink-0 cursor-pointer touch-none select-none"
                {...alpha}
            >
                <div className="absolute inset-0 overflow-hidden rounded-md border border-border-subtle">
                    <div
                        className="absolute inset-0 z-0 opacity-40"
                        style={{
                            backgroundImage: "repeating-conic-gradient(var(--text-muted) 0 25%, var(--panel-secondary) 0 50%)",
                            backgroundSize: "6px 6px",
                        }}
                    />
                    <div
                        className="absolute inset-0 z-10"
                        style={{ backgroundImage: `linear-gradient(to bottom, ${hueColor}, transparent)` }}
                    />
                </div>
                <div
                    className="pointer-events-none absolute left-1/2 z-20 h-1.5 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/30 bg-white shadow-sm"
                    style={{ top: `${(1 - hsva.a) * 100}%` }}
                />
            </div>

            <div
                ref={hueRef}
                className="relative h-full w-3 shrink-0 cursor-pointer touch-none select-none overflow-hidden rounded-md border border-border-subtle"
                style={{
                    background:
                        "linear-gradient(to bottom, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
                }}
                {...hue}
            >
                <div
                    className="pointer-events-none absolute left-1/2 z-20 h-1.5 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/30 bg-white shadow-sm"
                    style={{ top: `${(hsva.h / 360) * 100}%` }}
                />
            </div>
        </div>
    );
}
