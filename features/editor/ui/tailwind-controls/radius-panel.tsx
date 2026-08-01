"use client";

import React from "react";
import {
    ALL_ROUNDED_CLASSES,
    buildRadiusStops,
    allRoundedRemovals,
} from "./lib/radius";
import { PanelShell, type TwPanelProps } from "./tw-control-shared";
import { cn } from "@/lib/utils";

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

    return (
        <PanelShell title="Radius" onClose={onClose}>
            <div className="flex flex-wrap gap-1">
                {stops.map((stop) => {
                    const active = current === stop.cls && px === null;
                    const label = stop.label === "DEFAULT" ? "base" : stop.label;
                    return (
                        <button
                            key={stop.cls}
                            type="button"
                            onClick={() => {
                                onApply([stop.cls], allRoundedRemovals(currentClasses));
                            }}
                            className={cn(
                                "h-7 min-w-[2rem] rounded-lg px-2 text-xs tabular-nums transition-colors",
                                active
                                    ? "bg-panel-active text-text-primary"
                                    : "text-text-muted hover:bg-panel-hover hover:text-text-primary",
                            )}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>
            <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-text-muted shrink-0">px</span>
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
                    className="h-7 w-full min-w-0 rounded-lg bg-panel-hover px-2 text-xs text-text-primary tabular-nums outline-none focus:ring-1 focus:ring-accent/50"
                />
            </div>
        </PanelShell>
    );
}
