"use client";

import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
import { ArrowSortDown20Regular } from "@fluentui/react-icons/headless/svg/arrow-sort-down";
import { Compose20Regular } from "@fluentui/react-icons/headless/svg/compose";
import { Copy20Regular } from "@fluentui/react-icons/headless/svg/copy";
import { Delete20Filled } from "@fluentui/react-icons/headless/svg/delete";
import { Edit20Regular } from "@fluentui/react-icons/headless/svg/edit";
import { FolderOpen20Regular } from "@fluentui/react-icons/headless/svg/folder-open";
import { MailInbox20Regular } from "@fluentui/react-icons/headless/svg/mail-inbox";
import { Open20Regular } from "@fluentui/react-icons/headless/svg/open";
import { People20Regular } from "@fluentui/react-icons/headless/svg/people";
import { Pin20Regular } from "@fluentui/react-icons/headless/svg/pin";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { Eclipse } from "loading-dev";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import { commands, useProjectState } from "@/lib/backend";
import type { Conversation } from "@/lib/backend/types";
import { Icon } from "@/components/ui/icon";

import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { useIsChatGenerating } from "@/features/chat/lib/generating-chats";
import { NEW_CHAT_TAB_ID } from "@/features/chat/ui/shell/tabs";
import {
    clearChatUnread,
    getPinnedChatIds,
    getPinnedChatIdsServer,
    getUnreadChatIds,
    getUnreadChatIdsServer,
    markChatUnread,
    setChatPinned,
    subscribePinnedChats,
    subscribeUnreadChats,
} from "@/lib/sidebar/chat-list-meta";
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
    path,
    active,
    pinned,
    unread,
    multiwork,
}: {
    id: string;
    title: string;
    path: string;
    active: boolean;
    pinned: boolean;
    unread: boolean;
    multiwork: boolean;
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
        clearChatUnread(id);
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

    const archive = () => {
        void commands
            .setConversationArchived(id, true)
            .then(() => window.dispatchEvent(new CustomEvent("shape-chat-refresh")))
            .catch(() => {});
        window.dispatchEvent(new CustomEvent("shape-chat-close-tab", { detail: { id } }));
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
                        "group/chat flex h-8 w-full items-center rounded-md px-2 text-sm",
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
                            className="flex w-full items-center gap-2 text-left"
                        >
                            <span className="min-w-0 flex-1 truncate text-sm font-normal text-text-primary">
                                {title}
                            </span>
                            <span className="relative flex shrink-0 items-center">
                                {multiwork ? (
                                    <Icon
                                        icon={People20Regular}
                                        className="text-text-muted"
                                        style={{ ["--icon-size" as string]: "14px" }}
                                    />
                                ) : null}
                                {generating ? (
                                    <Eclipse
                                        size={12}
                                        className={cn(
                                            "text-text-muted",
                                            multiwork && "absolute -right-1 -top-1",
                                        )}
                                        aria-hidden
                                    />
                                ) : !multiwork && unread ? (
                                    <span
                                        className="size-2 shrink-0 rounded-full bg-accent"
                                        aria-label="Unread"
                                    />
                                ) : null}
                            </span>
                        </button>
                    )}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-48">
                <ContextMenuItem onClick={openChat}>
                    <Icon icon={Open20Regular} />
                    Open
                </ContextMenuItem>
                <ContextMenuItem onClick={() => setChatPinned(id, !pinned)}>
                    <Icon icon={Pin20Regular} />
                    {pinned ? "Unpin" : "Pin"}
                </ContextMenuItem>
                <ContextMenuItem onClick={startRename}>
                    <Icon icon={Edit20Regular} />
                    Rename
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent("shape-chat-new"));
                    }}
                >
                    <Icon icon={Add20Regular} />
                    New Chat
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    onClick={() => {
                        void navigator.clipboard.writeText(title);
                    }}
                >
                    <Icon icon={Copy20Regular} />
                    Copy Title
                </ContextMenuItem>
                {path ? (
                    <ContextMenuItem
                        onClick={() => {
                            void commands.revealPath(path).catch(() => {});
                        }}
                    >
                        <Icon icon={FolderOpen20Regular} />
                        Reveal Folder
                    </ContextMenuItem>
                ) : null}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={archive}>
                    <Icon icon={MailInbox20Regular} />
                    Archive
                </ContextMenuItem>
                <ContextMenuItem onClick={remove} className="text-error">
                    <Icon icon={Delete20Filled} />
                    Delete
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

export function ChatList({
    onNewChat,
}: {
    onNewChat: () => void;
    /** @deprecated unified Sessions list — ignored */
    listKind?: "chat" | "multiwork";
}) {
    const { project_path } = useProjectState();
    const [chats, setChats] = useState<Conversation[]>([]);
    const [sort, setSort] = useState<ChatSort>("recent");
    const [activeId, setActiveId] = useState<string | null>(null);

    const pinnedIds = useSyncExternalStore(
        subscribePinnedChats,
        getPinnedChatIds,
        getPinnedChatIdsServer,
    );
    const unreadIds = useSyncExternalStore(
        subscribeUnreadChats,
        getUnreadChatIds,
        getUnreadChatIdsServer,
    );

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
            const next = id && id !== NEW_CHAT_TAB_ID ? id : null;
            setActiveId(next);
            if (next) clearChatUnread(next);
        };
        window.addEventListener("shape-chat-active", onActive as EventListener);
        return () => window.removeEventListener("shape-chat-active", onActive as EventListener);
    }, []);

    useEffect(() => {
        const onGenerating = (e: Event) => {
            const detail = (e as CustomEvent<{ id?: string; generating?: boolean }>).detail;
            const id = detail?.id;
            if (!id || detail?.generating) return;
            if (id !== activeId) markChatUnread(id);
        };
        window.addEventListener("shape-chat-generating", onGenerating as EventListener);
        return () => window.removeEventListener("shape-chat-generating", onGenerating as EventListener);
    }, [activeId]);

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

    const visible = useMemo(() => {
        const live = chats.filter((c) => !c.archived);
        const sorted = [...live];
        sorted.sort((a, b) => {
            const aPin = pinnedIds.has(a.id);
            const bPin = pinnedIds.has(b.id);
            if (aPin !== bPin) return aPin ? -1 : 1;
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
    }, [chats, sort, pinnedIds]);

    const openCommandPalette = () => {
        window.dispatchEvent(
            new CustomEvent("shape-command-palette", {
                detail: { placeholder: "Search…" },
            }),
        );
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between pl-3 pr-1 pb-1 pt-3">
                <span className="text-sm font-medium text-text-muted">Sessions</span>
                <div className="flex items-center">
                    <HeaderIconBtn label="Search" onClick={openCommandPalette}>
                        <Icon icon={Search20Regular} />
                    </HeaderIconBtn>
                    <DropdownMenu>
                        <Tooltip content="Sort" side="bottom" delayDuration={80}>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    aria-label="Sort"
                                    className="flex size-7 items-center justify-center rounded-md text-text-muted transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary data-[state=open]:bg-panel-hover data-[state=open]:text-text-primary"
                                >
                                    <Icon icon={ArrowSortDown20Regular} />
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
                        <Icon icon={Compose20Regular} />
                    </HeaderIconBtn>
                </div>
            </div>

            <ScrollArea fadeFrom="from-sidebar" className="min-h-0 flex-1 px-1.5 pb-2">
                {!project_path ? (
                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new Event("shape-new-project"))}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-text-muted hover:bg-panel-hover hover:text-text-secondary"
                    >
                        <Icon icon={FolderOpen20Regular} />
                        New project
                    </button>
                ) : visible.length === 0 ? (
                    <button
                        type="button"
                        onClick={onNewChat}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-text-muted hover:bg-panel-hover hover:text-text-secondary"
                    >
                        <Icon icon={Compose20Regular} className="shrink-0" />
                        <span>New chat</span>
                    </button>
                ) : (
                    <div className="space-y-0.5">
                        {visible.map((c) => (
                            <ChatRow
                                key={c.id}
                                id={c.id}
                                title={c.title?.trim() || "Untitled"}
                                path={c.project_path || project_path || ""}
                                active={c.id === activeId}
                                pinned={pinnedIds.has(c.id)}
                                unread={unreadIds.has(c.id)}
                                multiwork={c.kind === "multiwork"}
                            />
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
