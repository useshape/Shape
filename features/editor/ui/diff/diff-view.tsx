"use client";

import React, { useMemo } from "react";
import { diffLines } from "diff";
import { cn } from "@/lib/utils";

/** Unified line diff for agent, git, and popout. */
export function DiffView({
    originalContent,
    content,
}: {
    path: string;
    originalContent: string;
    content: string;
    getLanguage?: (path: string) => string;
}) {
    const rows = useMemo(() => {
        const parts = diffLines(originalContent ?? "", content ?? "");
        const out: { type: "equal" | "add" | "remove"; text: string; oldNo?: number; newNo?: number }[] = [];
        let oldNo = 1;
        let newNo = 1;
        for (const part of parts) {
            const lines = part.value.replace(/\n$/, "").split("\n");
            const cleaned =
                part.value.endsWith("\n") && lines[lines.length - 1] === ""
                    ? lines.slice(0, -1)
                    : lines;
            for (const line of cleaned) {
                if (part.added) {
                    out.push({ type: "add", text: line, newNo: newNo++ });
                } else if (part.removed) {
                    out.push({ type: "remove", text: line, oldNo: oldNo++ });
                } else {
                    out.push({ type: "equal", text: line, oldNo: oldNo++, newNo: newNo++ });
                }
            }
        }
        return out;
    }, [originalContent, content]);

    return (
        <div className="h-full min-h-0 overflow-auto bg-editor font-mono text-sm custom-scrollbar">
            <div className="min-w-full py-2">
                {rows.map((row, i) => (
                    <div
                        key={i}
                        className={cn(
                            "flex leading-5",
                            row.type === "add" && "bg-success/10",
                            row.type === "remove" && "bg-error/10",
                        )}
                    >
                        <span className="w-10 shrink-0 select-none pr-2 text-right text-text-muted tabular-nums">
                            {row.oldNo ?? ""}
                        </span>
                        <span className="w-10 shrink-0 select-none pr-2 text-right text-text-muted tabular-nums">
                            {row.newNo ?? ""}
                        </span>
                        <span
                            className={cn(
                                "w-4 shrink-0 select-none text-center",
                                row.type === "add" && "text-success",
                                row.type === "remove" && "text-error",
                                row.type === "equal" && "text-text-muted",
                            )}
                        >
                            {row.type === "add" ? "+" : row.type === "remove" ? "-" : " "}
                        </span>
                        <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all px-1 text-text-primary">
                            {row.text || " "}
                        </pre>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** @deprecated Use DiffView */
export const SimpleDiffView = DiffView;
