"use client";

import React from "react";
import {
    ALL_ROUNDED_CLASSES,
    buildRadiusStops,
    allRoundedRemovals,
    findStopIndexByClass,
    snapToNearestStopIndex,
} from "./lib/radius";
import { PanelShell, type TwPanelProps } from "./tw-control-shared";

function currentRounded(classes: string[]): string {
    return classes.find((c) => ALL_ROUNDED_CLASSES.includes(c) || c === "rounded") || "rounded-md";
}

function arbitraryPx(cls: string): number | null {
    const m = cls.match(/^rounded-\[(\d+)px\]$/);
    return m ? parseInt(m[1], 10) : null;
}

/** Text radius stops (none / sm / md / …) plus optional px value — no size previews. */
export function RadiusPanel({ currentClasses, onApply, onClose }: TwPanelProps) {
    const stops = buildRadiusStops();
    const current = currentRounded(currentClasses);
    const px = arbitraryPx(current);
    const currentIndex = px === null
        ? findStopIndexByClass(current, stops)
        : snapToNearestStopIndex(px, stops);
    const currentStop = stops[currentIndex];

    return (
        <PanelShell title="Radius" onClose={onClose}>
            <div className="rounded-xl border border-border-subtle bg-panel p-3">
                <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-medium text-text-primary">Intensity</span>
                    <span className="rounded-lg border border-border-subtle bg-editor px-2 py-1 text-xs tabular-nums text-text-secondary">
                        {px ?? currentStop?.px ?? 0}px
                    </span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={stops.length - 1}
                    step={1}
                    value={currentIndex}
                    aria-label="Corner radius intensity"
                    onChange={(e) => {
                        const stop = stops[Number(e.target.value)];
                        if (stop) onApply([stop.cls], allRoundedRemovals(currentClasses));
                    }}
                    className="h-1.5 w-full cursor-pointer accent-accent"
                />
                <div className="mt-2 flex justify-between text-[10px] text-text-muted">
                    <span>None</span>
                    <span>Full</span>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted shrink-0">Custom</span>
                <input
                    type="text"
                    inputMode="numeric"
                    defaultValue={px !== null ? String(px) : ""}
                    placeholder="8"
                    key={current}
                    onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key !== "Enter") return;
                        const n = parseInt((e.target as HTMLInputElement).value, 10);
                        if (Number.isNaN(n) || n < 0) return;
                        onApply([`rounded-[${n}px]`], allRoundedRemovals(currentClasses));
                    }}
                    onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (!raw) return;
                        const n = parseInt(raw, 10);
                        if (Number.isNaN(n) || n < 0) return;
                        if (px === n) return;
                        onApply([`rounded-[${n}px]`], allRoundedRemovals(currentClasses));
                    }}
                    className="h-9 w-full min-w-0 rounded-xl border border-border-subtle bg-panel px-3 text-xs text-text-primary tabular-nums outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
                />
            </div>
        </PanelShell>
    );
}
