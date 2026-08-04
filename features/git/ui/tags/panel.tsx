"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll";
import { commands, useProjectState } from "@/lib/backend";
import { useGitRepos } from "@/lib/git/repos";
import { notify } from "@/features/notifications";
import { useFilter } from "@/features/git/ui/manager/filter-context";
import { useLoading } from "@/features/loading/context";
import { LoadingBar } from "@/components/ui/loading";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { FadeTruncate } from "@/components/ui/fade-truncate";
import { confirm } from "@tauri-apps/plugin-dialog";

type TagEntry = { name: string; hash: string; date: string; message: string };

/** Local repository tags (not GitHub remote tags). */
export function LocalTags() {
    const { project_path } = useProjectState();
    const { scmRepoPath } = useGitRepos(project_path);
    const gitRepo = scmRepoPath ?? project_path;
    const { query } = useFilter();
    const { startLoading, stopLoading } = useLoading();
    const [tags, setTags] = useState<TagEntry[]>([]);
    const [newTagName, setNewTagName] = useState("");
    const [creating, setCreating] = useState(false);

    const refresh = useCallback(async () => {
        if (!gitRepo) {
            setTags([]);
            return;
        }
        startLoading();
        try {
            const list = await commands.gitListTags(gitRepo);
            setTags(list);
        } catch (err) {
            setTags([]);
            notify.gitError(err, "Failed to load tags");
        } finally {
            stopLoading();
        }
    }, [gitRepo, startLoading, stopLoading]);

    useEffect(() => {
        void refresh();
        const onRefresh = () => void refresh();
        window.addEventListener("shape-git-refresh", onRefresh);
        return () => window.removeEventListener("shape-git-refresh", onRefresh);
    }, [refresh]);

    const handleCreate = useCallback(async () => {
        if (!gitRepo || !newTagName.trim()) return;
        setCreating(true);
        try {
            const name = newTagName.trim();
            await commands.gitCreateTag(gitRepo, name, "HEAD", null);
            notify.success("Git", `Created tag ${name}`);
            setNewTagName("");
            window.dispatchEvent(new Event("shape-git-refresh"));
            await refresh();
        } catch (err) {
            notify.gitError(err, "Failed to create tag");
        } finally {
            setCreating(false);
        }
    }, [gitRepo, newTagName, refresh]);

    const handleDelete = useCallback(
        async (tag: TagEntry) => {
            if (!gitRepo) return;
            const ok = await confirm(`Delete tag "${tag.name}"?`, {
                title: "Delete tag",
                kind: "warning",
                okLabel: "Delete",
                cancelLabel: "Cancel",
            });
            if (!ok) return;
            try {
                await commands.gitDeleteTag(gitRepo, tag.name);
                notify.success("Git", `Deleted tag ${tag.name}`);
                window.dispatchEvent(new Event("shape-git-refresh"));
                await refresh();
            } catch (err) {
                notify.gitError(err, "Failed to delete tag");
            }
        },
        [gitRepo, refresh],
    );

    const handleCheckout = useCallback(
        async (tag: TagEntry) => {
            if (!gitRepo) return;
            const ok = await confirm(
                `Check out tag "${tag.name}"? This will detach HEAD at ${tag.hash.slice(0, 7)}.`,
                {
                    title: "Checkout tag",
                    kind: "info",
                    okLabel: "Checkout",
                    cancelLabel: "Cancel",
                },
            );
            if (!ok) return;
            try {
                await commands.gitCheckoutCommit(gitRepo, tag.hash);
                notify.success("Git", `Checked out ${tag.name}`);
                window.dispatchEvent(new Event("shape-git-refresh"));
            } catch (err) {
                notify.gitError(err, "Failed to checkout tag");
            }
        },
        [gitRepo],
    );

    const filtered = tags.filter((t) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
            t.name.toLowerCase().includes(q) ||
            t.message.toLowerCase().includes(q) ||
            t.hash.toLowerCase().includes(q)
        );
    });

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-9 shrink-0 items-center justify-between gap-2 px-3">
                <FadeTruncate className="min-w-0 flex-1 text-sm font-regular" title="Tags">
                    Tags
                </FadeTruncate>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    aria-label="Refresh tags"
                    onClick={() => void refresh()}
                >
                    <Icon name="refresh" size={16} />
                </Button>
            </div>
            <LoadingBar />
            {gitRepo ? (
                <div className="shrink-0 px-2.5 pb-2">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-transparent px-2.5">
                            <Icon name="add" size={14} className="shrink-0 text-text-muted" />
                            <Input
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                placeholder="New tag on HEAD…"
                                className="h-auto! bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                                disabled={creating}
                                spellCheck={false}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        void handleCreate();
                                    }
                                }}
                            />
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0"
                            disabled={creating || !newTagName.trim()}
                            onClick={() => void handleCreate()}
                        >
                            {creating ? "Creating…" : "Create"}
                        </Button>
                    </div>
                </div>
            ) : null}
            <ScrollArea className="min-h-0 flex-1 px-2 pb-3" fadeFrom="from-panel">
                {filtered.length === 0 ? (
                    <p className="px-2 py-6 text-sm text-text-muted">
                        {gitRepo ? "No local tags in this repository." : "Open a Git repository to view tags."}
                    </p>
                ) : (
                    <div className="flex flex-col gap-0.5">
                        {filtered.map((tag) => (
                            <ContextMenu key={tag.name}>
                                <ContextMenuTrigger asChild>
                                    <button
                                        type="button"
                                        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-panel-hover"
                                    >
                                        <Icon name="history" size={14} className="mt-0.5 shrink-0 opacity-70" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm text-text-primary">{tag.name}</span>
                                            <span className="block truncate text-xs text-text-muted">
                                                {tag.hash}
                                                {tag.date ? ` · ${tag.date}` : ""}
                                                {tag.message ? ` · ${tag.message}` : ""}
                                            </span>
                                        </span>
                                    </button>
                                </ContextMenuTrigger>
                                <ContextMenuContent>
                                    <ContextMenuItem onClick={() => void handleCheckout(tag)}>
                                        Checkout tag
                                    </ContextMenuItem>
                                    <ContextMenuSeparator />
                                    <ContextMenuItem
                                        onClick={() => {
                                            void navigator.clipboard.writeText(tag.name);
                                            notify.success("Copied", "Tag name copied.");
                                        }}
                                    >
                                        Copy tag name
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        onClick={() => {
                                            void navigator.clipboard.writeText(tag.hash);
                                            notify.success("Copied", "Commit hash copied.");
                                        }}
                                    >
                                        Copy hash
                                    </ContextMenuItem>
                                    <ContextMenuSeparator />
                                    <ContextMenuItem
                                        className="text-error focus:text-error"
                                        onClick={() => void handleDelete(tag)}
                                    >
                                        Delete tag
                                    </ContextMenuItem>
                                </ContextMenuContent>
                            </ContextMenu>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
