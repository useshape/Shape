"use client";

import { RiArrowGoBackLine, RiLayoutColumnLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import { commands, type GitFileParams } from "@/lib/backend";
import { DiffView } from "@/features/editor/ui/diff/diff-view";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { notify } from "@/features/notifications";
import { openProjectFile } from "@/lib/open-project-file";

export type FileDiffTabInfo = {
    id: string;
    path: string;
    status: string;
    staged: boolean;
    repo: string;
};

export function fileDiffTabId(file: Pick<GitFileParams, "path" | "staged">) {
    return `diff:${file.staged ? "s" : "u"}:${file.path.replace(/\\/g, "/")}`;
}

function fileName(path: string) {
    return path.split(/[\\/]/).pop() || path;
}

async function loadSides(repo: string, filePath: string) {
    const abs = `${repo.replace(/[\\/]+$/, "")}/${filePath.replace(/\\/g, "/")}`;
    let current = "";
    try {
        current = await commands.readFile(abs);
    } catch {
        current = "";
    }
    let original = "";
    try {
        original = await commands.gitGetFileAtRef(repo, "HEAD", filePath);
    } catch {
        original = "";
    }
    return { original, current };
}

/** Single-file side-by-side / unified diff for a chat-area tab. */
export function SingleFileDiffEditor({
    tab,
}: {
    tab: FileDiffTabInfo;
}) {
    const [original, setOriginal] = useState("");
    const [current, setCurrent] = useState("");
    const [loading, setLoading] = useState(true);
    const [split, setSplit] = useState(false);
    const name = fileName(tab.path);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void loadSides(tab.repo, tab.path).then((sides) => {
            if (cancelled) return;
            setOriginal(sides.original);
            setCurrent(sides.current);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [tab.repo, tab.path, tab.staged]);

    const toggleStage = async () => {
        try {
            if (tab.staged) await commands.gitUnstage(tab.repo, tab.path);
            else await commands.gitStage(tab.repo, tab.path);
            window.dispatchEvent(new Event("shape-git-refresh"));
        } catch (err) {
            notify.gitError(err);
        }
    };

    const discard = async () => {
        try {
            await commands.gitDiscardChanges(tab.repo, tab.path);
            window.dispatchEvent(new Event("shape-git-refresh"));
        } catch (err) {
            notify.error("Git", err instanceof Error ? err.message : String(err));
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-panel">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle px-3 text-sm">
                <span className="truncate font-medium text-text-primary">{name}</span>
                <span className="truncate text-text-muted">{tab.path}</span>
                <span className="flex-1" />
                <button
                    type="button"
                    onClick={() => setSplit((v) => !v)}
                    className={cn(
                        "flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover",
                        split && "text-text-primary",
                    )}
                    title={split ? "Unified" : "Side by side"}
                >
                    <Icon icon={RiLayoutColumnLine} />
                </button>
                <button
                    type="button"
                    onClick={() => void toggleStage()}
                    className="rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-panel-hover"
                >
                    {tab.staged ? "Unstage" : "Stage"}
                </button>
                <button
                    type="button"
                    onClick={() =>
                        void openProjectFile(
                            `${tab.repo.replace(/[\\/]+$/, "")}/${tab.path.replace(/\\/g, "/")}`,
                            name,
                        )
                    }
                    className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-panel-hover"
                >
                    Open File
                </button>
                <button
                    type="button"
                    onClick={() => void discard()}
                    className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover"
                    title="Restore"
                >
                    <Icon icon={RiArrowGoBackLine} />
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
                {loading ? (
                    <div className="p-4 text-sm text-text-muted">Loading…</div>
                ) : (
                    <DiffView
                        path={tab.path}
                        originalContent={original}
                        content={current}
                        mode={split ? "split" : "unified"}
                        className="h-full"
                    />
                )}
            </div>
        </div>
    );
}

/** Open a single-file diff tab in the right workspace panel. */
export function openFileDiffTab(file: GitFileParams, repo: string) {
    window.dispatchEvent(
        new CustomEvent("shape-open-file-diff", {
            detail: {
                id: fileDiffTabId(file),
                path: file.path,
                status: file.status,
                staged: file.staged,
                repo,
            } satisfies FileDiffTabInfo,
        }),
    );
}
