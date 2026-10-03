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
        <div className="relative mt-1 mb-1 max-h-56 w-full overflow-auto squircle-2xl border border-border-subtle bg-transparent px-1.5 py-2 font-mono text-sm leading-6">
            {rows.map((row, i) => {
                if (row.type === "hunk") return null;
                const num = row.type === "remove" ? row.oldNum : row.newNum ?? row.oldNum;
                return (
                    <div
                        key={`${row.type}-${i}`}
                        className={cn(
                            "flex min-w-full",
                            row.type === "add" && "bg-success/10 text-success",
                            row.type === "remove" && "bg-error/10 text-error",
                            row.type === "context" && "text-text-secondary",
                        )}
                    >
                        <span className="w-8 shrink-0 select-none px-1 text-right tabular-nums text-text-disabled">
                            {num ?? ""}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-pre px-2">{row.line || " "}</span>
                    </div>
                );
            })}
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
        () => unifiedDiffRows(original || "", replacement || "", 4),
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
