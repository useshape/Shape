"use client";

import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
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
import { Pin20Filled } from "@fluentui/react-icons/headless/svg/pin";
import { Pin20Regular } from "@fluentui/react-icons/headless/svg/pin";
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
    setChatPinned,
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
    applySubagentEvent,
    getSubagents,
    openSubagent,
    subscribeSubagents,
    type SubagentCard,
} from "@/features/agent/subagents/store";
import { listen } from "@tauri-apps/api/event";
import { ScrollArea } from "@/components/ui/scroll";
import { isTalkWorkspace, useWorkspaceMode } from "@/lib/ui/workspace-mode";
import { conversationStorePath, TALK_CONVERSATION_STORE } from "@/lib/chat/conversation-store";
import {
    armNextChat,
    assignLane,
    chatLane,
    chatMark,
    getLaneSnapshot,
    getLaneSnapshotServer,
    rememberLaneChat,
    subscribeChatLanes,
    type WorkerShape,
} from "@/lib/sidebar/chat-lanes";
import { WorkerMark } from "./worker-mark";
type ChatSort = "recent" | "oldest" | "name-asc" | "name-desc";
type ChatFilter = "all" | "pinned" | "unread";

const SORT_KEY = "shape-sidebar-chat-sort";
const FILTER_OPTIONS: { value: ChatFilter; label: string }[] = [
    { value: "all", label: "All sessions" },
    { value: "pinned", label: "Pinned" },
    { value: "unread", label: "Unread" },
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

function readablePreview(raw: string): string {
    return raw
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/<([a-z][\w:-]*)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<\/?[a-z][\w:-]*\b[^>]*\/?>/gi, " ")
        .replace(/[#>*_`[\]]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function previewLine(chat: Conversation): string {
    const history = chat.history || [];
    for (let i = history.length - 1; i >= 0; i--) {
        const text = readablePreview(history[i]?.content || "");
        if (text) return text;
    }
    return "No messages yet";
}

function nestedDot(status: string, column?: string): string {
    if (status === "error") return "bg-error";
    if (status === "cancelled") return "bg-text-muted";
    if (status === "done" || column === "done") return "bg-success";
    if (column === "review") return "bg-warning";
    return "bg-accent";
}

function ChatRow({
    id,
    title,
    path,
    active,
    pinned,
    unread,
    color,
    subagents,
    edge = "none",
    selecting = false,
    selected = false,
    onToggleSelect,
    mark = null,
    preview = "",
    onNew,
}: {
    id: string;
    title: string;
    path: string;
    active: boolean;
    pinned: boolean;
    unread: boolean;
    color: ChatColor | null;
    subagents: SubagentCard[];
    /** Where this row sits inside a collection stack. */
    edge?: "none" | "only" | "first" | "mid" | "last";
    selecting?: boolean;
    selected?: boolean;
    onToggleSelect?: () => void;
    mark?: { shape: WorkerShape; color: string } | null;
    preview?: string;
    onNew?: () => void;
}) {
    const workspaceMode = useWorkspaceMode();
    const generating = useIsChatGenerating(id);
    const [renaming, setRenaming] = useState(false);
    const [draft, setDraft] = useState(title);
    const [expanded, setExpanded] = useState(false);
    const nestedCount = subagents.length;
    const workerCount = useRef(0);
    if (workerCount.current !== nestedCount) {
        const appeared = workerCount.current === 0 && nestedCount > 0;
        workerCount.current = nestedCount;
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
        { key: "pin", label: pinned ? "Unpin" : "Pin", icon: Pin20Regular, run: () => setChatPinned(id, !pinned) },
        { key: "rename", label: "Rename", icon: Edit20Regular, run: startRename },
        { key: "new", label: "New Chat", icon: Add20Regular, run: () => (onNew ? onNew() : window.dispatchEvent(new CustomEvent("shape-chat-new"))) },
        ...(mark
            ? [{
                key: "loop",
                label: "Loop into current chat",
                icon: Compose20Regular,
                run: () => {
                    const stored = chatMark(id);
                    window.dispatchEvent(
                        new CustomEvent("shape-loop-worker", {
                            detail: { name: title, job: stored?.taught || stored?.job },
                        }),
                    );
                },
            }]
            : []),
        { key: "copy", label: "Copy Title", icon: Copy20Regular, sep: true, run: () => void navigator.clipboard.writeText(title) },
        ...(!isTalkWorkspace(workspaceMode) && path
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

    const fade = "1.25rem";

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
                            "group/chat relative flex w-full gap-1 text-sm",
                            mark ? "items-center squircle-2xl px-2 py-1.5" : "h-10 items-center px-",
                            !mark && !color && "squircle-2xl",
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
                                    className={cn(
                                        "flex min-w-0 flex-1 text-left",
                                        mark ? "items-center gap-2.5" : "items-center gap-2",
                                    )}
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
                                    {mark ? <WorkerMark shape={mark.shape} color={mark.color} size={36} /> : null}
                                    {mark ? (
                                        <span className="min-w-0 flex-1">
                                            <span
                                                className="block overflow-hidden whitespace-nowrap text-sm text-text-primary"
                                                style={{
                                                    maskImage: `linear-gradient(to right, #000 0, #000 calc(100% - ${fade}), transparent)`,
                                                }}
                                            >
                                                {title}
                                            </span>
                                            <span
                                                className="mt-0.5 block overflow-hidden whitespace-nowrap text-xs text-text-muted"
                                                style={{
                                                    maskImage: `linear-gradient(to right, #000 0, #000 calc(100% - ${fade}), transparent)`,
                                                }}
                                            >
                                                {preview}
                                            </span>
                                        </span>
                                    ) : (
                                    <span
                                        className="block min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm font-normal text-text-primary"
                                        style={{
                                            maskImage: `linear-gradient(to right, #000 0, #000 calc(100% - ${fade}), transparent)`,
                                        }}
                                    >
                                        {title}
                                    </span>
                                    )}
                                </button>
                                <span className="flex shrink-0 items-center gap-1">
                                    {generating ? (
                                        <Eclipse size={12} className="text-text-muted" aria-hidden />
                                    ) : null}
                                    {unread ? (
                                        <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                                    ) : null}
                                </span>
                                <span className="flex shrink-0 items-center">
                                    <span className="grid grid-cols-[0fr] px-2 overflow-hidden transition-[grid-template-columns] duration-100 ease-[var(--ease-out)] group-hover/chat:grid-cols-[1fr] group-has-[[data-state=open]]/chat:grid-cols-[1fr]">
                                    <span className="flex min-w-0 gap-1 overflow-hidden">
                                    {pinned ? null : (
                                    <Tooltip content="Pin" side="bottom">
                                        <button
                                            type="button"
                                            aria-label="Pin"
                                            onClick={() => setChatPinned(id, true)}
                                            className="flex size-6 items-center justify-center rounded-md text-text-muted hover:bg-panel-active hover:text-text-primary"
                                        >
                                            <Icon icon={Pin20Regular} className="icon-lg" />
                                        </button>
                                    </Tooltip>
                                    )}
                                    <DropdownMenu modal={false}>
                                        <Tooltip content="Chat actions" side="bottom">
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                aria-label="Chat actions"
                                                className="flex size-6 items-center justify-center rounded-md text-text-muted hover:bg-panel-active hover:text-text-primary"
                                            >
                                                <Icon icon={MoreHorizontal20Regular} className="icon-lg" />
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
                                    </span>
                                    {pinned ? (
                                        <Tooltip content="Unpin" side="bottom">
                                            <button
                                                type="button"
                                                aria-label="Unpin"
                                                onClick={() => setChatPinned(id, false)}
                                                className="flex size-6 pr-3 items-center justify-center rounded-md text-text-primary"
                                            >
                                                <Icon icon={Pin20Filled} className="icon-lg" />
                                            </button>
                                        </Tooltip>
                                    ) : null}
                                </span>
                                {nestedCount > 0 ? (
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
            {expanded && nestedCount > 0 ? (
                <div className="flex flex-col">
                    {subagents.map((card) => (
                        <button
                            key={`s-${card.id}`}
                            type="button"
                            onClick={() => {
                                clearChatUnread(id);
                                window.dispatchEvent(new CustomEvent("shape-chat-load", { detail: { id } }));
                                openSubagent(card.id);
                            }}
                            className={cn(
                                "flex h-8 items-center gap-2 pr-2 pl-7 text-left text-sm text-text-secondary",
                                color
                                    ? "hover:bg-[color-mix(in_oklch,var(--chat-tint)_16%,transparent)] hover:text-text-primary"
                                    : "hover:bg-panel-hover hover:text-text-primary",
                            )}
                        >
                            <span className={cn("size-1.5 shrink-0 rounded-full", nestedDot(card.status))} aria-hidden />
                            <span className="block min-w-0 flex-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,#000_0,#000_calc(100%-1.5rem),transparent)]">
                                {card.title}
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
    subagents,
    edge = "none",
    selecting,
    selected,
    onToggleSelect,
    mark = null,
    preview = "",
    onNew,
}: {
    chat: Conversation;
    projectPath: string;
    activeId: string | null;
    pinned: boolean;
    unread: boolean;
    color: ChatColor | null;
    subagents: SubagentCard[];
    edge?: "none" | "only" | "first" | "mid" | "last";
    selecting: boolean;
    selected: boolean;
    onToggleSelect: () => void;
    mark?: { shape: WorkerShape; color: string } | null;
    preview?: string;
    onNew?: () => void;
}) {
    return (
        <ChatRow
            id={chat.id}
            title={chat.title?.trim() || "Untitled"}
            path={chat.project_path || projectPath}
            active={chat.id === activeId}
            pinned={pinned}
            unread={unread}
            color={color}
            subagents={subagents}
            edge={edge}
            selecting={selecting}
            selected={selected}
            onToggleSelect={onToggleSelect}
            mark={mark}
            preview={preview}
            onNew={onNew}
        />
    );
}

export function ChatList({
    onNewChat,
}: {
    onNewChat: () => void;
    /** @deprecated unified Sessions list — ignored */
    listKind?: "chat";
}) {
    const { project_path } = useProjectState();
    const mode = useWorkspaceMode();
    const laneSnap = useSyncExternalStore(subscribeChatLanes, getLaneSnapshot, getLaneSnapshotServer);
    const [workerQuery, setWorkerQuery] = useState("");
    const [chats, setChats] = useState<Conversation[]>([]);
    const [chatsReady, setChatsReady] = useState(false);
    const [sort, setSort] = useState<ChatSort>("recent");
    const [filter, setFilter] = useState<ChatFilter>("all");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
    const allSubagents = useSyncExternalStore(subscribeSubagents, getSubagents, getSubagents);

    useEffect(() => {
        setSort(loadSort());
    }, []);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        void listen("agent-subagent", (event) => {
            applySubagentEvent((event.payload ?? {}) as Parameters<typeof applySubagentEvent>[0]);
        }).then((fn) => {
            unlisten = fn;
        });
        return () => unlisten?.();
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
        try {
            let merged: Conversation[] = [];
            const store = conversationStorePath(mode, project_path);
            if (isTalkWorkspace(mode)) {
                merged = await commands.getConversations(TALK_CONVERSATION_STORE);
            } else if (store) {
                merged = await commands.getConversations(store);
            }
            setChats(merged);
            return merged;
        } catch {
            setChats([]);
            return [];
        } finally {
            setChatsReady(true);
        }
    }, [project_path, mode]);

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
            if (next) {
                clearChatUnread(next);
                rememberLaneChat(chatLane(next), next);
            }
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
                if (!cancelled && id && chatLane(id) === mode) setActiveId(id);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [project_path, mode]);

    const visible = useMemo(() => {
        const live = chats.filter((c) => {
            if (c.archived) return false;
            const lane = chatMark(c.id);
            const assigned = lane?.mode ?? (isTalkWorkspace(mode) ? "Chat" : "Code");
            return assigned === mode;
        });
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
    }, [chats, sort, pinnedIds, mode, laneSnap]);

    const filtered = useMemo(() => {
        let next = visible;
        if (filter === "pinned") next = next.filter((c) => pinnedIds.has(c.id));
        if (filter === "unread") next = next.filter((c) => unreadIds.has(c.id));
        const q = workerQuery.trim().toLowerCase();
        if (q) {
            next = next.filter((c) => (c.title || "").toLowerCase().includes(q));
        }
        return next;
    }, [visible, filter, pinnedIds, unreadIds, workerQuery, mode]);

    const selected = new Set(selectedIds);
    const toggleSelect = (id: string) => {
        setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    };

    const startLaneChat = () => {
        armNextChat({ mode });
        onNewChat();
    };

    const activeIdRef = useRef(activeId);
    activeIdRef.current = activeId;
    const previousMode = useRef(mode);
    const seenMode = useRef(false);
    useEffect(() => {
        let cancelled = false;
        const from = previousMode.current;
        const modeChanged = seenMode.current && from !== mode;
        seenMode.current = true;
        previousMode.current = mode;
        const open = activeIdRef.current;
        if (modeChanged && open) {
            if (!chatMark(open)) assignLane(open, from);
            rememberLaneChat(from, open);
        }

        void (async () => {
            await loadChats();
        })();

        return () => {
            cancelled = true;
        };
    }, [mode, project_path, loadChats]);

    const rowProps = (chat: Conversation) => {
        const mark = null;
        return {
            chat,
            projectPath: project_path || "",
            activeId,
            pinned: pinnedIds.has(chat.id),
            unread: unreadIds.has(chat.id),
            color: null as ChatColor | null,
            edge: "none" as const,
            subagents: allSubagents.filter((card) => card.parentId === chat.id),
            selecting: selectedIds.length > 0,
            selected: selected.has(chat.id),
            onToggleSelect: () => toggleSelect(chat.id),
            mark,
            preview: "",
            onNew: startLaneChat,
        };
    };

    const pending = laneSnap.draft?.title && laneSnap.draft.mode === mode ? laneSnap.draft : null;

    const openCommandPalette = () => {
        window.dispatchEvent(
            new CustomEvent("shape-command-palette", {
                detail: { placeholder: "Search…" },
            }),
        );
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="h-2 shrink-0" />

            <ScrollArea fadeFrom="from-sidebar" className="min-h-0 flex-1 px-1.5 pb-2">
                {mode === "Code" && !project_path ? (
                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new Event("shape-open-project-pick"))}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-text-muted hover:bg-panel-hover hover:text-text-secondary"
                    >
                        <Icon icon={FolderOpen20Regular} />
                        Open a folder
                    </button>
                ) : (
                    <div className="space-y-0.5">
                        {pending ? (
                            <div className="flex items-start gap-2.5 squircle-2xl bg-panel-hover px-2 py-2">
                                <WorkerMark
                                    shape={pending.shape || "circle"}
                                    color={pending.color || "#3b82f6"}
                                    size={32}
                                />
                                <span className="min-w-0 flex-1">
                                    <span
                                        className="block overflow-hidden whitespace-nowrap text-sm text-text-primary"
                                        style={{
                                            maskImage: "linear-gradient(to right, #000 0, #000 calc(100% - 1.25rem), transparent)",
                                        }}
                                    >
                                        {pending.title || "New chat"}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-text-muted">No messages yet</span>
                                </span>
                            </div>
                        ) : null}
                        {filtered.map((c) => (
                            <SessionRow key={c.id} {...rowProps(c)} />
                        ))}
                        <button
                            type="button"
                            onClick={startLaneChat}
                            className="mt-1 flex h-10 w-full items-center justify-start gap-1 squircle-2xl px-1 text-left text-sm text-text-muted hover:bg-panel-hover hover:text-text-secondary"
                        >
                            <Icon icon={Compose20Regular} className="icon-lg shrink-0" />
                            <span>New chat</span>
                        </button>
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
