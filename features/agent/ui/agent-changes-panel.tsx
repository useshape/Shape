"use client";

import { useMemo } from "react";
import { diffLines } from "diff";
import { FileIcon } from "@/components/ui/file-icon";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { openProjectFile } from "@/lib/open-project-file";
import { resolveProjectFilePath } from "@/lib/path-utils";
import { getProjectPath } from "@/lib/backend";
import { cn } from "@/lib/utils";

export type AgentChangeEdit = {
    id: string;
    file: string;
    original: string;
    replacement: string;
    baseline?: string;
};

function countDiff(original: string, replacement: string): { add: number; del: number } {
    let add = 0;
    let del = 0;
    for (const part of diffLines(original || "", replacement || "")) {
        const lines = part.value.split("\n").length - (part.value.endsWith("\n") ? 1 : 0);
        const n = Math.max(lines, part.value ? 1 : 0);
        if (part.added) add += n;
        if (part.removed) del += n;
    }
    return { add, del };
}

export function AgentChangesPanel({
    edits,
    onAcceptAll,
    onRejectAll,
    onAccept,
    onReject,
}: {
    edits: AgentChangeEdit[];
    onAcceptAll: () => void;
    onRejectAll: () => void;
    onAccept?: (id: string) => void;
    onReject?: (id: string) => void;
}) {
    const withStats = useMemo(
        () =>
            edits.map((edit) => ({
                ...edit,
                ...countDiff(edit.original, edit.replacement),
            })),
        [edits],
    );

    const totals = useMemo(() => {
        return withStats.reduce(
            (acc, e) => ({ add: acc.add + e.add, del: acc.del + e.del }),
            { add: 0, del: 0 },
        );
    }, [withStats]);

    if (edits.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <Icon name="file" size={28} className="opacity-40 text-text-muted" />
                <div className="space-y-1">
                    <p className="text-sm text-text-secondary">No pending changes</p>
                    <p className="text-xs text-text-muted">
                        File edits from the agent will show up here for review.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">
                        {edits.length} file{edits.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-0.5 text-2xs tabular-nums text-text-muted">
                        <span className="text-success">+{totals.add}</span>
                        <span className="mx-1 text-text-muted/50">·</span>
                        <span className="text-error">−{totals.del}</span>
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="xs" className="rounded-sm" onClick={onRejectAll}>
                        Undo All
                    </Button>
                    <Button variant="secondary" size="xs" className="rounded-sm" onClick={onAcceptAll}>
                        Keep All
                    </Button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                {withStats.map((edit) => {
                    const fileName = edit.file.split(/[\\/]/).pop() || edit.file;
                    const dir = edit.file.includes("/") || edit.file.includes("\\")
                        ? edit.file.replace(/[\\/][^\\/]+$/, "").replace(/\\/g, "/")
                        : "";
                    const handleOpen = () => {
                        const resolved = resolveProjectFilePath(edit.file, getProjectPath());
                        void openProjectFile(edit.file, fileName).then((ok) => {
                            if (!ok) return;
                            setTimeout(() => {
                                window.dispatchEvent(
                                    new CustomEvent("shape-editor-preview-diff", {
                                        detail: {
                                            path: resolved,
                                            original: edit.original,
                                            replacement: edit.replacement,
                                        },
                                    }),
                                );
                            }, 150);
                        });
                    };

                    return (
                        <div
                            key={edit.id}
                            className="group flex items-center gap-1 border-b border-border/40 px-1 transition-colors hover:bg-panel-hover"
                        >
                            <button
                                type="button"
                                onClick={handleOpen}
                                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                            >
                                <FileIcon name={fileName} className="h-3.5 w-3.5 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm leading-snug text-text-primary">
                                        {fileName}
                                    </p>
                                    {dir ? (
                                        <p className="truncate text-2xs leading-snug text-text-muted">
                                            {dir}
                                        </p>
                                    ) : null}
                                </div>
                                <span className="flex shrink-0 items-center gap-1.5 text-2xs tabular-nums">
                                    <span
                                        className={cn(
                                            "inline-flex min-w-[1.25rem] justify-center px-1 py-0.5 font-medium",
                                            edit.add > 0 ? "bg-success/15 text-success" : "text-text-muted",
                                        )}
                                    >
                                        +{edit.add}
                                    </span>
                                    <span
                                        className={cn(
                                            "inline-flex min-w-[1.25rem] justify-center px-1 py-0.5 font-medium",
                                            edit.del > 0 ? "bg-error/15 text-error" : "text-text-muted",
                                        )}
                                    >
                                        −{edit.del}
                                    </span>
                                </span>
                            </button>
                            <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100">
                                {onReject ? (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 rounded-sm"
                                        title="Undo"
                                        onClick={() => onReject(edit.id)}
                                    >
                                        <Icon name="undo" size={12} />
                                    </Button>
                                ) : null}
                                {onAccept ? (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 rounded-sm"
                                        title="Keep"
                                        onClick={() => onAccept(edit.id)}
                                    >
                                        <Icon name="check" size={12} />
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
