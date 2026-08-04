"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileIcon } from "@/components/ui/file-icon";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend";
import type { GitBranchDetail, GitFileParams, ProjectState } from "@/lib/backend/types";
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
import { ManagerDiffEditor } from "@/features/git/ui/manager/monaco-diff";
import { useGitRepos } from "@/lib/git/repos";
import { confirm } from "@tauri-apps/plugin-dialog";
import { QuickPick } from "@/components/ui/quick-pick";
import { FadeTruncate } from "@/components/ui/fade-truncate";
import { Panel } from "@/features/panels";
import { resolveGithubAvatarUrl } from "@/lib/git/github-avatar";

async function notifyGitRefresh() {
    try {
        await emit("shape-git-refresh", {});
    } catch {
        window.dispatchEvent(new Event("shape-git-refresh"));
    }
}

type BranchKind = "local" | "remote";

type BranchItem = {
    name: string;
    displayName: string;
    kind: BranchKind;
    remote?: string;
    author?: string;
    authorEmail?: string;
    date?: string;
    ahead?: number | null;
    behind?: number | null;
};

function Avatar({
    name,
    email,
    size = 22,
}: {
    name?: string;
    email?: string;
    size?: number;
}) {
    const url = resolveGithubAvatarUrl(email, name, size * 2);
    if (!url) {
        return (
            <span
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-panel-hover text-[10px] font-medium text-text-muted"
                style={{ width: size, height: size }}
            >
                {(name || "?").slice(0, 1).toUpperCase()}
            </span>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full" draggable={false} />
    );
}

function SyncPills({ ahead, behind }: { ahead?: number | null; behind?: number | null }) {
    if (ahead == null && behind == null) return null;
    const a = ahead ?? 0;
    const b = behind ?? 0;
    if (a === 0 && b === 0) {
        return <span className="text-[11px] text-text-muted tabular-nums">synced</span>;
    }
    return (
        <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-text-muted">
            {a > 0 ? <span className="text-[var(--git-added)]">↑{a}</span> : null}
            {b > 0 ? <span className="text-[var(--git-deleted)]">↓{b}</span> : null}
        </span>
    );
}

function BranchRow({
    item,
    isCurrent,
    selected,
    onSelect,
    onCheckout,
    onDelete,
    onRename,
    onSetUpstream,
    onCopy,
    onCompare,
}: {
    item: BranchItem;
    isCurrent: boolean;
    selected: boolean;
    onSelect: () => void;
    onCheckout: () => void;
    onDelete?: () => void;
    onRename?: () => void;
    onSetUpstream?: () => void;
    onCopy: () => void;
    onCompare?: () => void;
}) {
    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <button
                    type="button"
                    onClick={onSelect}
                    onDoubleClick={onCheckout}
                    className={cn(
                        "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                        selected
                            ? "bg-panel-hover text-text-primary"
                            : "text-text-secondary hover:bg-panel-hover/60 hover:text-text-primary",
                        isCurrent && !selected && "bg-accent/10 text-text-primary",
                    )}
                >
                    <Icon
                        name={item.kind === "remote" ? "cloud" : "account_tree"}
                        size={15}
                        className={cn("shrink-0", isCurrent ? "text-accent" : "text-text-muted")}
                    />
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-sm">{item.displayName}</span>
                            {isCurrent ? (
                                <span className="shrink-0 rounded-md bg-accent/20 px-1 py-px text-[10px] font-medium text-accent">
                                    HEAD
                                </span>
                            ) : null}
                        </div>
                        {(item.author || item.date) ? (
                            <div className="truncate text-[11px] text-text-muted">
                                {[item.author, item.date].filter(Boolean).join(" · ")}
                            </div>
                        ) : null}
                    </div>
                    <SyncPills ahead={item.ahead} behind={item.behind} />
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={onCheckout}>Checkout</ContextMenuItem>
                <ContextMenuItem onClick={onCopy}>Copy name</ContextMenuItem>
                {onCompare ? <ContextMenuItem onClick={onCompare}>Compare with current</ContextMenuItem> : null}
                {onRename ? <ContextMenuItem onClick={onRename}>Rename…</ContextMenuItem> : null}
                {onSetUpstream ? <ContextMenuItem onClick={onSetUpstream}>Set upstream…</ContextMenuItem> : null}
                {onDelete ? (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={onDelete} className="text-error">
                            Delete
                        </ContextMenuItem>
                    </>
                ) : null}
            </ContextMenuContent>
        </ContextMenu>
    );
}

function SectionHeader({
    label,
    count,
    open,
    onToggle,
}: {
    label: string;
    count: number;
    open: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-medium uppercase tracking-wide text-text-muted hover:bg-panel-hover/40 hover:text-text-secondary"
        >
            <Icon name={open ? "expand_more" : "chevron_right"} size={14} className="shrink-0" />
            <span className="flex-1">{label}</span>
            <span className="tabular-nums opacity-80">{count}</span>
        </button>
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
    const [selectedName, setSelectedName] = useState<string | null>(null);
    const [localOpen, setLocalOpen] = useState(true);
    const [remoteOpen, setRemoteOpen] = useState(true);
    const [collapsedRemotes, setCollapsedRemotes] = useState<Set<string>>(new Set());
    const [compareFiles, setCompareFiles] = useState<GitFileParams[]>([]);
    const [compareLoading, setCompareLoading] = useState(false);
    const [compareFile, setCompareFile] = useState<GitFileParams | null>(null);
    const [compareOriginal, setCompareOriginal] = useState("");
    const [compareModified, setCompareModified] = useState("");
    const [sideBySide, setSideBySide] = useState(false);
    const [compareDiffLoading, setCompareDiffLoading] = useState(false);

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
            void unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
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
                commands.gitBranchDetails(project_path, "", true),
            ]);
            setLocalBranches(locals);
            setRemoteBranches(remotes);
            setCurrentBranch(current);
            const detailsWithSync = await commands.gitBranchDetails(project_path, current, true);
            setBranchDetails(detailsWithSync.length > 0 ? detailsWithSync : details);
            setSelectedName((prev) => prev ?? current ?? locals[0] ?? remotes[0] ?? null);
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
        for (const detail of branchDetails) map.set(detail.name, detail);
        return map;
    }, [branchDetails]);

    const q = filter.trim().toLowerCase();

    const localItems = useMemo((): BranchItem[] => {
        return localBranches
            .filter((b) => !q || b.toLowerCase().includes(q))
            .map((name) => {
                const d = detailByName.get(name);
                return {
                    name,
                    displayName: name,
                    kind: "local" as const,
                    author: d?.author,
                    authorEmail: d?.authorEmail,
                    date: d?.date,
                    ahead: d?.ahead,
                    behind: d?.behind,
                };
            });
    }, [localBranches, q, detailByName]);

    const remoteGroups = useMemo(() => {
        const groups = new Map<string, BranchItem[]>();
        for (const full of remoteBranches) {
            if (q && !full.toLowerCase().includes(q)) continue;
            const slash = full.indexOf("/");
            const remote = slash >= 0 ? full.slice(0, slash) : "remote";
            const short = slash >= 0 ? full.slice(slash + 1) : full;
            if (short === "HEAD") continue;
            const d = detailByName.get(full) ?? detailByName.get(short);
            const list = groups.get(remote) ?? [];
            list.push({
                name: full,
                displayName: short,
                kind: "remote",
                remote,
                author: d?.author,
                authorEmail: d?.authorEmail,
                date: d?.date,
                ahead: d?.ahead,
                behind: d?.behind,
            });
            groups.set(remote, list);
        }
        return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [remoteBranches, q, detailByName]);

    const selectedItem = useMemo(() => {
        if (!selectedName) return null;
        const local = localItems.find((b) => b.name === selectedName);
        if (local) return local;
        for (const [, items] of remoteGroups) {
            const hit = items.find((b) => b.name === selectedName);
            if (hit) return hit;
        }
        return null;
    }, [selectedName, localItems, remoteGroups]);

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
            if (selectedName === name) setSelectedName(currentBranch || null);
            await refresh();
            await notifyGitRefresh();
            notify.success("Git", `Deleted branch ${name}`);
        } catch (e) {
            notify.gitError(e);
        }
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
            setSelectedName(name);
            await refresh();
            await notifyGitRefresh();
            notify.success("Git", `Renamed ${renameTarget} to ${name}`);
        } catch (e) {
            notify.gitError(e);
        } finally {
            setRenameTarget(null);
        }
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

    const clearCompare = useCallback(() => {
        setCompareFiles([]);
        setCompareFile(null);
        setCompareOriginal("");
        setCompareModified("");
        setCompareLoading(false);
        setCompareDiffLoading(false);
    }, []);

    const handleCompare = async (branch: string) => {
        if (!project_path || !currentBranch) return;
        const short = branch.includes("/") ? branch.split("/").slice(1).join("/") : branch;
        if (short === currentBranch || branch === currentBranch) {
            notify.info("Git", "Select a different branch to compare.");
            return;
        }
        setSelectedName(branch);
        setCompareFile(null);
        setCompareOriginal("");
        setCompareModified("");
        setCompareLoading(true);
        try {
            const files = await commands.gitDiffNameStatus(project_path, currentBranch, branch);
            setCompareFiles(files);
            if (files.length === 0) {
                notify.info("Git Compare", `No differences vs ${currentBranch}`);
            }
        } catch (e) {
            setCompareFiles([]);
            notify.gitError(e, "Compare failed");
        } finally {
            setCompareLoading(false);
        }
    };

    const openCompareFile = async (file: GitFileParams) => {
        if (!project_path || !currentBranch || !selectedName) return;
        setCompareFile(file);
        setCompareDiffLoading(true);
        try {
            const [original, modified] = await Promise.all([
                commands.gitGetFileAtRef(project_path, currentBranch, file.path).catch(() => ""),
                commands.gitGetFileAtRef(project_path, selectedName, file.path).catch(() => ""),
            ]);
            setCompareOriginal(original);
            setCompareModified(modified);
        } catch (e) {
            setCompareOriginal("");
            setCompareModified("");
            notify.gitError(e, "Failed to load file diff");
        } finally {
            setCompareDiffLoading(false);
        }
    };

    const handleCopy = (name: string) => {
        void navigator.clipboard.writeText(name);
        notify.success("Copied", name);
    };

    const handleOpenRemote = async () => {
        if (!project_path) return;
        try {
            let url = await commands.gitRemoteUrl(project_path);
            if (!url) {
                notify.error("Git", "No remote URL found");
                return;
            }
            if (url.startsWith("git@")) url = url.replace(/^git@([^:]+):/, "https://$1/");
            url = url.replace(/\.git$/, "");
            const branch = selectedItem?.kind === "remote"
                ? selectedItem.displayName
                : selectedItem?.name ?? currentBranch;
            commands.openUrlExternal(`${url}/tree/${encodeURIComponent(branch)}`);
        } catch (e) {
            notify.error("Git", String(e));
        }
    };

    if (!project_path) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
                Open a project to manage branches.
            </div>
        );
    }

    const listPane = (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden border border-border-subtle bg-panel">
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle/60 px-2">
                <FadeTruncate className="min-w-0 flex-1 px-1 text-sm font-medium" title="Branches">
                    Branches
                </FadeTruncate>
                <Tooltip content="Fetch">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void commands.gitFetch(project_path).then(refresh)} disabled={loading}>
                        <Icon name="sync" size={15} />
                    </Button>
                </Tooltip>
                <Tooltip content="Pull">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void commands.gitPull(project_path).then(refresh)} disabled={loading}>
                        <Icon name="cloud_download" size={15} />
                    </Button>
                </Tooltip>
                <Tooltip content="Push">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void commands.gitPush(project_path)} disabled={loading}>
                        <Icon name="cloud_upload" size={15} />
                    </Button>
                </Tooltip>
                <Tooltip content="Refresh">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void refresh()} disabled={loading}>
                        <Icon name="refresh" size={15} />
                    </Button>
                </Tooltip>
            </div>

            <div className="shrink-0 border-b border-border-subtle/60 px-2.5 py-2">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-transparent px-2.5">
                        <Icon name="add" size={14} className="shrink-0 text-text-muted" />
                        <Input
                            value={newBranchName}
                            onChange={(e) => setNewBranchName(e.target.value)}
                            placeholder="New branch from HEAD…"
                            className="h-auto! bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleCreate();
                                }
                            }}
                        />
                    </div>
                    <Button
                        size="sm"
                        className="h-8 shrink-0"
                        disabled={!newBranchName.trim()}
                        onClick={() => void handleCreate()}
                    >
                        Create
                    </Button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                <SectionHeader
                    label="Local"
                    count={localItems.length}
                    open={localOpen}
                    onToggle={() => setLocalOpen((v) => !v)}
                />
                {localOpen ? (
                    <div className="mb-3 space-y-0.5">
                        {localItems.length === 0 ? (
                            <div className="px-2 py-2 text-sm text-text-muted">No local branches</div>
                        ) : (
                            localItems.map((item) => (
                                <BranchRow
                                    key={item.name}
                                    item={item}
                                    isCurrent={item.name === currentBranch}
                                    selected={selectedName === item.name}
                                    onSelect={() => {
                                        setSelectedName(item.name);
                                        clearCompare();
                                    }}
                                    onCheckout={() => void handleSwitch(item.name)}
                                    onDelete={item.name !== currentBranch ? () => void handleDelete(item.name) : undefined}
                                    onRename={() => {
                                        setRenameTarget(item.name);
                                        setRenameQuery(item.name);
                                    }}
                                    onSetUpstream={() => {
                                        setUpstreamTarget(item.name);
                                        setUpstreamQuery(`origin/${item.name}`);
                                    }}
                                    onCopy={() => handleCopy(item.name)}
                                    onCompare={() => void handleCompare(item.name)}
                                />
                            ))
                        )}
                    </div>
                ) : null}

                <SectionHeader
                    label="Remote"
                    count={remoteGroups.reduce((n, [, items]) => n + items.length, 0)}
                    open={remoteOpen}
                    onToggle={() => setRemoteOpen((v) => !v)}
                />
                {remoteOpen ? (
                    <div className="space-y-2">
                        {remoteGroups.length === 0 ? (
                            <div className="px-2 py-2 text-sm text-text-muted">No remote branches</div>
                        ) : (
                            remoteGroups.map(([remote, items]) => {
                                const open = !collapsedRemotes.has(remote);
                                return (
                                    <div key={remote}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCollapsedRemotes((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(remote)) next.delete(remote);
                                                    else next.add(remote);
                                                    return next;
                                                });
                                            }}
                                            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm text-text-muted hover:bg-panel-hover/40 hover:text-text-secondary"
                                        >
                                            <Icon name={open ? "expand_more" : "chevron_right"} size={14} />
                                            <Icon name="cloud" size={14} />
                                            <span className="flex-1 truncate font-medium">{remote}</span>
                                            <span className="text-xs tabular-nums">{items.length}</span>
                                        </button>
                                        {open ? (
                                            <div className="ml-2 space-y-0.5 border-l border-border-subtle/50 pl-1">
                                                {items.map((item) => (
                                                    <BranchRow
                                                        key={item.name}
                                                        item={item}
                                                        isCurrent={item.displayName === currentBranch}
                                                        selected={selectedName === item.name}
                                                        onSelect={() => {
                                                            setSelectedName(item.name);
                                                            clearCompare();
                                                        }}
                                                        onCheckout={() => void handleSwitch(item.name)}
                                                        onCopy={() => handleCopy(item.name)}
                                                        onCompare={() => void handleCompare(item.name)}
                                                    />
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );

    const detailPane = (
        <div className="workbench-panel flex h-full min-h-0 flex-col overflow-hidden border border-border-subtle bg-editor">
            {!selectedItem ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-muted">
                    Select a branch
                </div>
            ) : (
                <>
                    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle/60 px-3">
                        <Icon
                            name={selectedItem.kind === "remote" ? "cloud" : "account_tree"}
                            size={15}
                            className="shrink-0 text-text-muted"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                            {selectedItem.name}
                        </span>
                        {selectedItem.name === currentBranch || selectedItem.displayName === currentBranch ? (
                            <span className="rounded-md bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                                Current
                            </span>
                        ) : null}
                        {compareFiles.length > 0 || compareLoading ? (
                            <Tooltip content="Clear compare">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0 p-0"
                                    onClick={clearCompare}
                                >
                                    <Icon name="close" size={15} />
                                </Button>
                            </Tooltip>
                        ) : null}
                    </div>

                    <div className="space-y-3 border-b border-border-subtle/60 px-3 py-3">
                        <div className="flex items-center gap-2">
                            <Avatar name={selectedItem.author} email={selectedItem.authorEmail} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm text-text-primary">
                                    {selectedItem.author || "Unknown author"}
                                </div>
                                <div className="truncate text-xs text-text-muted">
                                    {selectedItem.date || "No recent commit info"}
                                </div>
                            </div>
                            <SyncPills ahead={selectedItem.ahead} behind={selectedItem.behind} />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-b border-border-subtle/60 px-3 py-3">
                        <Button
                            size="sm"
                            className="h-8"
                            onClick={() => void handleSwitch(selectedItem.name)}
                            disabled={selectedItem.name === currentBranch}
                        >
                            Checkout
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => void handleCompare(selectedItem.name)}
                            disabled={compareLoading}
                        >
                            Compare
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => handleCopy(selectedItem.name)}
                        >
                            Copy
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => void handleOpenRemote()}
                        >
                            Open on GitHub
                        </Button>
                        {selectedItem.kind === "local" && selectedItem.name !== currentBranch ? (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-error hover:text-error"
                                onClick={() => void handleDelete(selectedItem.name)}
                            >
                                Delete
                            </Button>
                        ) : null}
                    </div>

                    {compareLoading ? (
                        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-text-muted">
                            Loading compare…
                        </div>
                    ) : compareFiles.length > 0 ? (
                        <div className="flex min-h-0 flex-1 overflow-hidden">
                            <div className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-border-subtle/60">
                                <div className="flex h-8 shrink-0 items-center px-2.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                                    {compareFiles.length} file{compareFiles.length === 1 ? "" : "s"}
                                    <span className="ml-1.5 truncate font-normal normal-case tracking-normal">
                                        vs {currentBranch}
                                    </span>
                                </div>
                                <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
                                    <div className="space-y-0.5">
                                        {compareFiles.map((f) => {
                                            const name = f.path.split(/[\\/]/).pop() || f.path;
                                            const folder = f.path.slice(0, Math.max(0, f.path.length - name.length - 1));
                                            const selected = compareFile?.path === f.path;
                                            return (
                                                <button
                                                    key={f.path}
                                                    type="button"
                                                    onClick={() => void openCompareFile(f)}
                                                    className={cn(
                                                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                                                        selected
                                                            ? "bg-panel-hover text-text-primary"
                                                            : "hover:bg-panel-hover/60",
                                                    )}
                                                >
                                                    <FileIcon name={name} className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                                                        {name}
                                                        {folder ? (
                                                            <span className="text-text-muted"> · {folder}</span>
                                                        ) : null}
                                                    </span>
                                                    <span
                                                        className="w-4 shrink-0 text-center text-xs font-medium"
                                                        style={{
                                                            color:
                                                                f.status === "C"
                                                                    ? "var(--git-conflict)"
                                                                    : f.status === "M"
                                                                      ? "var(--git-modified)"
                                                                      : f.status === "A" || f.status === "U"
                                                                        ? "var(--git-added)"
                                                                        : f.status === "D"
                                                                          ? "var(--git-deleted)"
                                                                          : "var(--git-added)",
                                                        }}
                                                    >
                                                        {f.status}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                                {!compareFile ? (
                                    <div className="flex h-full items-center justify-center text-sm text-text-muted">
                                        Select a file to diff
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle/60 px-2.5">
                                            <FileIcon
                                                name={compareFile.path.split(/[\\/]/).pop() || compareFile.path}
                                                className="h-3.5 w-3.5 shrink-0"
                                            />
                                            <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                                                {compareFile.path}
                                            </span>
                                            <Tooltip content={sideBySide ? "Inline diff" : "Side by side"}>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 shrink-0 p-0"
                                                    onClick={() => setSideBySide((v) => !v)}
                                                >
                                                    <Icon
                                                        name={sideBySide ? "split_horizontal" : "vertical_split"}
                                                        size={15}
                                                    />
                                                </Button>
                                            </Tooltip>
                                        </div>
                                        <div className="relative min-h-0 flex-1 overflow-hidden">
                                            {compareDiffLoading ? (
                                                <div className="flex h-full items-center justify-center text-sm text-text-muted">
                                                    Loading diff…
                                                </div>
                                            ) : (
                                                <ManagerDiffEditor
                                                    original={compareOriginal}
                                                    modified={compareModified}
                                                    path={compareFile.path}
                                                    sideBySide={sideBySide}
                                                />
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="px-3 py-3 text-xs text-text-muted">
                            Double-click a branch in the list to check it out. Right-click for rename / upstream.
                            Use Compare to diff against {currentBranch || "HEAD"}.
                        </div>
                    )}
                </>
            )}
        </div>
    );

    return (
        <div className="flex h-full min-h-0 w-full overflow-hidden">
            <Panel
                className="min-h-0 flex-1"
                direction="horizontal"
                storageKey="git-manager-branches"
                hideSeparator
                paneGap="var(--workbench-gap)"
                panes={[
                    {
                        id: "branch-list",
                        preferredSize: 320,
                        minSize: 240,
                        maxSize: 480,
                        children: listPane,
                    },
                    {
                        id: "branch-detail",
                        flexible: true,
                        minSize: 280,
                        children: detailPane,
                    },
                ]}
            />

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
