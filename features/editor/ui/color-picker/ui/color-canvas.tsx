import React, { useRef, useCallback } from "react";
import type { HSVA } from "./color-utils";

interface ColorCanvasProps {
    hsva: HSVA;
    hueColor: string;
    sPct: number;
    vPct: number;
    onDrag: (next: HSVA) => void;
}

function getPoint(e: MouseEvent | TouchEvent, rect: DOMRect) {
    const x = ("touches" in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ("touches" in e ? e.touches[0].clientY : e.clientY) - rect.top;
    return {
        x: Math.max(0, Math.min(1, x / rect.width)),
        y: Math.max(0, Math.min(1, y / rect.height)),
    };
}

function useDrag(
    ref: React.RefObject<HTMLDivElement | null>,
    onUpdate: (pt: { x: number; y: number }) => void,
) {
    const rectRef = useRef<DOMRect | null>(null);

    return useCallback(
        (e: React.MouseEvent | React.TouchEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const el = ref.current;
            if (!el) return;

            rectRef.current = el.getBoundingClientRect();
            const pt = getPoint(e.nativeEvent as MouseEvent & TouchEvent, rectRef.current);
            onUpdate(pt);

            const onMove = (ev: MouseEvent | TouchEvent) => {
                if (!rectRef.current) return;
                onUpdate(getPoint(ev, rectRef.current));
            };
            const onEnd = () => {
                rectRef.current = null;
                document.removeEventListener("mousemove", onMove as EventListener);
                document.removeEventListener("mouseup", onEnd);
                document.removeEventListener("touchmove", onMove as EventListener);
                document.removeEventListener("touchend", onEnd);
            };
            document.addEventListener("mousemove", onMove as EventListener);
            document.addEventListener("mouseup", onEnd);
            document.addEventListener("touchmove", onMove as EventListener, { passive: false });
            document.addEventListener("touchend", onEnd);
        },
        [ref, onUpdate],
    );
}

export function ColorCanvas({ hsva, hueColor, sPct, vPct, onDrag }: ColorCanvasProps) {
    const svRef = useRef<HTMLDivElement>(null);
    const alphaRef = useRef<HTMLDivElement>(null);
    const hueRef = useRef<HTMLDivElement>(null);

    const handleSvStart = useDrag(svRef, (pt) => {
        onDrag({ ...hsva, s: pt.x * 100, v: (1 - pt.y) * 100 });
    });

    const handleHueStart = useDrag(hueRef, (pt) => {
        onDrag({ ...hsva, h: pt.y * 360 });
    });

    const handleAlphaStart = useDrag(alphaRef, (pt) => {
        onDrag({ ...hsva, a: 1 - pt.y });
    });

    return (
        <div className="flex h-[180px] min-h-[180px] w-full items-stretch gap-2">
            {/* Saturation-Value 2D Canvas — takes all remaining width */}
            <div
                ref={svRef}
                className="h-full rounded-lg relative cursor-crosshair touch-none overflow-hidden min-w-0"
                style={{
                    flex: "1 1 0%",
                    backgroundImage: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
                }}
                onMouseDown={handleSvStart}
                onTouchStart={handleSvStart}
            >
                <div
                    className="absolute w-3 h-3 rounded-full border-2 border-white shadow-[0_0_4px_rgba(0,0,0,0.5)] pointer-events-none -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${sPct}%`, top: `${100 - vPct}%` }}
                />
            </div>

            {/* Alpha Slider */}
            <div
                ref={alphaRef}
                className="w-3 shrink-0 h-full relative cursor-pointer touch-none select-none"
                onMouseDown={handleAlphaStart}
                onTouchStart={handleAlphaStart}
            >
                <div className="absolute inset-0 rounded-md overflow-hidden border border-border-subtle">
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
                    className="absolute z-20 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-1.5 rounded-full bg-white border border-black/30 shadow-sm pointer-events-none"
                    style={{ top: `${(1 - hsva.a) * 100}%` }}
                />
            </div>

            {/* Hue Slider */}
            <div
                ref={hueRef}
                className="w-3 shrink-0 h-full relative cursor-pointer touch-none select-none"
                onMouseDown={handleHueStart}
                onTouchStart={handleHueStart}
            >
                <div
                    className="absolute inset-0 rounded-md overflow-hidden border border-border-subtle"
                    style={{ backgroundImage: "linear-gradient(to bottom, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
                />
                <div
                    className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-1.5 rounded-full bg-white border border-black/30 shadow-sm pointer-events-none"
                    style={{ top: `${(hsva.h / 360) * 100}%` }}
                />
            </div>
        </div>
    );
}
