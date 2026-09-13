"use client";

import { RiArrowGoBackLine, RiLayoutColumnLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import { commands, type GitFileParams } from "@/lib/backend";
import { DiffView } from "@/features/editor/ui/diff/diff-view";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { notify } from "@/features/notifications";
import { openProjectFile } from "@/lib/window/open-project-file";

export type FileDiffTabInfo = {
    id: string;
    path: string;
    status: string;
    staged: boolean;
    repo: string;
    /** Historical commit hash — when set, compare parent..commit instead of working tree. */
    commit?: string;
    parent?: string;
};

export function fileDiffTabId(file: Pick<GitFileParams, "path" | "staged">) {
    return `diff:${file.staged ? "s" : "u"}:${file.path.replace(/\\/g, "/")}`;
}

export function commitFileDiffTabId(path: string, commit: string) {
    return `diff:c:${commit.slice(0, 12)}:${path.replace(/\\/g, "/")}`;
}

function fileName(path: string) {
    return path.split(/[\\/]/).pop() || path;
}

async function loadSides(
    repo: string,
    filePath: string,
    commit?: string,
    parent?: string,
) {
    if (commit) {
        const base = parent || `${commit}^`;
        let original = "";
        let current = "";
        try {
            original = await commands.gitGetFileAtRef(repo, base, filePath);
        } catch {
            original = "";
        }
        try {
            current = await commands.gitGetFileAtRef(repo, commit, filePath);
        } catch {
            current = "";
        }
        return { original, current };
    }

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
export function SingleFileDiffEditor({ tab }: { tab: FileDiffTabInfo }) {
    const [original, setOriginal] = useState("");
    const [current, setCurrent] = useState("");
    const [loading, setLoading] = useState(true);
    const [split, setSplit] = useState(false);
    const name = fileName(tab.path);
    const isCommit = Boolean(tab.commit);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void loadSides(tab.repo, tab.path, tab.commit, tab.parent).then((sides) => {
            if (cancelled) return;
            setOriginal(sides.original);
            setCurrent(sides.current);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [tab.repo, tab.path, tab.staged, tab.commit, tab.parent]);

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
                {isCommit ? (
                    <span className="shrink-0 font-mono text-2xs text-text-muted">
                        {tab.commit!.slice(0, 7)}
                    </span>
                ) : null}
                <span className="flex-1" />
                <button
                    type="button"
                    onClick={() => setSplit((v) => !v)}
                    className={cn(
                        "flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover",
                        split && "bg-panel-hover text-text-primary",
                    )}
                    aria-label={split ? "Unified diff" : "Split diff"}
                    title={split ? "Unified" : "Split"}
                >
                    <Icon icon={RiLayoutColumnLine} />
                </button>
                {!isCommit ? (
                    <>
                        <button
                            type="button"
                            onClick={() => void toggleStage()}
                            className="rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                        >
                            {tab.staged ? "Unstage" : "Stage"}
                        </button>
                        <button
                            type="button"
                            onClick={() => void discard()}
                            className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
                            aria-label="Discard changes"
                            title="Discard"
                        >
                            <Icon icon={RiArrowGoBackLine} />
                        </button>
                    </>
                ) : null}
                <button
                    type="button"
                    onClick={() => {
                        const abs = `${tab.repo.replace(/[\\/]+$/, "")}/${tab.path.replace(/\\/g, "/")}`;
                        void openProjectFile(abs);
                    }}
                    className="rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                >
                    Open
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
                {loading ? (
                    <div className="flex h-full items-center justify-center text-sm text-text-muted">
                        Loading diff…
                    </div>
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

/** Open a commit file diff as a workspace tab. */
export function openCommitFileDiffTab(opts: {
    path: string;
    status: string;
    repo: string;
    commit: string;
    parent?: string;
}) {
    window.dispatchEvent(
        new CustomEvent("shape-open-file-diff", {
            detail: {
                id: commitFileDiffTabId(opts.path, opts.commit),
                path: opts.path,
                status: opts.status,
                staged: false,
                repo: opts.repo,
                commit: opts.commit,
                parent: opts.parent,
            } satisfies FileDiffTabInfo,
        }),
    );
}
