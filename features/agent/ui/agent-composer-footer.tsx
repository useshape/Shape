"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { commands, useProjectState } from "@/lib/backend";
import { useGitBranch } from "@/features/workbench/hooks/use-git-branch";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";

/** Branch picker under the composer (Agent view only). */
export function AgentComposerFooter() {
    const { project_path } = useProjectState();
    const branch = useGitBranch(project_path);
    const [branches, setBranches] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState("");
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [open, setOpen] = useState(false);

    const loadBranches = useCallback(async () => {
        if (!project_path) {
            setBranches([]);
            return;
        }
        setLoading(true);
        try {
            const list = await commands.gitBranches(project_path);
            setBranches(list);
        } catch {
            setBranches([]);
        } finally {
            setLoading(false);
        }
    }, [project_path]);

    useEffect(() => {
        if (open) void loadBranches();
    }, [open, loadBranches]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return branches;
        return branches.filter((b) => b.toLowerCase().includes(q));
    }, [branches, query]);

    const switchBranch = async (name: string) => {
        if (!project_path || name === branch) {
            setOpen(false);
            return;
        }
        try {
            await commands.gitSwitchBranch(project_path, name);
            window.dispatchEvent(new Event("shape-git-refresh"));
            setOpen(false);
        } catch {
            /* ignore */
        }
    };

    const createBranch = async () => {
        if (!project_path || !newName.trim()) return;
        try {
            await commands.gitCreateBranch(project_path, newName.trim());
            await commands.gitSwitchBranch(project_path, newName.trim());
            window.dispatchEvent(new Event("shape-git-refresh"));
            setCreating(false);
            setNewName("");
            setOpen(false);
        } catch {
            /* ignore */
        }
    };

    return (
        <div className="flex items-center gap-1 px-4 pb-2 pt-0.5">
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="inline-flex max-w-[220px] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-text-muted transition-colors hover:bg-panel-hover hover:text-text-primary"
                        disabled={!project_path}
                    >
                        <span className="truncate">{branch || "No branch"}</span>
                        <Icon name="expand_more" size={12} className="shrink-0 opacity-70" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 p-0" side="top" sideOffset={6}>
                    {creating ? (
                        <div className="space-y-3 p-3">
                            <div>
                                <p className="text-sm font-medium text-text-primary">Create Branch</p>
                                <p className="mt-0.5 text-xs text-text-muted">
                                    Create a branch from {branch || "HEAD"}
                                </p>
                            </div>
                            <input
                                autoFocus
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") void createBranch();
                                    if (e.key === "Escape") setCreating(false);
                                }}
                                placeholder="Branch name"
                                className="h-8 w-full rounded-md border border-border-subtle bg-surface-1 px-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong"
                            />
                            <div className="flex items-center justify-between">
                                <button
                                    type="button"
                                    className="text-xs text-text-muted hover:text-text-primary"
                                    onClick={() => setCreating(false)}
                                >
                                    Cancel <span className="text-text-muted">Esc</span>
                                </button>
                                <Button size="sm" className="h-7 rounded-full px-3 text-xs" onClick={() => void createBranch()}>
                                    Confirm
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="border-b border-border-subtle p-2">
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search branches..."
                                    className="h-7 w-full rounded-md bg-transparent px-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
                                />
                            </div>
                            <div className="max-h-56 overflow-y-auto py-1">
                                {loading ? (
                                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
                                        <Icon name="refresh" size={12} className="animate-spin" />
                                        Loading...
                                    </div>
                                ) : filtered.length === 0 ? (
                                    <div className="px-3 py-2 text-xs text-text-muted">No branches</div>
                                ) : (
                                    filtered.map((name) => (
                                        <DropdownMenuItem
                                            key={name}
                                            className="text-sm"
                                            onClick={() => void switchBranch(name)}
                                        >
                                            <span className={cn("truncate", name === branch && "font-medium")}>
                                                {name}
                                            </span>
                                            {name === branch ? (
                                                <Icon name="check" size={12} className="ml-auto shrink-0" />
                                            ) : null}
                                        </DropdownMenuItem>
                                    ))
                                )}
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="gap-1.5 text-sm"
                                onSelect={(e) => {
                                    e.preventDefault();
                                    setCreating(true);
                                }}
                            >
                                <Icon name="add" size={14} />
                                Create Branch
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
