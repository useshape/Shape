"use client";

import React from "react";

function formatStatusLabel(label: string, elapsedSec: number): string {
    const base = label.replace(/…+$/, "").trim();
    const lower = base.toLowerCase();
    if (lower.includes("creating design") && elapsedSec > 0) {
        return `${base} for ${elapsedSec}s`;
    }
    return base;
}

/**
 * Single status line shown at the bottom of a streaming message. Shows the
 * real current activity (from backend chat_status events) or a generic
 * "Working" shimmer  -  never fake rotating labels.
 */
export function GeneratingIndicator({ label }: { label?: string }) {
    const [elapsedSec, setElapsedSec] = React.useState(0);

    React.useEffect(() => {
        if (!label?.trim()) {
            setElapsedSec(0);
            return;
        }
        setElapsedSec(0);
        const started = Date.now();
        const tick = () => {
            setElapsedSec(Math.max(0, Math.floor((Date.now() - started) / 1000)));
        };
        tick();
        const id = window.setInterval(tick, 1000);
        return () => window.clearInterval(id);
    }, [label]);

    const display = label?.trim()
        ? formatStatusLabel(label, elapsedSec)
        : "Working";

    return (
        <div className="flex items-center gap-2 py-1.5 px-1 animate-in fade-in duration-300">
            <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-sm font-medium tracking-tight text-text-muted whitespace-nowrap">
                {display}
            </span>
        </div>
    );
}
