"use client";

import React from "react";
import { LoadingState } from "./loading-state";

function formatStatusLabel(label: string, elapsedSec: number): string {
    const base = label.replace(/…+$/, "").trim();
    const lower = base.toLowerCase();
    if (lower.includes("creating design") && elapsedSec > 0) {
        return `${base} for ${elapsedSec}s`;
    }
    return base;
}

/**
 * Live status line while streaming — pixel grid + shimmer label.
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

    const raw = label?.trim() || "Working";
    const display = formatStatusLabel(raw, elapsedSec);

    return (
        <div className="flex items-center py-1 px-1">
            <LoadingState label={display} />
        </div>
    );
}
