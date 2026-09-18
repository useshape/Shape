"use client";

import { cn } from "@/lib/utils";

export const FLEX_POINTS = [
    ["flex-start", "flex-start"],
    ["center", "flex-start"],
    ["flex-end", "flex-start"],
    ["flex-start", "center"],
    ["center", "center"],
    ["flex-end", "center"],
    ["flex-start", "flex-end"],
    ["center", "flex-end"],
    ["flex-end", "flex-end"],
] as const;

export function FlexAlignmentGrid({
    justify,
    align,
    direction,
    onChange,
}: {
    justify: string;
    align: string;
    direction: string;
    onChange: (justify: string, align: string) => void;
}) {
    const column = direction === "column" || direction === "column-reverse";
    return (
        <div className="grid size-22 shrink-0 grid-cols-3 grid-rows-3 overflow-hidden rounded-md bg-surface-4 border border-border p-1 text-text-muted">
            {FLEX_POINTS.map(([nextJustify, nextAlign]) => {
                const selected = justify === nextJustify && align === nextAlign;
                return (
                    <button
                        key={`${nextJustify}-${nextAlign}`}
                        type="button"
                        aria-label={`Align ${nextJustify} ${nextAlign}`}
                        onClick={() => onChange(nextJustify, nextAlign)}
                        className="flex size-full min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-sm hover:bg-current/10"
                    >
                        {selected ? (
                            <span
                                className={cn(
                                    "flex max-h-full max-w-full gap-px text-accent",
                                    column ? "flex-col" : "flex-row",
                                    nextJustify === "center" && (column ? "items-center" : "justify-center"),
                                    nextJustify === "flex-end" && (column ? "items-end" : "justify-end"),
                                    nextJustify === "flex-start" && (column ? "items-start" : "justify-start"),
                                    nextAlign === "center" && (column ? "justify-center" : "items-center"),
                                    nextAlign === "flex-end" && (column ? "justify-end" : "items-end"),
                                    nextAlign === "flex-start" && (column ? "justify-start" : "items-start"),
                                )}
                            >
                                <span className={cn("rounded-[1px] bg-current", column ? "h-px w-1.5" : "h-1.5 w-px")} />
                                <span className={cn("rounded-[1px] bg-current", column ? "h-px w-2.5" : "h-2.5 w-px")} />
                                <span className={cn("rounded-[1px] bg-current", column ? "h-px w-1.5" : "h-1.5 w-px")} />
                            </span>
                        ) : (
                            <span className="size-1 shrink-0 rounded-full bg-current/50" />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
