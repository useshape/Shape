"use client";

import {
    RiArrowDownSLine,
    RiCheckLine,
    RiGitBranchLine,
    RiGitCommitLine,
    RiRefreshLine,
} from "@remixicon/react";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { FileIcon } from "@/components/ui/file-icon";
import { Icon } from "@/components/ui/icon";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { commands, type GitFileParams, type GitLogEntry } from "@/lib/backend";
import { useGitRepos } from "@/lib/git/repos";
import { cn } from "@/lib/utils";
import { notify } from "@/features/notifications";
import { openCommitFileDiffTab } from "./file-diff";

function shortHash(hash: string) {
    return hash.slice(0, 7);
}

function fileName(path: string) {
    return path.split(/[\\/]/).pop() || path;
}

function CommitFiles({
    repo,
    log,
}: {
    repo: string;
    log: GitLogEntry;
}) {
    const [files, setFiles] = useState<GitFileParams[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        void commands
            .gitCommitFiles(repo, log.hash)
            .then((next) => {
                if (!cancelled) setFiles(next);
            })
            .catch(() => {
                if (!cancelled) setFiles([]);
            });
        return () => {
            cancelled = true;
        };
    }, [repo, log.hash]);

    if (!files) {
        return <div className="px-3 py-2 text-xs text-text-muted">Loading files…</div>;
    }
    if (files.length === 0) {
        return <div className="px-3 py-2 text-xs text-text-muted">No files in this commit</div>;
    }

    const parent = log.parents[0] ?? `${log.hash}^`;

    return (
        <ul className="border-t border-border-subtle bg-panel-elevated/40 py-1">
            {files.map((file) => (
                <li key={file.path}>
                    <button
                        type="button"
                        onClick={() =>
                            openCommitFileDiffTab({
                                path: file.path,
                                status: file.status,
                                repo,
                                commit: log.hash,
                                parent,
                            })
                        }
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                    >
                        <FileIcon name={fileName(file.path)} className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{file.path}</span>
                        <span className="shrink-0 text-2xs uppercase text-text-muted">
                            {file.status}
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

/** Simplified git graph for the agent right sidebar — search + branch switch only. */
export function GraphTab({ projectPath }: { projectPath: string }) {
    const { scmRepoPath } = useGitRepos(projectPath);
    const repo = scmRepoPath || projectPath;

    const [logs, setLogs] = useState<GitLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const deferredSearch = useDeferredValue(search);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [branch, setBranch] = useState<string | null>(null);
    const [branches, setBranches] = useState<string[]>([]);
    const [branchQuery, setBranchQuery] = useState("");
    const [switching, setSwitching] = useState(false);

    const refresh = useCallback(async () => {
        if (!repo) return;
        setLoading(true);
        try {
            await commands.gitLogStreamStart(repo, "workspace-graph", false);
            const batch = await commands.gitLogStreamNext("workspace-graph", 120);
            setLogs(batch);
            const [current, list] = await Promise.all([
                commands.gitCurrentBranch(repo).catch(() => null),
                commands.gitBranches(repo).catch(() => [] as string[]),
            ]);
            setBranch(current);
            setBranches(list);
        } catch {
            setLogs([]);
        } finally {
            setLoading(false);
            void commands.gitLogStreamStop("workspace-graph").catch(() => undefined);
        }
    }, [repo]);

    useEffect(() => {
        void refresh();
        const onRefresh = () => void refresh();
        window.addEventListener("shape-git-refresh", onRefresh);
        return () => window.removeEventListener("shape-git-refresh", onRefresh);
    }, [refresh]);

    const filtered = useMemo(() => {
        const q = deferredSearch.trim().toLowerCase();
        if (!q) return logs;
        return logs.filter(
            (log) =>
                log.message.toLowerCase().includes(q) ||
                log.hash.toLowerCase().includes(q) ||
                log.author.toLowerCase().includes(q) ||
                log.refs.some((r) => r.toLowerCase().includes(q)),
        );
    }, [deferredSearch, logs]);

    const filteredBranches = useMemo(() => {
        const q = branchQuery.trim().toLowerCase();
        if (!q) return branches;
        return branches.filter((b) => b.toLowerCase().includes(q));
    }, [branchQuery, branches]);

    const switchBranch = useCallback(
        async (name: string) => {
            if (!repo || name === branch || switching) return;
            setSwitching(true);
            try {
                await commands.gitSwitchBranch(repo, name);
                setBranch(name);
                notify.success("Git", `Checked out ${name}`);
                window.dispatchEvent(new Event("shape-git-refresh"));
                await refresh();
            } catch (err) {
                notify.gitError(err);
            } finally {
                setSwitching(false);
            }
        },
        [branch, refresh, repo, switching],
    );

    return (
        <div className="flex h-full min-h-0 flex-col bg-panel">
            <div className="flex shrink-0 flex-col gap-2 border-b border-border-subtle px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                    <DropdownMenu
                        onOpenChange={(open) => {
                            if (!open) setBranchQuery("");
                        }}
                    >
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                disabled={!repo || switching}
                                className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary disabled:opacity-50"
                            >
                                <Icon icon={RiGitBranchLine} className="shrink-0 text-text-muted" />
                                <span className="min-w-0 flex-1 truncate text-left">
                                    {branch ?? "Branch"}
                                </span>
                                <Icon
                                    icon={RiArrowDownSLine}
                                    className="shrink-0 text-text-disabled"
                                />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64 p-0">
                            <input
                                value={branchQuery}
                                onChange={(e) => setBranchQuery(e.target.value)}
                                placeholder="Search branches…"
                                className="h-8 w-full border-0 border-b border-border-subtle bg-transparent px-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
                                autoFocus
                            />
                            <div className="custom-scrollbar max-h-56 overflow-y-auto">
                                {filteredBranches.map((b) => (
                                    <DropdownMenuItem
                                        key={b}
                                        onClick={() => void switchBranch(b)}
                                        className="gap-2"
                                    >
                                        <span className="min-w-0 flex-1 truncate">{b}</span>
                                        {branch === b ? (
                                            <Icon icon={RiCheckLine} className="shrink-0" />
                                        ) : null}
                                    </DropdownMenuItem>
                                ))}
                                {filteredBranches.length === 0 ? (
                                    <div className="px-2 py-3 text-center text-xs text-text-muted">
                                        No branches
                                    </div>
                                ) : null}
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                        type="button"
                        aria-label="Refresh graph"
                        onClick={() => void refresh()}
                        className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon icon={RiRefreshLine} />
                    </button>
                </div>
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search commits…"
                    className="h-8"
                />
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
                {loading && logs.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-text-muted">Loading…</div>
                ) : filtered.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-text-muted">
                        {search.trim() ? "No matching commits" : "No commits yet"}
                    </div>
                ) : (
                    <ul>
                        {filtered.map((log) => {
                            const isOpen = expanded === log.hash;
                            const laneColor = log.graphNode?.color ?? "var(--color-accent)";
                            return (
                                <li key={log.hash} className="border-b border-border-subtle/60">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setExpanded((prev) =>
                                                prev === log.hash ? null : log.hash,
                                            )
                                        }
                                        className={cn(
                                            "flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-panel-hover",
                                            isOpen && "bg-panel-hover/60",
                                        )}
                                    >
                                        <span
                                            className="mt-1.5 flex size-3.5 shrink-0 items-center justify-center"
                                            aria-hidden
                                        >
                                            <span
                                                className="size-2 rounded-full"
                                                style={{ background: laneColor }}
                                            />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="line-clamp-2 text-sm text-text-primary">
                                                {log.message || "(no message)"}
                                            </span>
                                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-text-muted">
                                                <span className="inline-flex items-center gap-1 font-mono">
                                                    <Icon
                                                        icon={RiGitCommitLine}
                                                        className="size-3"
                                                    />
                                                    {shortHash(log.hash)}
                                                </span>
                                                <span className="truncate">{log.author}</span>
                                                {log.refs.slice(0, 3).map((ref) => (
                                                    <span
                                                        key={ref}
                                                        className="rounded bg-panel-elevated px-1 py-px text-text-secondary"
                                                    >
                                                        {ref.replace(/^HEAD -> /, "")}
                                                    </span>
                                                ))}
                                            </span>
                                        </span>
                                    </button>
                                    {isOpen ? <CommitFiles repo={repo} log={log} /> : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
