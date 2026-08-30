"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { commands, type GitFileParams, type GitHunkList } from "@/lib/backend";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { FileIcon } from "@/components/ui/file-icon";
import { cn } from "@/lib/utils";
import { notify } from "@/features/notifications";
import { discoverGitRepos, pickDefaultRepo } from "@/lib/git/repos";
import { useGitBranch } from "@/features/workbench/hooks/use-git-branch";
import { getGitStatusColor } from "@/lib/ui/syntax-theme";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { ToolBtn } from "./tool";

function fileName(path: string) {
    return path.split(/[\\/]/).pop() || path;
}

function fileDir(path: string) {
    const parts = path.replace(/\\/g, "/").split("/");
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("/");
}

function countDiff(hunks: GitHunkList | null) {
    let plus = 0;
    let minus = 0;
    if (!hunks) return { plus, minus };
    for (const h of hunks.hunks) {
        for (const line of h.lines) {
            if (line.type === "add") plus += 1;
            if (line.type === "del") minus += 1;
        }
    }
    return { plus, minus };
}

export function ChangesView({ projectPath }: { projectPath: string }) {
    const [repo, setRepo] = useState<string | null>(null);
    const [files, setFiles] = useState<GitFileParams[]>([]);
    const [selected, setSelected] = useState<GitFileParams | null>(null);
    const [hunks, setHunks] = useState<GitHunkList | null>(null);
    const [busy, setBusy] = useState(false);
    const [totals, setTotals] = useState({ plus: 0, minus: 0 });
    const branch = useGitBranch(repo ?? projectPath);

    const refresh = useCallback(async () => {
        try {
            const repos = await discoverGitRepos(projectPath);
            const path = pickDefaultRepo(projectPath, repos) ?? projectPath;
            setRepo(path);
            const list = await commands.gitStatus(path);
            setFiles(list);
            setSelected((prev) => {
                if (prev && list.some((f) => f.path === prev.path && f.staged === prev.staged)) return prev;
                return list[0] ?? null;
            });
            const raw = await commands.gitDiff(path).catch(() => "");
            let plus = 0;
            let minus = 0;
            for (const line of raw.split("\n")) {
                if (line.startsWith("+") && !line.startsWith("+++")) plus += 1;
                if (line.startsWith("-") && !line.startsWith("---")) minus += 1;
            }
            setTotals({ plus, minus });
        } catch {
            setFiles([]);
            setSelected(null);
        }
    }, [projectPath]);

    useEffect(() => {
        void refresh();
        const on = () => void refresh();
        window.addEventListener("shape-git-refresh", on);
        return () => window.removeEventListener("shape-git-refresh", on);
    }, [refresh]);

    useEffect(() => {
        if (!repo || !selected) {
            setHunks(null);
            return;
        }
        let cancelled = false;
        void commands
            .gitListHunks(repo, selected.path, selected.staged)
            .then((h) => {
                if (!cancelled) setHunks(h);
            })
            .catch(() => {
                if (!cancelled) setHunks(null);
            });
        return () => {
            cancelled = true;
        };
    }, [repo, selected]);

    const staged = useMemo(() => files.filter((f) => f.staged), [files]);
    const unstaged = useMemo(() => files.filter((f) => !f.staged), [files]);
    const fileStats = useMemo(() => countDiff(hunks), [hunks]);

    const commitAndPush = async () => {
        if (!repo || files.length === 0) return;
        setBusy(true);
        try {
            await commands.gitStageAll(repo);
            const name = fileName(files[0]?.path ?? "files");
            const message =
                files.length === 1 ? `Update ${name}` : `Update ${files.length} files`;
            await commands.gitCommit(repo, message);
            await commands.gitPush(repo);
            window.dispatchEvent(new Event("shape-git-refresh"));
            await refresh();
        } catch (err) {
            notify.gitError(err);
        } finally {
            setBusy(false);
        }
    };

    const toggleStage = async (file: GitFileParams) => {
        if (!repo) return;
        try {
            if (file.staged) await commands.gitUnstage(repo, file.path);
            else await commands.gitStage(repo, file.path);
            window.dispatchEvent(new Event("shape-git-refresh"));
            await refresh();
        } catch (err) {
            notify.gitError(err);
        }
    };

    const discard = async () => {
        if (!repo || !selected) return;
        try {
            await commands.gitDiscardChanges(repo, selected.path);
            window.dispatchEvent(new Event("shape-git-refresh"));
            await refresh();
        } catch (err) {
            notify.error("Git", err instanceof Error ? err.message : String(err));
        }
    };

    const renderRow = (file: GitFileParams) => {
        const dir = fileDir(file.path);
        const isSel =
            selected?.path === file.path && selected.staged === file.staged;
        return (
            <button
                key={`${file.staged ? "s" : "u"}:${file.path}`}
                type="button"
                onClick={() => setSelected(file)}
                className={cn(
                    "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
                    isSel ? "bg-panel-active" : "hover:bg-panel-hover",
                )}
            >
                <span
                    role="checkbox"
                    aria-checked={file.staged}
                    tabIndex={0}
                    onClick={(e) => {
                        e.stopPropagation();
                        void toggleStage(file);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            void toggleStage(file);
                        }
                    }}
                    className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-sm border text-[10px]",
                        file.staged
                            ? "border-accent bg-accent text-accent-fg"
                            : "border-border-subtle text-transparent hover:border-text-muted",
                    )}
                >
                    ✓
                </span>
                <FileIcon name={fileName(file.path)} className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {fileName(file.path)}
                    {dir ? (
                        <span className="ml-1.5 font-normal text-text-muted">{dir}</span>
                    ) : null}
                </span>
                <span
                    className="w-4 shrink-0 text-center text-xs font-semibold"
                    style={{ color: getGitStatusColor(file.status) }}
                >
                    {file.status}
                </span>
            </button>
        );
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle px-3 text-sm">
                <span className="font-medium text-text-secondary">Uncommitted</span>
                {totals.plus || totals.minus ? (
                    <span className="tabular-nums text-sm">
                        <span className="text-success">+{totals.plus}</span>{" "}
                        <span className="text-error">−{totals.minus}</span>
                    </span>
                ) : null}
                <span className="min-w-0 truncate text-text-muted">{branch ?? "…"}</span>
                <span className="flex-1" />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="flex size-7 items-center justify-center rounded text-text-muted hover:bg-panel-hover"
                            aria-label="More"
                        >
                            <Icon name="more_horiz" size={ICON_SIZE_SM} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => void refresh()}>Refresh</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => {
                                void import("@/lib/open-git-window").then(({ openGitWindow }) => openGitWindow());
                            }}
                        >
                            Git Manager
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <button
                    type="button"
                    disabled={busy || files.length === 0}
                    onClick={() => void commitAndPush()}
                    className="rounded-md bg-accent px-2.5 py-1 text-sm text-accent-fg disabled:opacity-40"
                >
                    Commit & Push
                </button>
            </div>

            {files.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
                    No local changes
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="max-h-[40%] shrink-0 overflow-y-auto border-b border-border-subtle px-1 py-2 custom-scrollbar">
                        {staged.length > 0 ? (
                            <section className="mb-2">
                                <div className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                                    Staged · {staged.length}
                                </div>
                                <div className="flex flex-col">{staged.map(renderRow)}</div>
                            </section>
                        ) : null}
                        {unstaged.length > 0 ? (
                            <section>
                                <div className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                                    Changes · {unstaged.length}
                                </div>
                                <div className="flex flex-col">{unstaged.map(renderRow)}</div>
                            </section>
                        ) : null}
                    </div>

                    {selected ? (
                        <>
                            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle px-2 text-sm">
                                <Icon name="description" size={ICON_SIZE_SM} className="text-text-muted" />
                                <span className="min-w-0 flex-1 truncate text-text-primary">
                                    {selected.path}
                                </span>
                                <span className="tabular-nums text-sm">
                                    <span className="text-success">+{fileStats.plus}</span>{" "}
                                    <span className="text-error">−{fileStats.minus}</span>
                                </span>
                                <ToolBtn label="Discard file" onClick={() => void discard()}>
                                    <Icon name="undo" size={ICON_SIZE_SM} />
                                </ToolBtn>
                            </div>
                            <div className="min-h-0 flex-1 overflow-auto bg-editor font-mono text-sm custom-scrollbar">
                                {hunks?.hunks.map((hunk) => (
                                    <div key={hunk.index} className="border-b border-border-subtle">
                                        <div className="bg-surface-1 px-2 py-1 text-text-muted">
                                            {hunk.header}
                                        </div>
                                        {hunk.lines.map((line, i) => (
                                            <div
                                                key={`${hunk.index}-${i}`}
                                                className={cn(
                                                    "flex leading-5",
                                                    line.type === "add" && "bg-success/10",
                                                    (line.type === "del" || line.type === "remove")
                                                        && "bg-error/10",
                                                )}
                                            >
                                                <span className="w-10 shrink-0 px-1 text-right text-text-muted tabular-nums">
                                                    {line.oldLine ?? ""}
                                                </span>
                                                <span className="w-10 shrink-0 px-1 text-right text-text-muted tabular-nums">
                                                    {line.newLine ?? ""}
                                                </span>
                                                <span
                                                    className={cn(
                                                        "w-4 text-center",
                                                        line.type === "add" && "text-success",
                                                        (line.type === "del" || line.type === "remove")
                                                            && "text-error",
                                                    )}
                                                >
                                                    {line.type === "add"
                                                        ? "+"
                                                        : line.type === "del" || line.type === "remove"
                                                            ? "−"
                                                            : " "}
                                                </span>
                                                <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all px-2 text-text-primary">
                                                    {line.content || " "}
                                                </pre>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                                {!hunks?.hunks.length ? (
                                    <div className="p-4 text-sm text-text-muted">No hunks</div>
                                ) : null}
                            </div>
                        </>
                    ) : null}
                </div>
            )}
        </div>
    );
}
