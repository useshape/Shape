"use client";

import { DiffView } from "@/features/editor/ui/diff/diff-view";

/** Lightweight unified diff for Git manager panels. */
export function ManagerDiffEditor({
    original,
    modified,
    path,
    active = true,
}: {
    original: string;
    modified: string;
    path: string;
    sideBySide?: boolean;
    active?: boolean;
}) {
    if (!active) return null;
    return (
        <DiffView
            path={path}
            originalContent={original}
            content={modified}
        />
    );
}
