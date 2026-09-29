"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
    parseUnifiedDiffBody,
    unifiedDiffRows,
    type UnifiedDiffRow,
} from "@/lib/ui/diff-count";

function DiffRows({ rows }: { rows: UnifiedDiffRow[] }) {
    if (rows.length === 0) return null;
    return (
        <div className="mt-1 max-h-[260px] max-w-full overflow-auto custom-scrollbar border-y border-border-subtle bg-surface-3 font-mono text-sm">
            <table className="w-max min-w-full border-collapse text-left">
                <tbody>
                    {rows.map((row, i) => {
                        if (row.type === "hunk") {
                            return (
                                <tr key={`h-${i}`} className="bg-surface-2/80 text-text-muted">
                                    <td colSpan={3} className="px-2 py-0.5 whitespace-pre select-none">
                                        {row.line}
                                    </td>
                                </tr>
                            );
                        }
                        const marker = row.type === "add" ? "+" : row.type === "remove" ? "-" : " ";
                        return (
                            <tr
                                key={`${row.type}-${i}`}
                                className={cn(
                                    "border-l-2",
                                    row.type === "add" && "border-l-success/50 bg-success/[0.06] text-success",
                                    row.type === "remove" && "border-l-error/40 bg-error/[0.05] text-error",
                                    row.type === "context" && "border-l-transparent text-text-secondary",
                                )}
                            >
                                <td className="w-8 shrink-0 px-1 py-px text-right tabular-nums opacity-50 select-none">
                                    {row.oldNum ?? ""}
                                </td>
                                <td className="w-8 shrink-0 px-1 py-px text-right tabular-nums opacity-50 select-none">
                                    {row.newNum ?? ""}
                                </td>
                                <td className="px-2 py-px whitespace-pre">
                                    <span className="mr-2 opacity-60 select-none">{marker}</span>
                                    {row.line || " "}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/** Unified edit preview from before/after content. */
export function ChatEditDiff({
    original,
    replacement,
}: {
    original: string;
    replacement: string;
}) {
    const rows = useMemo(
        () => unifiedDiffRows(original || "", replacement || "", 2),
        [original, replacement],
    );
    return <DiffRows rows={rows} />;
}

/** Unified preview for a git/patch body string. */
export function ChatPatchDiff({ body }: { body: string }) {
    const rows = useMemo(() => parseUnifiedDiffBody(body || ""), [body]);
    if (!body.trim()) {
        return <span className="px-1 text-sm text-text-muted">No diff output</span>;
    }
    return <DiffRows rows={rows} />;
}
