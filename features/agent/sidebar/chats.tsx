"use client";

import { RiAddLine, RiFolderLine, RiSearchLine, RiSortDesc } from "@remixicon/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { commands, useProjectState } from "@/lib/backend";
import type { Conversation } from "@/lib/backend/types";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { formatCompactAgo, getRepoName } from "@/lib/repo-history";
import { ProjectKindGlyph } from "@/features/detection/ui/kind-glyph";
import { Tooltip } from "@/components/ui/tooltip";
import { SearchInput } from "@/components/ui/search";
import { useIsChatGenerating } from "@/features/chat/lib/generating-chats";
import { NEW_CHAT_TAB_ID } from "@/features/chat/ui/shell/tabs";
import { useGitBranch } from "@/features/workbench/hooks/use-git-branch";
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
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { ScrollArea } from "@/components/ui/scroll";

type ChatSort = "recent" | "oldest" | "name-asc" | "name-desc";

const SORT_KEY = "shape-sidebar-chat-sort";
const SORT_OPTIONS: { value: ChatSort; label: string }[] = [
    { value: "recent", label: "Recent" },
    { value: "oldest", label: "Oldest" },
    { value: "name-asc", label: "Name A–Z" },
    { value: "name-desc", label: "Name Z–A" },
];

function loadSort(): ChatSort {
    try {
        const value = window.localStorage.getItem(SORT_KEY);
        if (value === "recent" || value === "oldest" || value === "name-asc" || value === "name-desc") {
            return value;
        }
    } catch {
        /* ignore */
    }
    return "recent";
}

function extractPrNumber(conversation: Conversation): string | null {
    const titleHit = (conversation.title || "").match(/#(\d{2,7})\b/);
    if (titleHit?.[1]) return titleHit[1];
    for (const message of conversation.history || []) {
        const text = typeof message.content === "string" ? message.content : "";
        const hit = text.match(/#(\d{2,7})\b/);
        if (hit?.[1]) return hit[1];
    }
    return null;
}

function HeaderIconBtn({
    label,
    onClick,
    active,
    children,
}: {
    label: string;
    onClick?: () => void;
    active?: boolean;
    children: ReactNode;
}) {
    return (
        <Tooltip content={label} side="bottom" delayDuration={80}>
            <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={onClick}
                className={cn(
                    "flex size-7 items-center justify-center rounded-md text-text-muted",
                    "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                    "hover:bg-panel-hover hover:text-text-primary",
                    active && "bg-panel-hover text-text-primary",
                )}
            >
                {children}
            </button>
        </Tooltip>
    );
}

function ChatRow({
    id,
    title,
    repo,
    path,
    branch,
    pr,
    ago,
    active,
}: {
    id: string;
    title: string;
    repo: string;
    path: string;
    branch: string | null;
    pr: string | null;
    ago: string;
    active: boolean;
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
                        "group/chat w-full p-2 squircle-xl text-sm",
                        "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                        active
                            ? "bg-panel-hover text-text-primary"
                            : "text-text-primary hover:bg-panel-hover",
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
                            className="w-full rounded bg-transparent px-0 text-sm text-text-primary outline-none ring-1 ring-border"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={openChat}
                            className="flex w-full flex-col gap-0.5 text-left"
                        >
                            <span className="flex items-center justify-between gap-2 text-xs text-text-muted">
                                <span className="flex min-w-0 items-center gap-1.5">
                                    <ProjectKindGlyph path={path} className="size-3.5 shrink-0" />
                                    <span className="min-w-0 truncate">{repo}</span>
                                </span>
                                <span className="shrink-0 tabular-nums">{generating ? "now" : ago}</span>
                            </span>
                            <span className="block truncate text-sm text-text-primary">{title}</span>
                            <span className="flex min-w-0 items-center gap-2 text-xs text-text-muted">
                                {generating ? (
                                    <span>Working...</span>
                                ) : (
                                    <>
                                        {branch ? (
                                            <span className="min-w-0 truncate">{branch}</span>
                                        ) : (
                                            <span />
                                        )}
                                        {pr ? (
                                            <span className="ml-auto shrink-0 tabular-nums text-text-muted">
                                                #{pr}
                                            </span>
                                        ) : null}
                                    </>
                                )}
                            </span>
                        </button>
                    )}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-44">
                <ContextMenuItem onClick={openChat}>Open</ContextMenuItem>
                <ContextMenuItem onClick={startRename}>Rename</ContextMenuItem>
                <ContextMenuItem
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent("shape-chat-new"));
                    }}
                >
                    New Chat
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    onClick={() => {
                        void navigator.clipboard.writeText(title);
                    }}
                >
                    Copy Title
                </ContextMenuItem>
                {path ? (
                    <ContextMenuItem
                        onClick={() => {
                            void commands.revealPath(path).catch(() => {});
                        }}
                    >
                        Reveal Folder
                    </ContextMenuItem>
                ) : null}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={remove}>Delete</ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

export function ChatList({ onNewChat }: { onNewChat: () => void }) {
    const { project_path } = useProjectState();
    const branch = useGitBranch(project_path);
    const [chats, setChats] = useState<Conversation[]>([]);
    const [query, setQuery] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [sort, setSort] = useState<ChatSort>("recent");
    const [activeId, setActiveId] = useState<string | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setSort(loadSort());
    }, []);

    const persistSort = useCallback((next: ChatSort) => {
        setSort(next);
        try {
            window.localStorage.setItem(SORT_KEY, next);
        } catch {
            /* ignore */
        }
    }, []);

    const loadChats = useCallback(async () => {
        if (!project_path) {
            setChats([]);
            return;
        }
        try {
            setChats(await commands.getConversations(project_path));
        } catch {
            setChats([]);
        }
    }, [project_path]);

    useEffect(() => {
        void loadChats();
        const onRefresh = () => void loadChats();
        window.addEventListener("shape-chat-refresh", onRefresh);
        window.addEventListener("shape-chats-changed", onRefresh);
        window.addEventListener("shape-chat-active", onRefresh);
        return () => {
            window.removeEventListener("shape-chat-refresh", onRefresh);
            window.removeEventListener("shape-chats-changed", onRefresh);
            window.removeEventListener("shape-chat-active", onRefresh);
        };
    }, [loadChats]);

    useEffect(() => {
        const onActive = (e: Event) => {
            const id = (e as CustomEvent<{ id?: string }>).detail?.id;
            setActiveId(id && id !== NEW_CHAT_TAB_ID ? id : null);
        };
        window.addEventListener("shape-chat-active", onActive as EventListener);
        return () => window.removeEventListener("shape-chat-active", onActive as EventListener);
    }, []);

    useEffect(() => {
        let cancelled = false;
        void commands
            .getCurrentConversationId()
            .then((id) => {
                if (!cancelled && id) setActiveId(id);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [project_path]);

    useEffect(() => {
        if (!searchOpen) return;
        searchRef.current?.focus();
    }, [searchOpen]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filtered = q
            ? chats.filter((c) => (c.title || "Untitled").toLowerCase().includes(q))
            : chats;
        const sorted = [...filtered];
        sorted.sort((a, b) => {
            if (sort === "name-asc") {
                return (a.title || "").localeCompare(b.title || "", undefined, {
                    sensitivity: "base",
                });
            }
            if (sort === "name-desc") {
                return (b.title || "").localeCompare(a.title || "", undefined, {
                    sensitivity: "base",
                });
            }
            const delta = (a.timestamp || 0) - (b.timestamp || 0);
            return sort === "oldest" ? delta : -delta;
        });
        return sorted;
    }, [chats, query, sort]);

    const toggleSearch = () => {
        setSearchOpen((open) => {
            if (open) setQuery("");
            return !open;
        });
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between pl-3 pr-1 pb-1 pt-3">
                <span className="text-sm font-medium text-text-muted">Chats</span>
                <div className="flex items-center">
                    <HeaderIconBtn label="Search" onClick={toggleSearch} active={searchOpen}>
                        <Icon icon={RiSearchLine} />
                    </HeaderIconBtn>
                    <DropdownMenu>
                        <Tooltip content="Sort" side="bottom" delayDuration={80}>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    aria-label="Sort"
                                    className="flex size-7 items-center justify-center rounded-md text-text-muted transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary data-[state=open]:bg-panel-hover data-[state=open]:text-text-primary"
                                >
                                    <Icon icon={RiSortDesc} />
                                </button>
                            </DropdownMenuTrigger>
                        </Tooltip>
                        <DropdownMenuContent align="end" className="min-w-36">
                            <DropdownMenuRadioGroup
                                value={sort}
                                onValueChange={(value) => persistSort(value as ChatSort)}
                            >
                                {SORT_OPTIONS.map((opt) => (
                                    <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <HeaderIconBtn label="New chat" onClick={onNewChat}>
                        <Icon icon={RiAddLine} />
                    </HeaderIconBtn>
                </div>
            </div>

            <div
                className={cn(
                    "grid transition-[grid-template-rows] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                    searchOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
            >
                <div className="min-h-0 overflow-hidden">
                    <div
                        className={cn(
                            "origin-top px-2 mt-1 pb-2",
                            "transition-[opacity,transform,filter] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                            searchOpen
                                ? "translate-y-0 opacity-100 blur-0"
                                : "pointer-events-none -translate-y-1.5 opacity-0 blur-[2px]",
                        )}
                    >
                        <SearchInput
                            ref={searchRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search chats"
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    e.preventDefault();
                                    setSearchOpen(false);
                                    setQuery("");
                                }
                            }}
                        />
                    </div>
                </div>
            </div>

            <ScrollArea fadeFrom="from-sidebar" className="min-h-0 flex-1 px-1.5 pb-2">
                {!project_path ? (
                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new Event("shape-new-project"))}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-text-muted hover:bg-panel-hover hover:text-text-secondary"
                    >
                        <Icon icon={RiFolderLine} />
                        New project
                    </button>
                ) : visible.length === 0 ? (
                    <button
                        type="button"
                        onClick={onNewChat}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-text-muted hover:bg-panel-hover hover:text-text-secondary"
                    >
                        <Icon icon={RiAddLine} className="shrink-0" />
                        <span>{query.trim() ? "No matching chats" : "New chat"}</span>
                    </button>
                ) : (
                    <div className="space-y-0.5">
                        {visible.map((c) => (
                            <ChatRow
                                key={c.id}
                                id={c.id}
                                title={c.title?.trim() || "Untitled"}
                                repo={getRepoName(c.project_path || project_path || "")}
                                path={c.project_path || project_path || ""}
                                branch={branch}
                                pr={extractPrNumber(c)}
                                ago={formatCompactAgo(c.timestamp)}
                                active={c.id === activeId}
                            />
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
