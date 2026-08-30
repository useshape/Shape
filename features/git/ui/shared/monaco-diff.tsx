"use client";

import { SimpleDiffView } from "@/features/editor/ui/simple/simple-diff";

/** Chat-first: no Monaco bootstrap for Git manager diffs. */
export function useGitManagerMonaco(): boolean {
    return true;
}

/** Lightweight unified diff — replaces the old Monaco DiffEditor. */
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
        <SimpleDiffView
            path={path}
            originalContent={original}
            content={modified}
        />
    );
}
