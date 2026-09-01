"use client";

import { useEffect, useRef, useState } from "react";
import { commands, useProjectState } from "@/lib/backend";
import type { Conversation } from "@/lib/backend/types";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
    formatTimeAgo,
    getRepoName,
    loadRepoHistory,
    removeFromRepoHistory,
    type RepoHistoryEntry,
} from "@/lib/repo-history";
import { projectPathsEqual } from "../lib/open-project";
import { Button } from "@/components/ui/button";
import { ModelAvatarStack, WorkingDots } from "@/features/chat/ui/message/bubble";
import { useIsChatGenerating } from "@/features/chat/lib/generating-chats";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";

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

function ChatRow({
    id,
    title,
    models,
    ago,
    activeRepo,
    repoPath,
}: {
    id: string;
    title: string;
    models: string[];
    ago: string;
    activeRepo: boolean;
    repoPath: string;
}) {
    const generating = useIsChatGenerating(id);
    const [renaming, setRenaming] = useState(false);
    const [draft, setDraft] = useState(title);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!renaming) setDraft(title);
    }, [title, renaming]);

    useEffect(() => {
        if (!renaming) return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [renaming]);

    const openChat = () => {
        if (!activeRepo) {
            window.dispatchEvent(
                new CustomEvent("shape-open-project", { detail: { path: repoPath } }),
            );
        }
        window.dispatchEvent(new CustomEvent("shape-chat-load", { detail: { id } }));
    };

    const commitRename = () => {
        const next = draft.trim();
        setRenaming(false);
        if (!next || next === title) {
            setDraft(title);
            return;
        }
        window.dispatchEvent(
            new CustomEvent("shape-chat-rename", { detail: { id, title: next } }),
        );
        window.dispatchEvent(new CustomEvent("shape-chat-refresh"));
    };

    const remove = () => {
        void commands.deleteConversation(id).catch(() => {});
        window.dispatchEvent(new CustomEvent("shape-chat-close-tab", { detail: { id } }));
        window.dispatchEvent(new CustomEvent("shape-chat-refresh"));
    };

    const startRename = () => {
        setDraft(title);
        setRenaming(true);
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    className={cn(
                        "group/chat flex w-full items-center gap-1 rounded-md px-2 py-1 text-sm",
                        "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                    )}
                >
                    {renaming ? (
                        <input
                            ref={inputRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitRename();
                                }
                                if (e.key === "Escape") {
                                    e.preventDefault();
                                    setDraft(title);
                                    setRenaming(false);
                                }
                            }}
                            className="min-w-0 flex-1 rounded bg-transparent px-0 text-sm text-text-primary outline-none ring-1 ring-border"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={openChat}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                            <ModelAvatarStack models={models} size={14} />
                            <span className="min-w-0 flex-1 truncate">{title}</span>
                            {generating ? (
                                <WorkingDots className="imsg-typing imsg-typing-sm shrink-0" />
                            ) : (
                                <span className="shrink-0 text-xs text-text-muted opacity-0 group-hover/chat:opacity-100">
                                    {ago}
                                </span>
                            )}
                        </button>
                    )}
                    {!renaming ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    aria-label="Chat options"
                                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-text-muted opacity-0 hover:bg-panel-active hover:text-text-primary group-hover/chat:opacity-100 data-[state=open]:opacity-100"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Icon name="more_horiz" size={14} />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-40">
                                <DropdownMenuItem onClick={openChat}>Open</DropdownMenuItem>
                                <DropdownMenuItem onClick={startRename}>Rename</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={remove}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-40">
                <ContextMenuItem onClick={openChat}>Open</ContextMenuItem>
                <ContextMenuItem onClick={startRename}>Rename</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={remove}>Delete</ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

/** Cursor-style: Repositories as folders with nested chats. */
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

    const openRepo = (path: string, active: boolean) => {
        if (!active) {
            window.dispatchEvent(new CustomEvent("shape-open-project", { detail: { path } }));
        }
    };

    const removeRepo = (path: string) => {
        removeFromRepoHistory(path);
        window.dispatchEvent(new Event("shape-repo-history-changed"));
    };

    const revealRepo = (path: string) => {
        window.dispatchEvent(new CustomEvent("shape-reveal-in-explorer", { detail: { path } }));
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between pl-3 pr-1 pb-1 pt-3">
                <span className="text-sm font-medium text-text-muted">Repositories</span>
                <div className="flex items-center">
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Add repository"
                        onClick={() => window.dispatchEvent(new Event("open-folder-request"))}
                    >
                        <Icon name="add" size={16} />
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
                            <ContextMenu>
                                <ContextMenuTrigger asChild>
                                    <div
                                        className={cn(
                                            "group/repo flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                                            active
                                                ? "bg-panel-active text-text-primary"
                                                : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                                        )}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setExpanded((p) => ({ ...p, [entry.path]: !open }));
                                                openRepo(entry.path, active);
                                            }}
                                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
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
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    type="button"
                                                    aria-label="Repository options"
                                                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-text-muted opacity-0 hover:bg-panel-active hover:text-text-primary group-hover/repo:opacity-100 data-[state=open]:opacity-100"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Icon name="more_horiz" size={14} />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="min-w-44">
                                                <DropdownMenuItem
                                                    onClick={() => openRepo(entry.path, active)}
                                                >
                                                    Open
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => {
                                                        openRepo(entry.path, active);
                                                        window.dispatchEvent(
                                                            new CustomEvent("shape-chat-new"),
                                                        );
                                                    }}
                                                >
                                                    New chat
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => revealRepo(entry.path)}
                                                >
                                                    Reveal in explorer
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onClick={() => removeRepo(entry.path)}
                                                >
                                                    Remove from list
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </ContextMenuTrigger>
                                <ContextMenuContent className="min-w-44">
                                    <ContextMenuItem onClick={() => openRepo(entry.path, active)}>
                                        Open
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        onClick={() => {
                                            openRepo(entry.path, active);
                                            window.dispatchEvent(new CustomEvent("shape-chat-new"));
                                        }}
                                    >
                                        New chat
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => revealRepo(entry.path)}>
                                        Reveal in explorer
                                    </ContextMenuItem>
                                    <ContextMenuSeparator />
                                    <ContextMenuItem onClick={() => removeRepo(entry.path)}>
                                        Remove from list
                                    </ContextMenuItem>
                                </ContextMenuContent>
                            </ContextMenu>

                            <div
                                className={cn(
                                    "grid transition-[grid-template-rows] duration-200 ease-out",
                                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                                )}
                            >
                                <div className="min-h-0 overflow-hidden">
                                    <div className="ml-4 space-y-0.5 py-0.5">
                                        {chats.length === 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    openRepo(entry.path, active);
                                                    window.dispatchEvent(
                                                        new CustomEvent("shape-chat-new"),
                                                    );
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
                                                    <ChatRow
                                                        key={c.id}
                                                        id={c.id}
                                                        title={c.title?.trim() || "Untitled"}
                                                        models={models}
                                                        ago={shortAgo(c.timestamp)}
                                                        activeRepo={active}
                                                        repoPath={entry.path}
                                                    />
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {recents.length === 0 ? (
                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new Event("open-folder-request"))}
                        className="mx-1 mt-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-text-muted hover:bg-panel-hover hover:text-text-secondary"
                    >
                        <Icon name="folder" size={15} />
                        Open a repository
                    </button>
                ) : null}
            </div>
        </div>
    );
}
