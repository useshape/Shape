"use client";

import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";
import { tabLog } from "@/lib/ui/tab-switch-log";
import { commands, useProjectState } from "@/lib/backend";
import type { Conversation } from "@/lib/backend/types";
import { useGitHubAuth } from "@/lib/github/store";
import { useShapeAuth } from "@/lib/cloud/store";
import { conversationStorePath, TALK_CONVERSATION_STORE } from "@/lib/chat/conversation-store";
import { isTalkWorkspace, useWorkspaceMode } from "@/lib/ui/workspace-mode";
import { NEW_CHAT_TAB_ID } from "@/features/chat/ui/shell/tabs";
import { WindowControlsSpacer } from "@/features/agent/workbench/titlebar/ui/window-controls";
import { BrowserTabStrip } from "./browser-tab-strip";
import { chromePlatform, subscribeChromePlatform } from "@/lib/ui/chrome-platform";
import { publishChatTitles } from "./chat-titles";
import { AccountMenu, ProfileAvatar } from "./sidebar/menu";
import { cn } from "@/lib/utils";
import {
    activateChat,
    closeChatTab,
    closeTool,
    getStrip,
    isToolId,
    reorderChat,
    setOpenTabs,
    showView,
    splitWith,
    subscribeStrip,
    toolTitle,
    unsplit,
} from "./strip";

const MAX_TABS = 8;

function chatHasMessages(chat: Conversation | undefined): boolean {
    return Boolean(chat?.history?.some((message) => (message.content || "").trim().length > 0));
}

function latestModelId(chat: Conversation | undefined): string | null {
    const history = chat?.history;
    if (!history) return null;
    for (let index = history.length - 1; index >= 0; index--) {
        const model = history[index]?.model?.trim();
        if (model) return model;
    }
    return null;
}

function ChromeAvatar() {
    const shapeAuth = useShapeAuth();
    const github = useGitHubAuth();
    const name =
        (shapeAuth.name && !/^n\/?a$/i.test(shapeAuth.name.trim()) ? shapeAuth.name.trim() : null)
        ?? (github.loggedIn && github.username ? github.username : null)
        ?? "Account";

    return (
        <AccountMenu side="bottom">
            <button
                type="button"
                aria-label={name}
                data-no-drag
                className="flex h-8 items-center gap-0.5 rounded-full py-0.5 pl-2 hover:bg-panel-hover"
            >
                <span className="grid size-[23px] place-items-center overflow-hidden rounded-full bg-surface-4">
                    <ProfileAvatar
                        gitAvatarUrl={github.loggedIn ? github.avatarUrl : null}
                        shapeUserId={shapeAuth.userId}
                        offline={Boolean(shapeAuth.offline)}
                        name={name}
                        size={22}
                    />
                </span>
                <Icon icon={ChevronDown20Regular} className="text-text-muted icon-md" />
            </button>
        </AccountMenu>
    );
}

export function ChatChromeTabs() {
    const { project_path } = useProjectState();
    const mode = useWorkspaceMode();
    const [chats, setChats] = useState<Conversation[]>([]);
    const [order, setOrder] = useState<string[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const strip = useSyncExternalStore(subscribeStrip, getStrip, getStrip);
    const platform = useSyncExternalStore(subscribeChromePlatform, chromePlatform, () => "windows" as const);

    const loadChats = useCallback(async () => {
        try {
            const store = conversationStorePath(mode, project_path);
            const merged = isTalkWorkspace(mode)
                ? await commands.getConversations(TALK_CONVERSATION_STORE)
                : store
                  ? await commands.getConversations(store)
                  : [];
            setChats(merged.filter((chat) => !chat.archived));
            publishChatTitles(merged);
        } catch {
            setChats([]);
        }
    }, [mode, project_path]);

    useEffect(() => {
        void loadChats();
        const refresh = () => void loadChats();
        window.addEventListener("shape-chat-refresh", refresh);
        window.addEventListener("shape-chats-changed", refresh);
        return () => {
            window.removeEventListener("shape-chat-refresh", refresh);
            window.removeEventListener("shape-chats-changed", refresh);
        };
    }, [loadChats]);

    useEffect(() => {
        const onActive = (event: Event) => {
            const id = (event as CustomEvent<{ id?: string }>).detail?.id;
            setActiveId(id && id !== NEW_CHAT_TAB_ID ? id : null);
            if (!id || id === NEW_CHAT_TAB_ID) return;
            const current = getStrip();
            if (!current.order.includes(NEW_CHAT_TAB_ID)) {
                activateChat(id);
                return;
            }
            const seen = new Set<string>();
            const next = current.order.flatMap((item) => {
                const resolved = item === NEW_CHAT_TAB_ID ? id : item;
                if (seen.has(resolved)) return [];
                seen.add(resolved);
                return [resolved];
            });
            setOpenTabs(next, id);
        };
        window.addEventListener("shape-chat-active", onActive as EventListener);
        return () => window.removeEventListener("shape-chat-active", onActive as EventListener);
    }, []);

    useEffect(() => {
        let cancelled = false;
        void commands
            .getCurrentConversationId()
            .then((id) => {
                if (!cancelled && id && id !== NEW_CHAT_TAB_ID) setActiveId(id);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [project_path, mode]);

    useEffect(() => {
        setOrder((prev) => {
            const ids = new Set(chats.map((chat) => chat.id));
            const kept = prev.filter((id) => ids.has(id));
            const known = new Set(kept);
            const added = chats.filter((chat) => !known.has(chat.id)).map((chat) => chat.id);
            if (kept.length === 0) {
                return [...chats]
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                    .map((chat) => chat.id);
            }
            return [...kept, ...added];
        });
    }, [chats]);

    useEffect(() => {
        const current = getStrip();
        const known = new Set(order);
        // A brand-new conversation is not in the loaded list yet. Keep that tab
        // instead of falling back to whichever chat happens to be first.
        const pending = current.activeId
            && !isToolId(current.activeId)
            && current.activeId !== NEW_CHAT_TAB_ID
            && !known.has(current.activeId)
            ? current.activeId
            : null;
        const kept = current.order.filter((id) => isToolId(id) || known.has(id) || id === NEW_CHAT_TAB_ID || id === pending);
        const missing = order.filter((id) => !isToolId(id) && !kept.includes(id));
        const chatsInStrip = current.order.some((id) => !isToolId(id));
        if (chatsInStrip && missing.length === 0 && kept.length === current.order.length && !pending) return;
        const chatIds = kept.filter((id) => !isToolId(id));
        if (pending && !chatIds.includes(pending)) chatIds.unshift(pending);
        const next = [...chatIds, ...missing, ...kept.filter((id) => isToolId(id))];
        if (next.length === 0) return;
        const active = current.activeId === NEW_CHAT_TAB_ID || pending
            ? (pending ?? NEW_CHAT_TAB_ID)
            : current.activeId && next.includes(current.activeId)
              ? current.activeId
              : activeId && next.includes(activeId)
                ? activeId
                : next[0];
        setOpenTabs(next, active ?? null);
    }, [order, activeId]);

    const byId = useMemo(() => {
        const map = new Map<string, Conversation>();
        for (const chat of chats) map.set(chat.id, chat);
        return map;
    }, [chats]);

    const tabs = useMemo(() => {
        const source = strip.order.length
            ? strip.order
            : order;
        const items = source.flatMap((id) => {
            if (isToolId(id)) {
                return [{ id, title: toolTitle(id), active: strip.activeId === id, tool: true, empty: false, modelId: null }];
            }
            const chat = byId.get(id);
            const pending = !chat && id !== NEW_CHAT_TAB_ID && strip.activeId === id;
            if (!chat && id !== NEW_CHAT_TAB_ID && !pending) return [];
            const empty = id === NEW_CHAT_TAB_ID || pending || !chatHasMessages(chat);
            return [{
                id,
                title: chat?.title?.trim() || "New chat",
                active: !isToolId(strip.activeId || "") && (strip.activeId === id || (!strip.activeId && id === activeId)),
                tool: false,
                empty,
                modelId: empty ? null : latestModelId(chat),
            }];
        });
        if (items.some((tab) => tab.active)) return items;
        return [{ id: NEW_CHAT_TAB_ID, title: "New chat", active: !strip.activeId || !isToolId(strip.activeId), tool: false, empty: true, modelId: null }, ...items];
    }, [order, byId, activeId, strip]);

    const shown = useMemo(() => {
        const tools = tabs.filter((tab) => isToolId(tab.id));
        const chats = tabs.filter((tab) => !isToolId(tab.id));
        const head = chats.slice(0, MAX_TABS);
        const active = chats.find((tab) => tab.active);
        const chatHead = active && !head.some((tab) => tab.id === active.id)
            ? [...head.slice(0, MAX_TABS - 1), active]
            : head;
        return [...chatHead, ...tools];
    }, [tabs]);

    const openChat = (id: string) => {
        tabLog(`click ${id === NEW_CHAT_TAB_ID ? "new" : id.slice(0, 8)}`);
        if (isToolId(id)) {
            showView(id);
            return;
        }
        if (id === NEW_CHAT_TAB_ID) {
            activateChat(NEW_CHAT_TAB_ID);
            setActiveId(null);
            window.dispatchEvent(new Event("shape-chat-new"));
            window.dispatchEvent(new Event("shape-chat-focus-input"));
            return;
        }
        showView("chat");
        setActiveId(id);
        activateChat(id);
        window.dispatchEvent(new CustomEvent("shape-chat-load", { detail: { id } }));
    };

    const newChat = () => {
        activateChat(NEW_CHAT_TAB_ID);
        setActiveId(null);
        window.dispatchEvent(new Event("shape-chat-new"));
        window.dispatchEvent(new Event("shape-chat-focus-input"));
    };

    const closeOthers = (id: string) => {
        if (isToolId(id)) {
            for (const tool of strip.order) {
                if (isToolId(tool) && tool !== id) closeTool(tool);
            }
            return;
        }
        const drop = order.filter((item) => item !== id);
        setOrder(order.filter((item) => item === id));
        for (const item of drop) {
            void commands.setConversationArchived(item, true).catch(() => {});
        }
        window.dispatchEvent(new CustomEvent("shape-chat-refresh"));
        if (activeId !== id) openChat(id);
    };

    const closeToRight = (id: string) => {
        if (isToolId(id)) {
            const index = strip.order.indexOf(id);
            for (const tool of strip.order.slice(index + 1)) {
                if (isToolId(tool)) closeTool(tool);
            }
            return;
        }
        const index = order.indexOf(id);
        if (index < 0) return;
        const drop = order.slice(index + 1);
        setOrder(order.slice(0, index + 1));
        for (const item of drop) {
            void commands.setConversationArchived(item, true).catch(() => {});
        }
        window.dispatchEvent(new CustomEvent("shape-chat-refresh"));
        if (activeId && drop.includes(activeId)) openChat(id);
    };

    const closeChat = (id: string) => {
        if (isToolId(id)) {
            closeTool(id);
            return;
        }
        if (id === NEW_CHAT_TAB_ID) return;
        const rest = order.filter((item) => item !== id);
        setOrder(rest);
        closeChatTab(id);
        void commands
            .setConversationArchived(id, true)
            .then(() => window.dispatchEvent(new CustomEvent("shape-chat-refresh")))
            .catch(() => {});
        if (id !== activeId) return;
        const next = rest[0];
        if (next) openChat(next);
        else newChat();
    };

    const moveTab = (from: number, to: number) => {
        setOrder((prev) => {
            const chatsOnly = prev.filter((id) => !isToolId(id));
            if (from < 0 || to < 0 || from >= chatsOnly.length || to >= chatsOnly.length) return prev;
            const nextChats = [...chatsOnly];
            const [moved] = nextChats.splice(from, 1);
            nextChats.splice(to, 0, moved);
            return nextChats;
        });
        reorderChat(from, to);
    };

    const mac = platform === "macos";

    return (
        <div
            className={cn(
                "shape-window-titlebar relative z-30 flex h-11 w-full shrink-0 items-center bg-transparent",
                mac ? "pl-[78px] pr-2" : "pl-2",
            )}
            data-tauri-drag-region
        >
            <div className="flex shrink-0 items-center" data-no-drag>
                <ChromeAvatar />
            </div>
            <BrowserTabStrip
                tabs={shown.map((tab) => ({
                    id: tab.id,
                    title: tab.title,
                    active: tab.active,
                    tool: tab.tool,
                    empty: tab.empty,
                    modelId: tab.modelId,
                }))}
                splitIds={strip.split ? [strip.split.left, strip.split.right] : null}
                onActivate={openChat}
                onClose={closeChat}
                onReorder={moveTab}
                onSplitPair={(anchor, incoming) => splitWith(anchor, incoming)}
                onUnsplit={unsplit}
                onNew={newChat}
                onCloseOthers={closeOthers}
                onCloseRight={closeToRight}
            />
            {mac ? null : <WindowControlsSpacer />}
        </div>
    );
}
