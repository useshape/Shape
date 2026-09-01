"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { commands, useProjectState } from "@/lib/backend";
import {
    getRepoName,
    loadRepoHistory,
    type RepoHistoryEntry,
} from "@/lib/repo-history";
import { useGitBranch } from "@/features/workbench/hooks/use-git-branch";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown";

/** Ghost repo / branch selectors — empty chat footer (repo left, branch right). */
export function ComposerContextBar({ className }: { className?: string }) {
    const { project_path } = useProjectState();
    const branch = useGitBranch(project_path);
    const [recents, setRecents] = useState<RepoHistoryEntry[]>([]);
    const [repoQuery, setRepoQuery] = useState("");
    const [branches, setBranches] = useState<string[]>([]);
    const [branchQuery, setBranchQuery] = useState("");

    useEffect(() => {
        setRecents(loadRepoHistory().slice(0, 20));
        const sync = () => setRecents(loadRepoHistory().slice(0, 20));
        window.addEventListener("shape-repo-history-changed", sync);
        return () => window.removeEventListener("shape-repo-history-changed", sync);
    }, []);

    useEffect(() => {
        if (!project_path) {
            setBranches([]);
            return;
        }
        let cancelled = false;
        void commands
            .gitBranches(project_path)
            .then((list) => {
                if (!cancelled) setBranches(list);
            })
            .catch(() => {
                if (!cancelled) setBranches([]);
            });
        return () => {
            cancelled = true;
        };
    }, [project_path]);

    const filteredRepos = useMemo(() => {
        const q = repoQuery.trim().toLowerCase();
        if (!q) return recents;
        return recents.filter(
            (r) =>
                getRepoName(r.path).toLowerCase().includes(q) ||
                r.path.toLowerCase().includes(q),
        );
    }, [recents, repoQuery]);

    const filteredBranches = useMemo(() => {
        const q = branchQuery.trim().toLowerCase();
        if (!q) return branches;
        return branches.filter((b) => b.toLowerCase().includes(q));
    }, [branches, branchQuery]);

    const repoLabel = project_path ? getRepoName(project_path) : "Open repo";

    return (
        <div className={cn("flex w-full items-center justify-between gap-2 px-1", className)}>
            <DropdownMenu
                onOpenChange={(open) => {
                    if (!open) setRepoQuery("");
                }}
            >
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="inline-flex max-w-[50%] items-center gap-1.5 rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon name="folder" size={14} className="shrink-0 opacity-70" />
                        <span className="truncate">{repoLabel}</span>
                        <Icon name="expand_more" size={14} className="shrink-0 opacity-50" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 p-0">
                    <input
                        value={repoQuery}
                        onChange={(e) => setRepoQuery(e.target.value)}
                        placeholder="Search repos…"
                        className="h-8 w-full border-0 border-b border-border-subtle bg-transparent px-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
                        autoFocus
                    />
                    <DropdownMenuLabel className="px-2 py-1 text-xs text-text-muted">
                        Recents
                    </DropdownMenuLabel>
                    {filteredRepos.map((r) => (
                        <DropdownMenuItem
                            key={r.path}
                            onClick={() => {
                                window.dispatchEvent(
                                    new CustomEvent("shape-open-project", {
                                        detail: { path: r.path },
                                    }),
                                );
                            }}
                            className="gap-2"
                        >
                            <Icon name="folder" size={14} className="shrink-0 text-text-muted" />
                            <span className="min-w-0 flex-1 truncate">{getRepoName(r.path)}</span>
                            {project_path === r.path ? (
                                <Icon name="check" size={14} className="shrink-0" />
                            ) : null}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() => window.dispatchEvent(new Event("open-folder-request"))}
                        className="gap-2"
                    >
                        <Icon name="add" size={14} />
                        Use Existing / New Folder…
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu
                onOpenChange={(open) => {
                    if (!open) setBranchQuery("");
                }}
            >
                <DropdownMenuTrigger asChild disabled={!project_path}>
                    <button
                        type="button"
                        disabled={!project_path}
                        className="inline-flex max-w-[50%] items-center gap-1.5 rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary disabled:opacity-40"
                    >
                        <Icon name="git_branch" size={14} className="shrink-0 opacity-70" />
                        <span className="truncate">{branch ?? "Branch"}</span>
                        <Icon name="expand_more" size={14} className="shrink-0 opacity-50" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 p-0">
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
                                onClick={() => {
                                    if (!project_path) return;
                                    void commands
                                        .gitSwitchBranch(project_path, b)
                                        .then(() => {
                                            window.dispatchEvent(new Event("shape-git-refresh"));
                                        })
                                        .catch((err) => {
                                            void import("@/features/notifications").then(
                                                ({ notify }) => notify.gitError(err),
                                            );
                                        });
                                }}
                                className="gap-2"
                            >
                                <span className="min-w-0 flex-1 truncate">{b}</span>
                                {branch === b ? (
                                    <Icon name="check" size={14} className="shrink-0" />
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
        </div>
    );
}
