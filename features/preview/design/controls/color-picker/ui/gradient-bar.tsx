import React, { useRef, useCallback } from "react";
import type { ParsedGradient } from "./gradient-utils";
import { stringifyGradient } from "./gradient-utils";

interface GradientBarProps {
    gradient: ParsedGradient;
    selectedStop: number;
    onSelectStop: (index: number) => void;
    onStopPositionChange: (index: number, position: number) => void;
    onAddStop: (position: number, color: string) => void;
    onRemoveStop: (index: number) => void;
    onGradientMetaChange?: (patch: Partial<Pick<ParsedGradient, "type" | "direction" | "repeating">>) => void;
}

const LINEAR_DIRS = ["90deg", "180deg", "0deg", "45deg", "to right", "to bottom"];
const RADIAL_DIRS = ["circle", "circle at center", "ellipse at center", "farthest-corner"];
const CONIC_DIRS = ["from 0deg", "from 90deg", "from 180deg at center"];

export function GradientBar({
    gradient,
    selectedStop,
    onSelectStop,
    onStopPositionChange,
    onAddStop,
    onRemoveStop,
    onGradientMetaChange,
}: GradientBarProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef<number | null>(null);

    const getPositionFromX = useCallback((clientX: number): number => {
        const track = trackRef.current;
        if (!track) return 0;
        const rect = track.getBoundingClientRect();
        const pct = ((clientX - rect.left) / rect.width) * 100;
        return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
    }, []);

    const handlePointerDown = (e: React.PointerEvent, idx: number) => {
        if (e.button === 2) return;
        e.preventDefault();
        e.stopPropagation();
        draggingRef.current = idx;
        onSelectStop(idx);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (draggingRef.current === null) return;
        const pos = getPositionFromX(e.clientX);
        onStopPositionChange(draggingRef.current, pos);
    };

    const handlePointerUp = () => {
        draggingRef.current = null;
    };

    const handleTrackPointerDown = (e: React.PointerEvent) => {
        if (e.button === 2) return;
        if (e.target === trackRef.current) {
            const pos = getPositionFromX(e.clientX);
            onAddStop(pos, "#ffffff");
        }
    };

    // Preview bar always uses a left→right linear so stop handles stay readable.
    const cssGradient = stringifyGradient({
        ...gradient,
        type: "linear",
        repeating: false,
        direction: "90deg",
    });

    const dirPresets =
        gradient.type === "radial" ? RADIAL_DIRS
            : gradient.type === "conic" ? CONIC_DIRS
                : LINEAR_DIRS;

    return (
        <div className="px-1.5 pb-1.5">
            <div
                ref={trackRef}
                className="relative h-6 rounded-lg cursor-crosshair"
                style={{
                    background: cssGradient,
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)",
                }}
                onPointerDown={handleTrackPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            >
                {gradient.stops.map((stop, i) => (
                    <div
                        key={i}
                        className={`absolute top-1/2 ml-1 w-4 h-4 rounded-full border-2 cursor-grab active:cursor-grabbing transition-shadow ${
                            i === selectedStop
                                ? "border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.3)] z-20 hover:scale-110 "
                                : "border-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.2)] z-10 hover:scale-110"
                        }`}
                        style={{
                            left: `${stop.position}%`,
                            transform: `translateX(-50%) translateY(-50%)${i === selectedStop ? " scale(1.1)" : ""}`,
                            backgroundColor: stop.color,
                        }}
                        onPointerDown={(e) => handlePointerDown(e, i)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            if (gradient.stops.length > 2) onRemoveStop(i);
                        }}
                    />
                ))}
            </div>

            {onGradientMetaChange ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <select
                        className="h-6 rounded-md border border-border-subtle bg-panel-hover px-1.5 text-[11px] text-text-secondary outline-none"
                        value={gradient.type}
                        onChange={(e) => {
                            const type = e.target.value as ParsedGradient["type"];
                            const direction =
                                type === "linear" ? (gradient.direction || "90deg")
                                    : type === "radial" ? (gradient.direction || "circle")
                                        : (gradient.direction || "from 0deg");
                            onGradientMetaChange({ type, direction });
                        }}
                    >
                        <option value="linear">linear</option>
                        <option value="radial">radial</option>
                        <option value="conic">conic</option>
                    </select>
                    <select
                        className="h-6 min-w-0 flex-1 rounded-md border border-border-subtle bg-panel-hover px-1.5 text-[11px] text-text-secondary outline-none"
                        value={dirPresets.includes(gradient.direction) ? gradient.direction : "__custom__"}
                        onChange={(e) => {
                            if (e.target.value === "__custom__") return;
                            onGradientMetaChange({ direction: e.target.value });
                        }}
                    >
                        {dirPresets.map((d) => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                        {!dirPresets.includes(gradient.direction) && gradient.direction ? (
                            <option value="__custom__">{gradient.direction}</option>
                        ) : null}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-text-muted select-none">
                        <input
                            type="checkbox"
                            checked={gradient.repeating}
                            onChange={(e) => onGradientMetaChange({ repeating: e.target.checked })}
                        />
                        repeat
                    </label>
                    <span className="ml-auto text-[11px] text-text-muted select-none">
                        {gradient.stops.length} stops
                    </span>
                </div>
            ) : (
                <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-text-muted font-medium select-none">
                        {gradient.repeating ? "repeating-" : ""}{gradient.type}
                    </span>
                    <span className="text-xs text-text-muted font-medium select-none">
                        {gradient.stops.length} stops
                    </span>
                </div>
            )}
        </div>
    );
}
