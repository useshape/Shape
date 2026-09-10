"use client";

import { RiCheckLine, RiCloseLine } from "@remixicon/react";
import React, { useMemo } from "react";
import { diffLines } from "diff";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { MorphMenu } from "@/components/ui/morph-menu";
import { openProjectFile } from "@/lib/window/open-project-file";
import { resolveProjectFilePath } from "@/lib/path-utils";
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
    const openH = Math.min(240, 56 + edits.length * 36);

    return (
        <MorphMenu
            variant="morph"
            aria-label="Changes"
            align="end"
            openWidth={280}
            openHeight={openH}
            closedHeight={32}
            trigger={
                <>
                    <span>Changes</span>
                    {addTotal > 0 ? (
                        <span className="text-success">+{addTotal}</span>
                    ) : (
                        <span className="tabular-nums text-text-muted">{edits.length}</span>
                    )}
                </>
            }
        >
            <div className="flex h-full flex-col">
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-sm text-text-muted">
                        {edits.length} file{edits.length === 1 ? "" : "s"}
                    </span>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="xs" onClick={onRejectAll}>
                            Undo All
                        </Button>
                        <Button variant="ghost" size="xs" onClick={onAcceptAll}>
                            Keep All
                        </Button>
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pb-1.5">
                    {withStats.map((edit) => {
                        const fileName = edit.file.split(/[\\/]/).pop() || edit.file;
                        return (
                            <div
                                key={edit.id}
                                onClick={() => {
                                    const resolved = resolveProjectFilePath(
                                        edit.file,
                                        getProjectPath(),
                                    );
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
                                className="group mx-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-panel-hover"
                            >
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
                                <div className="ml-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                                    {onAccept ? (
                                        <Tooltip content="Keep" side="top">
                                            <button
                                                type="button"
                                                className="rounded p-0.5 text-text-muted hover:text-success"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onAccept(edit.id);
                                                }}
                                            >
                                                <Icon icon={RiCheckLine} />
                                            </button>
                                        </Tooltip>
                                    ) : null}
                                    {onReject ? (
                                        <Tooltip content="Undo" side="top">
                                            <button
                                                type="button"
                                                className="rounded p-0.5 text-text-muted hover:text-error"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onReject(edit.id);
                                                }}
                                            >
                                                <Icon icon={RiCloseLine} />
                                            </button>
                                        </Tooltip>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </MorphMenu>
    );
}
