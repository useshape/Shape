"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
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
    ContextMenuTrigger,
} from "@/components/ui/context";
import { FadeTruncate } from "@/components/ui/fade-truncate";

type TagEntry = { name: string; hash: string; date: string; message: string };

/** Local repository tags (not GitHub remote tags). */
export function LocalTags() {
    const { project_path } = useProjectState();
    const { scmRepoPath } = useGitRepos(project_path);
    const gitRepo = scmRepoPath ?? project_path;
    const { query } = useFilter();
    const { startLoading, stopLoading } = useLoading();
    const [tags, setTags] = useState<TagEntry[]>([]);

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
            <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
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
                                </ContextMenuContent>
                            </ContextMenu>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
