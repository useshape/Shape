"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { commands, useProjectState } from "@/lib/backend";
import { useGeneratingChatIds } from "@/features/chat/lib/generating-chats";
import type { Conversation } from "@/lib/backend/types";
import { conversationStorePath, TALK_CONVERSATION_STORE } from "@/lib/chat/conversation-store";
import { isTalkWorkspace, useWorkspaceMode } from "@/lib/ui/workspace-mode";
import { NEW_CHAT_TAB_ID } from "@/features/chat/ui/shell/tabs";
import { getSubagents, subscribeSubagents } from "@/features/agent/subagents/store";
import { WindowControlsSpacer } from "@/features/agent/workbench/titlebar/ui/window-controls";
import { ChatOmnibox } from "@/features/chat/ui/shell/omnibox";
import { chromePlatform, subscribeChromePlatform } from "@/lib/ui/chrome-platform";
import { publishChatTitles } from "./chat-titles";
import { ChatTabTree } from "./sidebar/tab-tree";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { AGENT_TAB_SIDEBAR_SLOT } from "./chrome";
import {
    activateChat,
    closeChatTab,
    closeTool,
    fileTabPath,
    getStrip,
    isFileTab,
    isShowcaseTab,
    isToolId,
    reorderChat,
    setOpenTabs,
    showView,
    SHOWCASE_TAB_ID,
    subscribeStrip,
    toolTitle,
} from "./strip";

const MAX_TABS = 24;

export function ChatChromeTabs({
    filesOpen = false,
    onToggleFiles,
}: {
    filesOpen?: boolean;
    onToggleFiles?: () => void;
}) {
    const { project_path } = useProjectState();
    const mode = useWorkspaceMode();
    const [chats, setChats] = useState<Conversation[]>([]);
    const [order, setOrder] = useState<string[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const strip = useSyncExternalStore(subscribeStrip, getStrip, getStrip);
    const generating = useGeneratingChatIds();
    const threadCards = useSyncExternalStore(subscribeSubagents, getSubagents, getSubagents);
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
            if (isFileTab(current.activeId || "") || isToolId(current.activeId || "") || isShowcaseTab(current.activeId || "")) {
                if (!current.order.includes(NEW_CHAT_TAB_ID)) return;
                const seen = new Set<string>();
                const next = current.order.flatMap((item) => {
                    const resolved = item === NEW_CHAT_TAB_ID ? id : item;
                    if (seen.has(resolved)) return [];
                    seen.add(resolved);
                    return [resolved];
                });
                setOpenTabs(next, current.activeId);
                return;
            }
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
            const added = chats.filter((chat) => !known.has(chat.id));
            if (kept.length === 0) {
                const sorted = [...chats].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                const parents = sorted.filter((chat) => chat.kind !== "thread" && !chat.parent_id);
                const threads = sorted.filter((chat) => chat.kind === "thread" || Boolean(chat.parent_id));
                const ids: string[] = parents.map((chat) => chat.id);
                for (const thread of threads) {
                    const parent = thread.parent_id;
                    const at = parent ? ids.indexOf(parent) : -1;
                    if (at >= 0) ids.splice(at + 1, 0, thread.id);
                    else ids.push(thread.id);
                }
                return ids;
            }
            const next = [...kept];
            for (const chat of added) {
                if (next.includes(chat.id)) continue;
                const parent = chat.parent_id;
                const at = parent ? next.indexOf(parent) : -1;
                if (at >= 0) next.splice(at + 1, 0, chat.id);
                else next.push(chat.id);
            }
            return next;
        });
    }, [chats]);

    useEffect(() => {
        const current = getStrip();
        const known = new Set(order);
        // A brand-new conversation is not in the loaded list yet. Keep that tab
        // instead of falling back to whichever chat happens to be first.
        const pending = current.activeId
            && !isToolId(current.activeId)
            && !isFileTab(current.activeId)
            && current.activeId !== NEW_CHAT_TAB_ID
            && !known.has(current.activeId)
            ? current.activeId
            : null;
        const kept = current.order.filter((id) => isToolId(id) || isFileTab(id) || isShowcaseTab(id) || known.has(id) || id === NEW_CHAT_TAB_ID || id === pending);
        const missing = order.filter((id) => !isToolId(id) && !isFileTab(id) && !isShowcaseTab(id) && !kept.includes(id));
        const chatsInStrip = current.order.some((id) => !isToolId(id) && !isFileTab(id) && !isShowcaseTab(id));
        if (chatsInStrip && missing.length === 0 && kept.length === current.order.length && !pending) return;
        const next = [...kept];
        for (const id of missing) {
            if (!next.includes(id)) next.push(id);
        }
        if (pending) {
            const at = next.indexOf(NEW_CHAT_TAB_ID);
            if (at >= 0) next.splice(at, 1, pending);
            else if (!next.includes(pending)) next.unshift(pending);
        }
        if (!next.includes(SHOWCASE_TAB_ID)) next.unshift(SHOWCASE_TAB_ID);
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
            if (isShowcaseTab(id)) {
                return [{ id, title: "Components", active: strip.activeId === id, tool: true, file: false, parentId: undefined as string | undefined }];
            }
            if (isFileTab(id)) {
                const path = id.slice("file:".length);
                const name = path.split(/[/\\]/).pop() || path;
                return [{ id, title: name, active: strip.activeId === id, tool: false, file: true, parentId: undefined as string | undefined }];
            }
            if (isToolId(id)) {
                return [{ id, title: toolTitle(id), active: strip.activeId === id, tool: true, file: false, parentId: undefined as string | undefined }];
            }
            const chat = byId.get(id);
            const pending = !chat && id !== NEW_CHAT_TAB_ID && strip.activeId === id;
            if (!chat && id !== NEW_CHAT_TAB_ID && !pending) return [];
            return [{
                id,
                title: chat?.title?.trim() || "New chat",
                parentId: chat?.parent_id || threadCards.find((card) => card.id === id)?.parentId,
                active: !isToolId(strip.activeId || "") && !isFileTab(strip.activeId || "") && !isShowcaseTab(strip.activeId || "") && (strip.activeId === id || (!strip.activeId && id === activeId)),
                tool: false,
                file: false,
            }];
        });
        if (items.some((tab) => tab.active)) return items;
        return [{ id: NEW_CHAT_TAB_ID, title: "New chat", active: !strip.activeId || (!isToolId(strip.activeId) && !isFileTab(strip.activeId) && !isShowcaseTab(strip.activeId)), tool: false, file: false, parentId: undefined as string | undefined }, ...items];
    }, [order, byId, activeId, strip, threadCards]);

    const shown = useMemo(() => {
        const chats = tabs.filter((tab) => !tab.tool && !tab.file && !isShowcaseTab(tab.id));
        const keep = new Set(chats.slice(0, MAX_TABS).map((tab) => tab.id));
        const active = chats.find((tab) => tab.active);
        if (active) keep.add(active.id);
        for (const tab of chats) {
            if (generating.has(tab.id) || tab.id.startsWith("thread-") || tab.id.startsWith("sub-run-")) {
                keep.add(tab.id);
            }
        }
        if (keep.size > MAX_TABS) {
            const drop = chats.find((tab) =>
                keep.has(tab.id)
                && tab.id !== active?.id
                && !generating.has(tab.id)
                && !tab.id.startsWith("thread-")
                && !tab.id.startsWith("sub-run-"),
            );
            if (drop) keep.delete(drop.id);
        }
        return tabs.filter((tab) => tab.tool || tab.file || isShowcaseTab(tab.id) || keep.has(tab.id));
    }, [tabs, generating]);

    const openChat = (id: string) => {
        if (isShowcaseTab(id)) {
            showView(id);
            return;
        }
        if (isFileTab(id)) {
            activateChat(id);
            const path = fileTabPath(id);
            const name = path.split(/[/\\]/).pop() || path;
            void commands.openFile(path, name).catch(() => {});
            return;
        }
        if (isToolId(id)) {
            showView(id);
            return;
        }
        if (id === NEW_CHAT_TAB_ID) {
            activateChat(NEW_CHAT_TAB_ID);
            setActiveId(null);
            window.dispatchEvent(new CustomEvent("shape-dock-open", { detail: { id: NEW_CHAT_TAB_ID, title: "New chat", focus: true } }));
            window.dispatchEvent(new Event("shape-chat-new"));
            window.dispatchEvent(new Event("shape-chat-focus-input"));
            return;
        }
        showView("chat");
        setActiveId(id);
        activateChat(id);
        window.dispatchEvent(new CustomEvent("shape-dock-open", { detail: { id, title: byId.get(id)?.title, focus: true } }));
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
        if (isShowcaseTab(id)) return;
        if (isToolId(id) || isFileTab(id)) {
            if (isToolId(id)) closeTool(id);
            else closeChatTab(id);
            return;
        }
        if (id === NEW_CHAT_TAB_ID) return;
        const rest = order.filter((item) => item !== id);
        setOrder(rest);
        closeChatTab(id);
        void commands.stopChatMessage(id).catch(() => {});
        const isThread = id.startsWith("thread-") || id.startsWith("sub-run-");
        if (!isThread) {
            void commands
                .setConversationArchived(id, true)
                .then(() => window.dispatchEvent(new CustomEvent("shape-chat-refresh")))
                .catch(() => {});
        }
        if (id !== activeId) return;
        const next = rest[0];
        if (next) openChat(next);
        else newChat();
    };

    const moveTab = (fromId: string, toId: string) => {
        const current = getStrip().order;
        const from = current.indexOf(fromId);
        const to = current.indexOf(toId);
        if (from < 0 || to < 0 || from === to) return;
        reorderChat(from, to);
        const next = [...current];
        const [moved] = next.splice(from, 1);
        if (!moved) return;
        next.splice(to, 0, moved);
        setOrder(next.filter((id) => !isToolId(id) && !isFileTab(id) && !isShowcaseTab(id) && id !== NEW_CHAT_TAB_ID));
    };

    const mac = platform === "macos";
    const [sidebarHost, setSidebarHost] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const find = () => document.getElementById(AGENT_TAB_SIDEBAR_SLOT);
        setSidebarHost(find());
        const timer = window.setInterval(() => {
            const node = find();
            if (node) {
                setSidebarHost(node);
                window.clearInterval(timer);
            }
        }, 50);
        return () => window.clearInterval(timer);
    }, []);

    const stripTabs = shown.filter((tab) => tab.id !== NEW_CHAT_TAB_ID);
    const activeTab = shown.find((tab) => tab.active);
    const titleWorking = Boolean(
        activeTab
        && !activeTab.file
        && !activeTab.tool
        && !isShowcaseTab(activeTab.id)
        && activeTab.id !== NEW_CHAT_TAB_ID
        && generating.has(activeTab.id),
    );
    const reloadPath = activeTab?.file ? activeTab.id.slice("file:".length) : null;

    const tree = (
        <ChatTabTree
            tabs={stripTabs.map((tab) => {
                const card = threadCards.find((item) => item.id === tab.id);
                const isThread = tab.id.startsWith("thread-") || tab.id.startsWith("sub-run-") || Boolean(card);
                return {
                    id: tab.id,
                    title: tab.title,
                    active: tab.active,
                    parentId: tab.parentId,
                    tool: tab.tool,
                    file: tab.file,
                    working: !tab.file && !tab.tool && generating.has(tab.id),
                    threadStatus: isThread
                        ? (generating.has(tab.id) ? "running" as const : card?.status === "error" ? "error" as const : card?.status === "done" ? "done" as const : undefined)
                        : undefined,
                };
            })}
            onActivate={openChat}
            onClose={closeChat}
            onNew={newChat}
            onCloseOthers={closeOthers}
        />
    );

    return (
        <div
            className="relative z-30 flex w-full min-w-0 shrink-0 flex-col overflow-visible bg-chrome font-normal tracking-normal text-[13px] text-text-primary"
            data-no-drag
        >
            {sidebarHost ? createPortal(tree, sidebarHost) : null}
            <div className={cn("flex h-10 w-full min-w-0 items-center pb-1", mac ? "ps-[78px]" : "ps-1")}>
                <ChatOmnibox
                    title={activeTab?.title || "New chat"}
                    projectPath={project_path}
                    fill
                    filesOpen={filesOpen}
                    onToggleFiles={onToggleFiles}
                    titleWorking={titleWorking}
                    reloadId={
                        activeTab && !activeTab.file && !activeTab.tool && activeTab.id !== NEW_CHAT_TAB_ID
                            ? activeTab.id
                            : null
                    }
                    reloadPath={reloadPath}
                />
                {mac ? null : <WindowControlsSpacer />}
            </div>
        </div>
    );
}
