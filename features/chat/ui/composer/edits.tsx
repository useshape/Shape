"use client";

import React, { useMemo, useState } from "react";
import { diffLines } from "diff";
import { FileIcon } from "@/components/ui/file-icon";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { openProjectFile } from "@/lib/open-project-file";
import { resolveProjectFilePath } from "@/lib/path-utils";
import { getProjectPath } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

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

/** File-changes strip that sits flush above the chat input (same outer chrome). */
export function PendingEditsPanel({
    edits,
    onAcceptAll,
    onRejectAll,
    onAccept,
    onReject,
    embedded = false,
}: {
    edits: { id: string; file: string; original: string; replacement: string; baseline?: string }[];
    onAcceptAll: () => void;
    onRejectAll: () => void;
    onAccept?: (id: string) => void;
    onReject?: (id: string) => void;
    /** When true, renders without outer margin/border (parent provides chrome). */
    embedded?: boolean;
}) {
    const [open, setOpen] = useState(true);

    const withStats = useMemo(
        () =>
            edits.map((edit) => ({
                ...edit,
                ...countDiff(edit.original, edit.replacement),
            })),
        [edits],
    );

    if (edits.length === 0) return null;

    const body = (
        <div
            className={cn(
                embedded
                    ? "overflow-hidden rounded-t-xl  mx-2 border border-border bg-panel"
                    : "mx-3 mb-0 overflow-hidden rounded-t-xl border border-b-0 border-border bg-surface-3",
            )}
        >
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                <button
                    type="button"
                    className="flex min-w-0 items-center gap-1 text-xs text-text-muted hover:text-text-primary"
                    onClick={() => setOpen((v) => !v)}
                >
                    <Icon
                        name={open ? "expand_more" : "chevron_right"}
                        size={14}
                        className="shrink-0"
                    />
                    <span className="font-medium tabular-nums">
                        {edits.length} File{edits.length === 1 ? "" : "s"}
                    </span>
                </button>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="xs" onClick={onRejectAll}>
                        Undo All
                    </Button>
                    <Button variant="ghost" size="xs" onClick={onAcceptAll}>
                        Keep All
                    </Button>
                </div>
            </div>

            {open ? (
                <div className="max-h-[140px] overflow-y-auto">
                    {withStats.map((edit) => {
                        const fileName = edit.file.split(/[\\/]/).pop() || edit.file;
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
                                onClick={handleOpen}
                                className="group flex cursor-pointer items-center gap-2 px-2 rounded-lg mb-2 mx-2 py-1 text-sm transition-colors hover:bg-panel-hover"
                            >
                                <FileIcon name={fileName} className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-text-primary">
                                    {fileName}
                                </span>
                                <span className="shrink-0 tabular-nums text-xs">
                                    {edit.add > 0 ? (
                                        <span className="text-success">+{edit.add}</span>
                                    ) : null}
                                    {edit.add > 0 && edit.del > 0 ? " " : null}
                                    {edit.del > 0 ? (
                                        <span className="text-error">-{edit.del}</span>
                                    ) : null}
                                </span>
                                <div className="ml-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                    {onAccept ? (
                                        <Tooltip content="Keep" side="top">
                                            <button
                                                type="button"
                                                className="rounded p-0.5 text-text-muted hover:bg-success/10 hover:text-success"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onAccept(edit.id);
                                                }}
                                            >
                                                <Icon name="check" size={12} />
                                            </button>
                                        </Tooltip>
                                    ) : null}
                                    {onReject ? (
                                        <Tooltip content="Undo" side="top">
                                            <button
                                                type="button"
                                                className="rounded p-0.5 text-text-muted hover:bg-error/10 hover:text-error"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onReject(edit.id);
                                                }}
                                            >
                                                <Icon name="close" size={12} />
                                            </button>
                                        </Tooltip>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );

    return body;
}
