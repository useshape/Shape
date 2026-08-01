"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { List, type RowComponentProps } from "react-window";
import { emit, listen } from "@tauri-apps/api/event";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend";
import type { GitBranchDetail, ProjectState } from "@/lib/backend/types";
import { notify } from "@/features/notifications";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { Tooltip } from "@/components/ui/tooltip";
import { useFilter } from "@/features/git/ui/manager/filter-context";
import { useGitRepos } from "@/lib/git/repos";
import { confirm } from "@tauri-apps/plugin-dialog";
import { QuickPick } from "@/components/ui/quick-pick";
import { ScrollArea } from "@/components/ui/scroll";
import { FadeTruncate } from "@/components/ui/fade-truncate";

const ROW_HEIGHT = 44;
const LIST_MAX_HEIGHT = 560;
const VIRTUAL_BRANCH_THRESHOLD = 8;

async function notifyGitRefresh() {
    try {
        await emit("shape-git-refresh", {});
    } catch {
        window.dispatchEvent(new Event("shape-git-refresh"));
    }
}

function BranchRow({
    name,
    displayName,
    isCurrent,
    author,
    date,
    ahead,
    behind,
    onCheckout,
    onDelete,
    onRename,
    onSetUpstream,
    onViewLog,
    onCompare,
    canDelete,
}: {
    name: string;
    displayName: string;
    isCurrent: boolean;
    author?: string;
    date?: string;
    ahead?: number | null;
    behind?: number | null;
    onCheckout: () => void;
    onDelete?: () => void;
    onRename?: () => void;
    onSetUpstream?: () => void;
    onViewLog?: () => void;
    onCompare?: () => void;
    canDelete?: boolean;
}) {
    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onCheckout}
                    className={cn(
                        "h-auto w-full justify-start gap-2 px-2 py-1.5 rounded-xl text-left font-normal group min-h-[40px]",
                        isCurrent ? "bg-panel-hover text-text-primary" : "text-text-secondary hover:text-text-primary"
                    )}
                >
                    <Icon name="account_tree" size={16} className="shrink-0 text-text-muted" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm truncate min-w-0">{displayName}</span>
                            {isCurrent ? <Icon name="check" size={16} className="shrink-0 text-accent" /> : null}
                            {ahead != null && behind != null ? (
                                <span className="text-xs text-text-muted shrink-0 tabular-nums">
                                    ↑{ahead} ↓{behind}
                                </span>
                            ) : null}
                        </div>
                        {(author || date) ? (
                            <div className="text-sm text-text-muted truncate">
                                {[author, date].filter(Boolean).join(" · ")}
                            </div>
                        ) : null}
                    </div>
                    {canDelete && onDelete ? (
                        <span
                            className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error shrink-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                        >
                            <Icon name="delete" size={16} />
                        </span>
                    ) : null}
                </Button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={onCheckout}>Checkout</ContextMenuItem>
                {onRename ? <ContextMenuItem onClick={onRename}>Rename...</ContextMenuItem> : null}
                {onSetUpstream ? <ContextMenuItem onClick={onSetUpstream}>Set Upstream...</ContextMenuItem> : null}
                {onViewLog ? <ContextMenuItem onClick={onViewLog}>View Log</ContextMenuItem> : null}
                {onCompare ? <ContextMenuItem onClick={onCompare}>Compare with Current</ContextMenuItem> : null}
                {canDelete && onDelete ? (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={onDelete} className="text-error">Delete</ContextMenuItem>
                    </>
                ) : null}
            </ContextMenuContent>
        </ContextMenu>
    );
}

type LocalBranchItem = {
    name: string;
    author?: string;
    date?: string;
    ahead?: number | null;
    behind?: number | null;
};

type BranchListRowProps = {
    items: LocalBranchItem[];
    currentBranch: string;
    onCheckout: (name: string) => void;
    onDelete: (name: string) => void;
    onRename: (name: string) => void;
    onSetUpstream: (name: string) => void;
    onViewLog: (name: string) => void;
    onCompare: (name: string) => void;
};

function BranchListRow({
    index,
    style,
    ariaAttributes,
    items,
    currentBranch,
    onCheckout,
    onDelete,
    onRename,
    onSetUpstream,
    onViewLog,
    onCompare,
}: RowComponentProps<BranchListRowProps>) {
    const branch = items[index];
    return (
        <div style={style} className="px-0.5" {...ariaAttributes}>
            <BranchRow
                name={branch.name}
                displayName={branch.name}
                isCurrent={branch.name === currentBranch}
                author={branch.author}
                date={branch.date}
                ahead={branch.ahead}
                behind={branch.behind}
                onCheckout={() => onCheckout(branch.name)}
                onDelete={() => onDelete(branch.name)}
                onRename={() => onRename(branch.name)}
                onSetUpstream={() => onSetUpstream(branch.name)}
                onViewLog={() => onViewLog(branch.name)}
                onCompare={() => onCompare(branch.name)}
                canDelete={branch.name !== currentBranch}
            />
        </div>
    );
}

function VirtualBranchList({
    items,
    currentBranch,
    onCheckout,
    onDelete,
    onRename,
    onSetUpstream,
    onViewLog,
    onCompare,
}: {
    items: LocalBranchItem[];
    currentBranch: string;
    onCheckout: (name: string) => void;
    onDelete: (name: string) => void;
    onRename: (name: string) => void;
    onSetUpstream: (name: string) => void;
    onViewLog: (name: string) => void;
    onCompare: (name: string) => void;
}) {
    const height = Math.min(items.length * ROW_HEIGHT, LIST_MAX_HEIGHT);
    const listHeight = Math.max(height, ROW_HEIGHT);

    if (items.length === 0) {
        return <div className="px-3 py-2 text-sm text-text-muted">No branches</div>;
    }

    if (items.length <= VIRTUAL_BRANCH_THRESHOLD) {
        return (
            <div className="space-y-0.5">
                {items.map((branch) => (
                    <BranchRow
                        key={branch.name}
                        name={branch.name}
                        displayName={branch.name}
                        isCurrent={branch.name === currentBranch}
                        author={branch.author}
                        date={branch.date}
                        ahead={branch.ahead}
                        behind={branch.behind}
                        onCheckout={() => onCheckout(branch.name)}
                        onDelete={() => onDelete(branch.name)}
                        onRename={() => onRename(branch.name)}
                        onSetUpstream={() => onSetUpstream(branch.name)}
                        onViewLog={() => onViewLog(branch.name)}
                        onCompare={() => onCompare(branch.name)}
                        canDelete={branch.name !== currentBranch}
                    />
                ))}
            </div>
        );
    }

    return (
        <List<BranchListRowProps>
            className="no-scrollbar"
            rowCount={items.length}
            rowHeight={ROW_HEIGHT}
            defaultHeight={listHeight}
            style={{ height: listHeight, width: "100%" }}
            rowComponent={BranchListRow}
            rowProps={{
                items,
                currentBranch,
                onCheckout,
                onDelete,
                onRename,
                onSetUpstream,
                onViewLog,
                onCompare,
            }}
        />
    );
}

export function BranchWindow() {
    const { query: filter } = useFilter();
    const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
    const { scmRepoPath } = useGitRepos(workspaceRoot);
    const project_path = scmRepoPath ?? workspaceRoot;
    const [localBranches, setLocalBranches] = useState<string[]>([]);
    const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
    const [branchDetails, setBranchDetails] = useState<GitBranchDetail[]>([]);
    const [currentBranch, setCurrentBranch] = useState("");
    const [newBranchName, setNewBranchName] = useState("");
    const [loading, setLoading] = useState(false);
    const [renameTarget, setRenameTarget] = useState<string | null>(null);
    const [renameQuery, setRenameQuery] = useState("");
    const [upstreamTarget, setUpstreamTarget] = useState<string | null>(null);
    const [upstreamQuery, setUpstreamQuery] = useState("");

    useEffect(() => {
        void commands.getProjectState().then((state) => {
            setWorkspaceRoot(state.project_path ?? null);
        });

        const unlistenPromise = listen<ProjectState>("project-state-update", (event) => {
            setWorkspaceRoot(event.payload.project_path ?? null);
        });

        return () => {
            void unlistenPromise.then((unlisten) => unlisten()).catch(() => { });
        };
    }, []);

    const refresh = useCallback(async () => {
        if (!project_path) return;
        setLoading(true);
        try {
            const [locals, remotes, current, details] = await Promise.all([
                commands.gitBranches(project_path),
                commands.gitRemoteBranches(project_path),
                commands.gitCurrentBranch(project_path),
                commands.gitBranchDetails(project_path, ""),
            ]);
            setLocalBranches(locals);
            setRemoteBranches(remotes);
            setCurrentBranch(current);
            const detailsWithSync = await commands.gitBranchDetails(project_path, current);
            setBranchDetails(detailsWithSync.length > 0 ? detailsWithSync : details);
        } catch (e) {
            notify.gitError(e);
        } finally {
            setLoading(false);
        }
    }, [project_path]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const detailByName = useMemo(() => {
        const map = new Map<string, GitBranchDetail>();
        for (const detail of branchDetails) {
            map.set(detail.name, detail);
        }
        return map;
    }, [branchDetails]);

    const normalizedFilter = filter.trim().toLowerCase();

    const filteredLocal = useMemo(
        () => localBranches
            .filter((b) => !normalizedFilter || b.toLowerCase().includes(normalizedFilter))
            .map((name) => {
                const detail = detailByName.get(name);
                return {
                    name,
                    author: detail?.author,
                    date: detail?.date,
                    ahead: detail?.ahead,
                    behind: detail?.behind,
                };
            }),
        [localBranches, normalizedFilter, detailByName],
    );

    const filteredRemote = useMemo(
        () => remoteBranches.filter((b) => !normalizedFilter || b.toLowerCase().includes(normalizedFilter)),
        [remoteBranches, normalizedFilter],
    );

    const handleSwitch = async (name: string) => {
        if (!project_path) return;
        try {
            await commands.gitSwitchBranch(project_path, name);
            await refresh();
            await notifyGitRefresh();
            notify.success("Git", `Switched to ${name}`);
        } catch (e) {
            notify.gitError(e);
        }
    };

    const handleCreate = async () => {
        if (!project_path || !newBranchName.trim()) return;
        const createdName = newBranchName.trim();
        try {
            await commands.gitCreateBranch(project_path, createdName);
            await commands.gitSwitchBranch(project_path, createdName);
            setNewBranchName("");
            await refresh();
            await notifyGitRefresh();
            notify.success("Git", `Created and switched to ${createdName}`);
        } catch (e) {
            notify.gitError(e);
        }
    };

    const handleDelete = async (name: string) => {
        if (!project_path) return;
        if (name === currentBranch) {
            notify.error("Git", "Cannot delete the current branch.");
            return;
        }
        const ok = await confirm(`Delete branch "${name}"?`, {
            title: "Delete branch",
            kind: "warning",
            okLabel: "Delete",
            cancelLabel: "Cancel",
        });
        if (!ok) return;
        try {
            await commands.gitDeleteBranch(project_path, name);
            await refresh();
            await notifyGitRefresh();
            notify.success("Git", `Deleted branch ${name}`);
        } catch (e) {
            notify.gitError(e);
        }
    };

    const handleRename = (oldName: string) => {
        setRenameTarget(oldName);
        setRenameQuery(oldName);
    };

    const applyRename = async (next: string) => {
        if (!project_path || !renameTarget) return;
        const name = next.trim();
        if (!name || name === renameTarget) {
            setRenameTarget(null);
            return;
        }
        try {
            await commands.gitRenameBranch(project_path, renameTarget, name);
            await refresh();
            await notifyGitRefresh();
            notify.success("Git", `Renamed ${renameTarget} to ${name}`);
        } catch (e) {
            notify.gitError(e);
        } finally {
            setRenameTarget(null);
        }
    };

    const handleSetUpstream = (branch: string) => {
        setUpstreamTarget(branch);
        setUpstreamQuery(`origin/${branch}`);
    };

    const applyUpstream = async (upstream: string) => {
        if (!project_path || !upstreamTarget) return;
        const value = upstream.trim();
        if (!value) {
            setUpstreamTarget(null);
            return;
        }
        try {
            await commands.gitSetUpstream(project_path, upstreamTarget, value);
            await refresh();
            await notifyGitRefresh();
            notify.success("Git", `Upstream set to ${value}`);
        } catch (e) {
            notify.gitError(e);
        } finally {
            setUpstreamTarget(null);
        }
    };

    const handleViewLog = (branch: string) => {
        const detail = detailByName.get(branch);
        if (detail) {
            notify.info("Git", `Last commit on ${branch}: ${detail.author} · ${detail.date}`);
        } else {
            notify.info("Git", `No log details available for ${branch}`);
        }
    };

    const handleCompare = async (branch: string) => {
        if (!project_path || !currentBranch) return;
        if (branch === currentBranch) {
            notify.info("Git", "Select a different branch to compare.");
            return;
        }
        try {
            const diff = await commands.gitDiffBranches(project_path, currentBranch, branch);
            const summary = diff.trim() || "No differences.";
            notify.info("Git Compare", summary.slice(0, 500));
        } catch (e) {
            notify.gitError(e, "Compare failed");
        }
    };

    const handlePull = async () => {
        if (!project_path) return;
        try {
            await commands.gitPull(project_path);
            await refresh();
            notify.info("Git", "Pulled successfully.");
        } catch (e) {
            notify.gitError(e, "Pull failed");
        }
    };

    const handlePush = async () => {
        if (!project_path) return;
        try {
            await commands.gitPush(project_path);
            notify.info("Git", "Pushed successfully.");
        } catch (e) {
            notify.gitError(e, "Push failed");
        }
    };

    const handleFetch = async () => {
        if (!project_path) return;
        try {
            await commands.gitFetch(project_path);
            await refresh();
            notify.info("Git", "Fetched remotes.");
        } catch (e) {
            notify.gitError(e, "Fetch failed");
        }
    };

    if (!project_path) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
                Open a project to manage branches.
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-hidden text-text-primary">
            <div className="flex shrink-0 items-center gap-2 px-3 py-2">
                <FadeTruncate className="min-w-0 flex-1 text-sm font-medium" title="Branches">
                    Branches
                </FadeTruncate>
                <Tooltip content="Fetch">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void handleFetch()} disabled={loading}>
                        <Icon name="sync" size={16} />
                    </Button>
                </Tooltip>
                <Tooltip content="Pull">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void handlePull()} disabled={loading}>
                        <Icon name="download" size={16} />
                    </Button>
                </Tooltip>
                <Tooltip content="Push">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void handlePush()} disabled={loading}>
                        <Icon name="upload" size={16} />
                    </Button>
                </Tooltip>
                <Tooltip content="Refresh">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void refresh()} disabled={loading}>
                        <Icon name="refresh" size={16} />
                    </Button>
                </Tooltip>
            </div>

            <div className="px-3 py-2 shrink-0">
                <div className="text-sm text-text-muted mb-1.5">New branch</div>
                <div className="flex flex-col gap-2 @[420px]:flex-row @container">
                    <Input
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                        placeholder="Branch name"
                        className="h-8 min-w-0 flex-1"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                void handleCreate();
                            }
                        }}
                    />
                    <Button size="sm" className="shrink-0" onClick={() => void handleCreate()} disabled={!newBranchName.trim()}>
                        Create
                    </Button>
                </div>
            </div>

            <ScrollArea className="min-h-0 flex-1 px-3 py-2">
                <div className="space-y-4 pb-4">
                <section>
                    <div className="py-1 text-sm font-medium text-text-muted">
                        Local branches ({filteredLocal.length})
                    </div>
                    <VirtualBranchList
                        items={filteredLocal}
                        currentBranch={currentBranch}
                        onCheckout={(name) => void handleSwitch(name)}
                        onDelete={(name) => void handleDelete(name)}
                        onRename={(name) => void handleRename(name)}
                        onSetUpstream={(name) => void handleSetUpstream(name)}
                        onViewLog={handleViewLog}
                        onCompare={(name) => void handleCompare(name)}
                    />
                </section>

                <section>
                    <div className="py-1 text-sm font-medium text-text-muted">
                        Remote branches ({filteredRemote.length})
                    </div>
                    <div className="space-y-0.5">
                        {filteredRemote.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-text-muted">No remote branches</div>
                        ) : (
                            filteredRemote.map((branch) => {
                                const shortName = branch.includes("/") ? branch.split("/").slice(1).join("/") : branch;
                                return (
                                    <BranchRow
                                        key={branch}
                                        name={branch}
                                        displayName={branch}
                                        isCurrent={shortName === currentBranch}
                                        onCheckout={() => void handleSwitch(branch)}
                                        onViewLog={() => handleViewLog(shortName)}
                                        onCompare={() => void handleCompare(shortName)}
                                    />
                                );
                            })
                        )}
                    </div>
                </section>
                </div>
            </ScrollArea>

            <QuickPick
                open={renameTarget != null}
                onOpenChange={(open) => {
                    if (!open) setRenameTarget(null);
                }}
                title="Rename branch"
                placeholder="New branch name"
                query={renameQuery}
                onQueryChange={setRenameQuery}
                items={
                    renameQuery.trim()
                        ? [{ id: "rename", label: `Rename to “${renameQuery.trim()}”` }]
                        : []
                }
                onSelect={() => void applyRename(renameQuery)}
                onSubmitQuery={(q) => void applyRename(q)}
                emptyText="Type a new branch name"
            />
            <QuickPick
                open={upstreamTarget != null}
                onOpenChange={(open) => {
                    if (!open) setUpstreamTarget(null);
                }}
                title="Set upstream"
                placeholder="origin/main"
                query={upstreamQuery}
                onQueryChange={setUpstreamQuery}
                items={
                    upstreamQuery.trim()
                        ? [{ id: "upstream", label: `Set upstream to “${upstreamQuery.trim()}”` }]
                        : []
                }
                onSelect={() => void applyUpstream(upstreamQuery)}
                onSubmitQuery={(q) => void applyUpstream(q)}
                emptyText="Type an upstream (e.g. origin/main)"
            />
        </div>
    );
}
