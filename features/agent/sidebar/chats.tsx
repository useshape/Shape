"use client";

import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
import { Bookmark20Regular } from "@fluentui/react-icons/headless/svg/bookmark";
import { Checkmark } from "@/components/ui/checkmark";
import { ChevronRight20Regular } from "@fluentui/react-icons/headless/svg/chevron-right";
import { Compose20Regular } from "@fluentui/react-icons/headless/svg/compose";
import { Copy20Regular } from "@fluentui/react-icons/headless/svg/copy";
import { Delete20Filled } from "@fluentui/react-icons/headless/svg/delete";
import { Edit20Regular } from "@fluentui/react-icons/headless/svg/edit";
import { Filter20Regular } from "@fluentui/react-icons/headless/svg/filter";
import { FolderOpen20Regular } from "@fluentui/react-icons/headless/svg/folder-open";
import { MailInbox20Regular } from "@fluentui/react-icons/headless/svg/mail-inbox";
import { MoreHorizontal20Regular } from "@fluentui/react-icons/headless/svg/more-horizontal";
import { Open20Regular } from "@fluentui/react-icons/headless/svg/open";
import { PeopleChat24Filled } from "@fluentui/react-icons";
import { Pin20Regular } from "@fluentui/react-icons/headless/svg/pin";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { Eclipse } from "loading-dev";

import {
    Fragment,
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
import { Icon, type IconGlyph } from "@/components/ui/icon";
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
    CHAT_COLOR_HEX,
    deleteCollection,
    getCollections,
    getCollectionsServer,
    setChatPinned,
    subscribeCollections,
    type ChatColor,
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
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
    getAllWorkers,
    openWorker,
    subscribeMultiwork,
    type MultiworkWorker,
} from "@/features/multiwork";
import { ScrollArea } from "@/components/ui/scroll";
import { COLLECTION_GLYPH, CollectionDialog } from "./collection-dialog";

type ChatSort = "recent" | "oldest" | "name-asc" | "name-desc";
type ChatFilter = "all" | "pinned" | "unread" | "multiwork" | "collection";

const SORT_KEY = "shape-sidebar-chat-sort";
const FILTER_OPTIONS: { value: ChatFilter; label: string }[] = [
    { value: "all", label: "All sessions" },
    { value: "pinned", label: "Pinned" },
    { value: "unread", label: "Unread" },
    { value: "multiwork", label: "Multiwork" },
];

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

function workerDot(worker: MultiworkWorker): string {
    if (worker.status === "error") return "bg-error";
    if (worker.status === "done" || worker.column === "done") return "bg-success";
    if (worker.column === "review") return "bg-warning";
    return "bg-accent";
}

function ChatRow({
    id,
    title,
    path,
    active,
    pinned,
    unread,
    multiwork,
    color,
    workers,
    edge = "none",
    selecting = false,
    selected = false,
    onToggleSelect,
    onCollect,
}: {
    id: string;
    title: string;
    path: string;
    active: boolean;
    pinned: boolean;
    unread: boolean;
    multiwork: boolean;
    color: ChatColor | null;
    workers: MultiworkWorker[];
    /** Where this row sits inside a collection stack. */
    edge?: "none" | "only" | "first" | "mid" | "last";
    selecting?: boolean;
    selected?: boolean;
    onToggleSelect?: () => void;
    onCollect?: () => void;
}) {
    const generating = useIsChatGenerating(id);
    const [renaming, setRenaming] = useState(false);
    const [draft, setDraft] = useState(title);
    const [expanded, setExpanded] = useState(false);
    const workerCount = useRef(0);
    if (workerCount.current !== workers.length) {
        const appeared = workerCount.current === 0 && workers.length > 0;
        workerCount.current = workers.length;
        if (appeared) setExpanded(true);
    }
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

    const actions: { key: string; label: string; icon: IconGlyph; run: () => void; danger?: boolean; sep?: boolean }[] = [
        { key: "open", label: "Open", icon: Open20Regular, run: openChat },
        { key: "collect", label: "Add to collection", icon: Bookmark20Regular, run: () => onCollect?.() },
        { key: "pin", label: pinned ? "Unpin" : "Pin", icon: Pin20Regular, run: () => setChatPinned(id, !pinned) },
        { key: "rename", label: "Rename", icon: Edit20Regular, run: startRename },
        { key: "new", label: "New Chat", icon: Add20Regular, run: () => window.dispatchEvent(new CustomEvent("shape-chat-new")) },
        { key: "copy", label: "Copy Title", icon: Copy20Regular, sep: true, run: () => void navigator.clipboard.writeText(title) },
        ...(path
            ? [{ key: "reveal", label: "Reveal Folder", icon: FolderOpen20Regular, run: () => void commands.revealPath(path).catch(() => {}) }]
            : []),
        { key: "archive", label: "Archive", icon: MailInbox20Regular, sep: true, run: archive },
        { key: "delete", label: "Delete", icon: Delete20Filled, danger: true, run: remove },
    ];

    const menuItems = (
        Item: (props: { onClick?: () => void; className?: string; children?: ReactNode }) => ReactNode,
        Separator: () => ReactNode,
    ) =>
        actions.map((action) => (
            <Fragment key={action.key}>
                {action.sep ? Separator() : null}
                <Item onClick={action.run} className={action.danger ? "text-error" : undefined}>
                    <Icon icon={action.icon} />
                    {action.label}
                </Item>
            </Fragment>
        ));

    const fade = multiwork && workers.length > 0 ? "9rem" : "7.25rem";

    return (
        <div
            className={cn(
                "flex flex-col overflow-hidden",
                color && "bg-[color-mix(in_oklch,var(--chat-tint)_22%,transparent)] text-text-primary",
                color && active && "bg-[color-mix(in_oklch,var(--chat-tint)_30%,transparent)]",
            )}
            style={color ? { ["--chat-tint" as string]: CHAT_COLOR_HEX[color] } : undefined}
        >
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        className={cn(
                            "group/chat relative flex h-10 w-full items-center gap-1 px-2 text-sm",
                            !color && "squircle-2xl",
                            "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                            !color && (active ? "bg-panel-hover text-text-primary" : "text-text-primary hover:bg-panel-hover"),
                            color && "text-text-primary hover:bg-[color-mix(in_oklch,var(--chat-tint)_12%,transparent)]",
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
                            <>
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        if (event.ctrlKey || event.metaKey) {
                                            onToggleSelect?.();
                                            return;
                                        }
                                        openChat();
                                    }}
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                >
                                    <span
                                        className={cn(
                                            "grid shrink-0 transition-[grid-template-columns,opacity,margin] duration-200 ease-[var(--ease-out)]",
                                            selecting ? "mr-1 grid-cols-[14px] opacity-100" : "grid-cols-[0px] opacity-0",
                                        )}
                                    >
                                        <span className="overflow-hidden">
                                            <Checkmark
                                                checked={selected}
                                                onCheckedChange={() => onToggleSelect?.()}
                                            />
                                        </span>
                                    </span>
                                    <span
                                        className="block min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm font-normal text-text-primary [--title-fade:1.25rem] group-hover/chat:[--title-fade:var(--title-fade-hover)] group-has-[[data-state=open]]/chat:[--title-fade:var(--title-fade-hover)]"
                                        style={{
                                            ["--title-fade-hover" as string]: fade,
                                            maskImage: "linear-gradient(to right, #000 0, #000 calc(100% - var(--title-fade)), transparent)",
                                        }}
                                    >
                                        {title}
                                    </span>
                                </button>
                                <span className="flex shrink-0 items-center group-hover/chat:invisible has-[[data-state=open]]:invisible">
                                    {generating ? (
                                        <Eclipse size={12} className="text-text-muted" aria-hidden />
                                    ) : multiwork ? (
                                        <Icon
                                            icon={PeopleChat24Filled}
                                            className="text-text-muted"
                                            style={{ ["--icon-size" as string]: "16px" }}
                                        />
                                    ) : unread ? (
                                        <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                                    ) : null}
                                </span>
                                <span className={cn(
                                    "pointer-events-none absolute z-10 flex items-center opacity-0 group-hover/chat:pointer-events-auto group-hover/chat:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100",
                                    multiwork && workers.length > 0 ? "right-7" : "right-1",
                                )}>
                                    <Tooltip content="Add to collection" side="bottom">
                                        <button
                                            type="button"
                                            aria-label="Add to collection"
                                            onClick={() => onCollect?.()}
                                            className="flex size-6 items-center justify-center rounded-md text-text-muted hover:bg-panel-active hover:text-text-primary"
                                        >
                                            <Icon icon={Bookmark20Regular} className="icon-sm" />
                                        </button>
                                    </Tooltip>
                                    <Tooltip content={pinned ? "Unpin" : "Pin"} side="bottom">
                                        <button
                                            type="button"
                                            aria-label={pinned ? "Unpin" : "Pin"}
                                        onClick={() => setChatPinned(id, !pinned)}
                                        className={cn(
                                            "flex size-6 items-center justify-center rounded-md text-text-muted hover:bg-panel-active hover:text-text-primary",
                                            pinned && "text-text-primary",
                                        )}
                                    >
                                        <Icon icon={Pin20Regular} className="icon-sm" />
                                    </button>
                                    </Tooltip>
                                    <DropdownMenu modal={false}>
                                        <Tooltip content="Chat actions" side="bottom">
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                aria-label="Chat actions"
                                                className="flex size-6 items-center justify-center rounded-md text-text-muted hover:bg-panel-active hover:text-text-primary"
                                            >
                                                <Icon icon={MoreHorizontal20Regular} className="icon-sm" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        </Tooltip>
                                        <DropdownMenuContent side="bottom" align="end" sideOffset={6} className="min-w-48">
                                            {menuItems(
                                                (props) => <DropdownMenuItem {...props} />,
                                                () => <DropdownMenuSeparator />,
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </span>
                                {multiwork && workers.length > 0 ? (
                                    <button
                                        type="button"
                                        aria-label={expanded ? "Hide agents" : "Show agents"}
                                        aria-expanded={expanded}
                                        onClick={() => setExpanded((open) => !open)}
                                        className="flex size-5 shrink-0 items-center justify-center text-text-muted"
                                    >
                                        <Icon
                                            icon={ChevronRight20Regular}
                                            className={cn(
                                                "icon-sm transition-transform duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                                                expanded && "rotate-90",
                                            )}
                                        />
                                    </button>
                                ) : null}
                            </>
                        )}
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="min-w-48">
                    {menuItems(
                        (props) => <ContextMenuItem {...props} />,
                        () => <ContextMenuSeparator />,
                    )}
                </ContextMenuContent>
            </ContextMenu>
            {multiwork && expanded && workers.length > 0 ? (
                <div className="flex flex-col">
                    {workers.map((worker) => (
                        <button
                            key={worker.id}
                            type="button"
                            onClick={() => {
                                clearChatUnread(id);
                                window.dispatchEvent(new CustomEvent("shape-chat-load", { detail: { id } }));
                                openWorker(worker.id);
                            }}
                            className={cn(
                                "flex h-8 items-center gap-2 pr-2 pl-7 text-left text-sm text-text-secondary",
                                color
                                    ? "hover:bg-[color-mix(in_oklch,var(--chat-tint)_16%,transparent)] hover:text-text-primary"
                                    : "hover:bg-panel-hover hover:text-text-primary",
                            )}
                        >
                            <span className={cn("size-1.5 shrink-0 rounded-full", workerDot(worker))} aria-hidden />
                            <span className="block min-w-0 flex-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,#000_0,#000_calc(100%-1.5rem),transparent)]">
                                {worker.title}
                            </span>
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function SessionRow({
    chat,
    projectPath,
    activeId,
    pinned,
    unread,
    color,
    workers,
    edge = "none",
    selecting,
    selected,
    onToggleSelect,
    onCollect,
}: {
    chat: Conversation;
    projectPath: string;
    activeId: string | null;
    pinned: boolean;
    unread: boolean;
    color: ChatColor | null;
    workers: MultiworkWorker[];
    edge?: "none" | "only" | "first" | "mid" | "last";
    selecting: boolean;
    selected: boolean;
    onToggleSelect: () => void;
    onCollect: () => void;
}) {
    return (
        <ChatRow
            id={chat.id}
            title={chat.title?.trim() || "Untitled"}
            path={chat.project_path || projectPath}
            active={chat.id === activeId}
            pinned={pinned}
            unread={unread}
            multiwork={chat.kind === "multiwork"}
            color={color}
            workers={workers}
            edge={edge}
            selecting={selecting}
            selected={selected}
            onToggleSelect={onToggleSelect}
            onCollect={onCollect}
        />
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
    const [filter, setFilter] = useState<ChatFilter>("all");
    const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [collect, setCollect] = useState<{ ids: string[]; editId?: string } | null>(null);
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
    const collections = useSyncExternalStore(subscribeCollections, getCollections, getCollectionsServer);
    const allWorkers = useSyncExternalStore(subscribeMultiwork, getAllWorkers, getAllWorkers);

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

    const filtered = useMemo(() => {
        if (filter === "pinned") return visible.filter((c) => pinnedIds.has(c.id));
        if (filter === "unread") return visible.filter((c) => unreadIds.has(c.id));
        if (filter === "multiwork") return visible.filter((c) => c.kind === "multiwork");
        if (filter === "collection" && collectionFilter) {
            const ids = new Set(collections.find((c) => c.id === collectionFilter)?.chatIds ?? []);
            return visible.filter((c) => ids.has(c.id));
        }
        return visible;
    }, [visible, filter, collectionFilter, pinnedIds, unreadIds, collections]);

    const collected = new Set(collections.flatMap((collection) => collection.chatIds));
    const byId = new Map(filtered.map((chat) => [chat.id, chat]));
    const collectionGroups = collections
        .map((collection) => ({
            collection,
            chats: collection.chatIds
                .map((id) => byId.get(id))
                .filter((chat): chat is Conversation => Boolean(chat)),
        }))
        .filter((group) => group.chats.length > 0);
    const plainPinned = filtered.filter((c) => pinnedIds.has(c.id) && !collected.has(c.id));
    const plainChats = filtered.filter((c) => !pinnedIds.has(c.id) && !collected.has(c.id));

    const selected = new Set(selectedIds);
    const toggleSelect = (id: string) => {
        setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    };
    const openCollect = (id: string) => {
        setCollect({ ids: selectedIds.includes(id) ? [...selectedIds] : [id] });
    };

    const rowProps = (chat: Conversation, color: ChatColor | null, edge: "none" | "only" | "first" | "mid" | "last") => ({
        chat,
        projectPath: project_path || "",
        activeId,
        pinned: pinnedIds.has(chat.id),
        unread: unreadIds.has(chat.id),
        color,
        edge,
        workers: allWorkers.filter((worker) => worker.parentId === chat.id),
        selecting: selectedIds.length > 0,
        selected: selected.has(chat.id),
        onToggleSelect: () => toggleSelect(chat.id),
        onCollect: () => openCollect(chat.id),
    });

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
                        <Tooltip content="Filter" side="bottom" delayDuration={80}>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    aria-label="Filter"
                                    className="flex size-7 items-center justify-center rounded-md text-text-muted transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary data-[state=open]:bg-panel-hover data-[state=open]:text-text-primary"
                                >
                                    <Icon icon={Filter20Regular} />
                                </button>
                            </DropdownMenuTrigger>
                        </Tooltip>
                        <DropdownMenuContent align="end" className="min-w-40">
                            <DropdownMenuLabel>Show</DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                                value={filter === "collection" && collectionFilter ? `collection:${collectionFilter}` : filter}
                                onValueChange={(value) => {
                                    if (value.startsWith("collection:")) {
                                        setFilter("collection");
                                        setCollectionFilter(value.slice("collection:".length));
                                        return;
                                    }
                                    setFilter(value as ChatFilter);
                                    setCollectionFilter(null);
                                }}
                            >
                                {FILTER_OPTIONS.map((opt) => (
                                    <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                            {collections.length > 0 ? (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>Collections</DropdownMenuLabel>
                                    <DropdownMenuRadioGroup
                                        value={filter === "collection" && collectionFilter ? `collection:${collectionFilter}` : filter}
                                        onValueChange={(value) => {
                                            if (!value.startsWith("collection:")) return;
                                            setFilter("collection");
                                            setCollectionFilter(value.slice("collection:".length));
                                        }}
                                    >
                                        {collections.map((collection) => (
                                            <DropdownMenuRadioItem key={collection.id} value={`collection:${collection.id}`}>
                                                <Icon
                                                    icon={COLLECTION_GLYPH[collection.icon]}
                                                    className="icon-sm"
                                                    style={{ color: CHAT_COLOR_HEX[collection.color] }}
                                                />
                                                {collection.name}
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                </>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>Sort</DropdownMenuLabel>
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
                ) : filtered.length === 0 ? (
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
                        {plainPinned.map((c) => (
                            <SessionRow key={c.id} {...rowProps(c, null, "none")} />
                        ))}
                        {collectionGroups.map((group) => {
                            const hex = CHAT_COLOR_HEX[group.collection.color];
                            return (
                                <div key={group.collection.id} className="squircle-[20px] flex flex-col overflow-hidden">
                                    <div
                                        className="group/col relative flex h-8 items-center gap-1.5 bg-[color-mix(in_oklch,var(--chat-tint)_22%,transparent)] px-2 text-text-primary"
                                        style={{ ["--chat-tint" as string]: hex }}
                                    >
                                        <Icon
                                            icon={COLLECTION_GLYPH[group.collection.icon]}
                                            className="icon-sm shrink-0"
                                            style={{ color: hex }}
                                        />
                                        <span
                                            className="block min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm [--title-fade:0.75rem] group-hover/col:[--title-fade:3.5rem]"
                                            style={{ maskImage: "linear-gradient(to right, #000 0, #000 calc(100% - var(--title-fade)), transparent)" }}
                                        >
                                            {group.collection.name}
                                        </span>
                                        <span className="pointer-events-none absolute right-1 z-10 flex items-center opacity-0 group-hover/col:pointer-events-auto group-hover/col:opacity-100">
                                            <Tooltip content="Edit collection" side="bottom">
                                            <button
                                                type="button"
                                                aria-label="Edit collection"
                                                onClick={() =>
                                                    setCollect({
                                                        ids: group.collection.chatIds,
                                                        editId: group.collection.id,
                                                    })
                                                }
                                                className="flex size-6 items-center justify-center rounded-md text-text-muted hover:bg-panel-active hover:text-text-primary"
                                            >
                                                <Icon icon={Edit20Regular} className="icon-sm" />
                                            </button>
                                            </Tooltip>
                                            <Tooltip content="Ungroup" side="bottom">
                                            <button
                                                type="button"
                                                aria-label="Ungroup collection"
                                                onClick={() => {
                                                    deleteCollection(group.collection.id);
                                                    if (collectionFilter === group.collection.id) {
                                                        setFilter("all");
                                                        setCollectionFilter(null);
                                                    }
                                                }}
                                                className="flex size-6 items-center justify-center rounded-md text-text-muted hover:bg-panel-active hover:text-text-primary"
                                            >
                                                <Icon icon={Delete20Filled} className="icon-sm" />
                                            </button>
                                            </Tooltip>
                                        </span>
                                    </div>
                                    {group.chats.map((c, index) => (
                                        <SessionRow
                                            key={c.id}
                                            {...rowProps(
                                                c,
                                                group.collection.color,
                                                index === group.chats.length - 1 ? "last" : "mid",
                                            )}
                                        />
                                    ))}
                                </div>
                            );
                        })}
                        {plainChats.map((c) => (
                            <SessionRow key={c.id} {...rowProps(c, null, "none")} />
                        ))}
                    </div>
                )}
            </ScrollArea>
            {collect ? (
                <CollectionDialog
                    chatIds={collect.ids}
                    existing={collections.find((collection) => collection.id === collect.editId) ?? null}
                    onClose={() => {
                        setCollect(null);
                        setSelectedIds([]);
                    }}
                />
            ) : null}
        </div>
    );
}
