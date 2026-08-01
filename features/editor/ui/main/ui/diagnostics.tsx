"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { getFileSummary } from "@/features/diagnostics/store";
import { cn } from "@/lib/utils";

export function DiagnosticsIndicator({ path }: { path: string }) {
    const [, tick] = useState(0);

    useEffect(() => {
        const refresh = () => tick((n) => n + 1);
        window.addEventListener("shape-diagnostics-updated", refresh);
        return () => window.removeEventListener("shape-diagnostics-updated", refresh);
    }, []);

    const summary = getFileSummary(path);
    const total = summary.errors + summary.warnings + summary.infos;
    if (total === 0) return null;

    const openProblems = () => {
        window.dispatchEvent(new Event("shape-open-problems"));
    };

    const jumpMarker = (direction: "next" | "prev") => {
        window.dispatchEvent(new CustomEvent("shape-editor-action", {
            detail: { action: direction === "next" ? "nextMarker" : "prevMarker" },
        }));
    };

    return (
        <div className="flex items-center gap-1 shrink-0 pr-2 border-r border-border-subtle/30 mr-1">
            {summary.errors > 0 && (
                <button type="button" onClick={openProblems} className="flex items-center gap-0.5 text-error hover:opacity-80">
                    <Icon name="error" size={14} filled />
                    <span className="text-xs tabular-nums">{summary.errors}</span>
                </button>
            )}
            {summary.warnings > 0 && (
                <button type="button" onClick={openProblems} className="flex items-center gap-0.5 text-warning hover:opacity-80">
                    <Icon name="warning" size={14} filled />
                    <span className="text-xs tabular-nums">{summary.warnings}</span>
                </button>
            )}
            {summary.infos > 0 && (
                <button type="button" onClick={openProblems} className="flex items-center gap-0.5 text-info hover:opacity-80">
                    <Icon name="info" size={14} filled />
                    <span className="text-xs tabular-nums">{summary.infos}</span>
                </button>
            )}
            <div className="flex items-center ml-0.5">
                <button type="button" onClick={() => jumpMarker("prev")} className="p-0.5 text-text-muted hover:text-text-primary" title="Previous Problem">
                    <Icon name="expand_more" size={14} />
                </button>
                <button type="button" onClick={() => jumpMarker("next")} className="p-0.5 text-text-muted hover:text-text-primary" title="Next Problem">
                    <Icon name="expand_less" size={14} />
                </button>
            </div>
        </div>
    );
}
