"use client";

import { Eclipse } from "loading-dev";

/** Live status — animated icon only. */
export function GeneratingIndicator({
    label: _label,
}: {
    label?: string;
    showTimer?: boolean;
    variantSeed?: string;
}) {
    return (
        <div className="flex items-center py-1 text-text-muted">
            <Eclipse size={14} className="shrink-0 text-text-muted" />
        </div>
    );
}
