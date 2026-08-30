"use client";

import { useEffect, useState } from "react";
import { commands, useProjectState } from "@/lib/backend";
import type { Conversation } from "@/lib/backend/types";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
    formatTimeAgo,
    getRepoName,
    loadRepoHistory,
    type RepoHistoryEntry,
} from "@/lib/repo-history";
import { projectPathsEqual } from "../lib/open-project";
import { Button } from "@/components/ui/button";
import { ModelAvatarStack } from "@/features/chat/ui/message/bubble";

function shortAgo(ts: number) {
    return formatTimeAgo(ts).replace(" ago", "").replace("just now", "now");
}

function modelsFromConversation(c: Conversation): string[] {
    const models: string[] = [];
    for (const m of c.history || []) {
        if (m.role === "assistant" && m.model) models.push(m.model);
    }
    return [...new Set(models)].slice(-4);
}

/** Cursor-style: Repositories as folders with nested chats. Icons on the left. */
export function RepoList() {
    const { project_path } = useProjectState();
    const [recents, setRecents] = useState<RepoHistoryEntry[]>([]);
    const [chatsByPath, setChatsByPath] = useState<Record<string, Conversation[]>>({});
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    useEffect(() => {
        setRecents(loadRepoHistory().slice(0, 16));
        const sync = () => setRecents(loadRepoHistory().slice(0, 16));
        window.addEventListener("shape-repo-history-changed", sync);
        return () => window.removeEventListener("shape-repo-history-changed", sync);
    }, []);

    useEffect(() => {
        if (project_path) {
            setExpanded((prev) => ({ ...prev, [project_path]: true }));
        }
    }, [project_path]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const next: Record<string, Conversation[]> = {};
            for (const entry of recents) {
                try {
                    const list = await commands.getConversations(entry.path);
                    next[entry.path] = list.slice(0, 12);
                } catch {
                    next[entry.path] = [];
                }
            }
            if (!cancelled) setChatsByPath(next);
        })();
        const onRefresh = () => {
            void (async () => {
                const next: Record<string, Conversation[]> = {};
                for (const entry of recents) {
                    try {
                        next[entry.path] = (await commands.getConversations(entry.path)).slice(0, 12);
                    } catch {
                        next[entry.path] = [];
                    }
                }
                setChatsByPath(next);
            })();
        };
        window.addEventListener("shape-chat-refresh", onRefresh);
        return () => {
            cancelled = true;
            window.removeEventListener("shape-chat-refresh", onRefresh);
        };
    }, [recents]);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between pl-3 pr-1 pb-1 pt-3">
                <span className="text-sm font-medium text-text-muted">Repositories</span>
                <div className="flex items-center">
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Open folder"
                        onClick={() => window.dispatchEvent(new Event("open-folder-request"))}
                    >
                        <Icon name="create_new_folder" size={16} />
                    </Button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 no-scrollbar">
                {recents.map((entry) => {
                    const active =
                        project_path != null && projectPathsEqual(entry.path, project_path);
                    const open = expanded[entry.path] ?? active;
                    const chats = chatsByPath[entry.path] ?? [];
                    return (
                        <div key={entry.path} className="mb-0.5">
                            <button
                                type="button"
                                onClick={() => {
                                    setExpanded((p) => ({ ...p, [entry.path]: !open }));
                                    if (!active) {
                                        window.dispatchEvent(
                                            new CustomEvent("shape-open-project", {
                                                detail: { path: entry.path },
                                            }),
                                        );
                                    }
                                }}
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                                    active
                                        ? "bg-panel-active text-text-primary"
                                        : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                                )}
                            >
                                <Icon
                                    name={open ? "folder_open" : "folder"}
                                    size={15}
                                    className="shrink-0 text-text-muted"
                                />
                                <span className="min-w-0 flex-1 truncate font-medium">
                                    {getRepoName(entry.path)}
                                </span>
                            </button>

                            {open ? (
                                <div className="ml-2 border-l border-border-subtle pl-2">
                                    {chats.length === 0 ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!active) {
                                                    window.dispatchEvent(
                                                        new CustomEvent("shape-open-project", {
                                                            detail: { path: entry.path },
                                                        }),
                                                    );
                                                }
                                                window.dispatchEvent(new CustomEvent("shape-chat-new"));
                                            }}
                                            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-text-muted hover:bg-panel-hover hover:text-text-secondary"
                                        >
                                            <Icon name="add" size={13} className="shrink-0" />
                                            <span>New chat</span>
                                        </button>
                                    ) : (
                                        chats.map((c) => {
                                            const models = modelsFromConversation(c);
                                            return (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => {
                                                        if (!active) {
                                                            window.dispatchEvent(
                                                                new CustomEvent("shape-open-project", {
                                                                    detail: { path: entry.path },
                                                                }),
                                                            );
                                                        }
                                                        window.dispatchEvent(
                                                            new CustomEvent("shape-chat-load", {
                                                                detail: { id: c.id },
                                                            }),
                                                        );
                                                    }}
                                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                                                >
                                                    <ModelAvatarStack models={models} size={14} />
                                                    <span className="min-w-0 flex-1 truncate">
                                                        {c.title?.trim() || "Untitled"}
                                                    </span>
                                                    <span className="shrink-0 text-xs text-text-muted">
                                                        {shortAgo(c.timestamp)}
                                                    </span>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            ) : null}
                        </div>
                    );
                })}

                {recents.length === 0 ? (
                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new Event("open-folder-request"))}
                        className="mx-1 mt-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-text-muted hover:bg-panel-hover hover:text-text-secondary"
                    >
                        <Icon name="folder" size={15} />
                        Open folder…
                    </button>
                ) : null}
            </div>
        </div>
    );
}
