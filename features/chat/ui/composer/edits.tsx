"use client";

import { RiCheckLine, RiCloseLine } from "@remixicon/react";
import React, { useMemo } from "react";
import { diffLines } from "diff";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { openProjectFile } from "@/lib/window/open-project-file";
import { resolveProjectFilePath } from "@/lib/path/utils";
import { getProjectPath } from "@/lib/backend";
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

export function PendingEditsPanel({
    edits,
    onAcceptAll,
    onRejectAll,
    onAccept,
    onReject,
}: {
    edits: { id: string; file: string; original: string; replacement: string; baseline?: string }[];
    onAcceptAll: () => void;
    onRejectAll: () => void;
    onAccept?: (id: string) => void;
    onReject?: (id: string) => void;
    embedded?: boolean;
}) {
    const withStats = useMemo(
        () =>
            edits.map((edit) => ({
                ...edit,
                ...countDiff(edit.original, edit.replacement),
            })),
        [edits],
    );

    if (edits.length === 0) return null;

    const addTotal = withStats.reduce((s, e) => s + e.add, 0);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex h-6 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                >
                    Changes
                    {addTotal > 0 ? (
                        <span className="tabular-nums text-success">+{addTotal}</span>
                    ) : (
                        <span className="tabular-nums text-text-muted">{edits.length}</span>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 p-1">
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                    <span className="text-sm text-text-muted">
                        {edits.length} file{edits.length === 1 ? "" : "s"}
                    </span>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="xs" onClick={onRejectAll}>
                            Undo
                        </Button>
                        <Button variant="ghost" size="xs" onClick={onAcceptAll}>
                            Keep
                        </Button>
                    </div>
                </div>
                {withStats.map((edit) => {
                    const fileName = edit.file.split(/[\\/]/).pop() || edit.file;
                    return (
                        <button
                            key={edit.id}
                            type="button"
                            onClick={() => {
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
                            }}
                            className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-panel-hover"
                        >
                            <span className="min-w-0 flex-1 truncate text-text-primary">{fileName}</span>
                            <span className="shrink-0 tabular-nums text-xs">
                                {edit.add > 0 ? <span className="text-success">+{edit.add}</span> : null}
                                {edit.add > 0 && edit.del > 0 ? " " : null}
                                {edit.del > 0 ? <span className="text-error">-{edit.del}</span> : null}
                            </span>
                            {onAccept ? (
                                <Tooltip content="Keep">
                                    <span
                                        role="button"
                                        className="text-text-muted hover:text-success"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onAccept(edit.id);
                                        }}
                                    >
                                        <Icon icon={RiCheckLine} size={ICON_SIZE_SM} />
                                    </span>
                                </Tooltip>
                            ) : null}
                            {onReject ? (
                                <Tooltip content="Undo">
                                    <span
                                        role="button"
                                        className="text-text-muted hover:text-error"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onReject(edit.id);
                                        }}
                                    >
                                        <Icon icon={RiCloseLine} size={ICON_SIZE_SM} />
                                    </span>
                                </Tooltip>
                            ) : null}
                        </button>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
