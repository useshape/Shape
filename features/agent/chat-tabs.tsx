"use client";

import { Add20Regular } from "@fluentui/react-icons/headless/svg/add";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { commands, useProjectState } from "@/lib/backend";
import type { Conversation } from "@/lib/backend/types";
import { useGitHubAuth } from "@/lib/github/store";
import { useShapeAuth } from "@/lib/cloud/store";
import { conversationStorePath, TALK_CONVERSATION_STORE } from "@/lib/chat/conversation-store";
import { isTalkWorkspace, useWorkspaceMode } from "@/lib/ui/workspace-mode";
import { NEW_CHAT_TAB_ID } from "@/features/chat/ui/shell/tabs";
import { WindowControlsSpacer } from "@/features/agent/workbench/titlebar/ui/window-controls";
import { AccountMenu, ProfileAvatar } from "./sidebar/menu";
import { cn } from "@/lib/utils";

const MAX_TABS = 5;

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
                className="flex h-7 items-center gap-0.5 rounded-full py-0.5 pl-0.5 pr-1 hover:bg-panel-hover"
            >
                <span className="grid size-[22px] place-items-center overflow-hidden rounded-full bg-surface-4">
                    <ProfileAvatar
                        gitAvatarUrl={github.loggedIn ? github.avatarUrl : null}
                        shapeUserId={shapeAuth.userId}
                        offline={Boolean(shapeAuth.offline)}
                        name={name}
                        size={22}
                    />
                </span>
                <Icon icon={ChevronDown20Regular} className="text-text-muted" />
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

    const loadChats = useCallback(async () => {
        try {
            const store = conversationStorePath(mode, project_path);
            const merged = isTalkWorkspace(mode)
                ? await commands.getConversations(TALK_CONVERSATION_STORE)
                : store
                  ? await commands.getConversations(store)
                  : [];
            setChats(merged.filter((chat) => !chat.archived));
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

    const byId = useMemo(() => {
        const map = new Map<string, Conversation>();
        for (const chat of chats) map.set(chat.id, chat);
        return map;
    }, [chats]);

    const tabs = useMemo(() => {
        const items = order.flatMap((id) => {
            const chat = byId.get(id);
            if (!chat) return [];
            return [{ id, title: chat.title?.trim() || "Untitled", active: id === activeId }];
        });
        if (!items.some((tab) => tab.active)) {
            return [{ id: NEW_CHAT_TAB_ID, title: "New chat", active: true }, ...items];
        }
        return items;
    }, [order, byId, activeId]);

    const shown = useMemo(() => {
        const head = tabs.slice(0, MAX_TABS);
        const active = tabs.find((tab) => tab.active);
        if (active && !head.some((tab) => tab.id === active.id)) {
            return [...head.slice(0, MAX_TABS - 1), active];
        }
        return head;
    }, [tabs]);

    const openChat = (id: string) => {
        if (id === NEW_CHAT_TAB_ID) {
            setActiveId(null);
            window.dispatchEvent(new Event("shape-chat-new"));
            window.dispatchEvent(new Event("shape-chat-focus-input"));
            return;
        }
        setActiveId(id);
        window.dispatchEvent(new CustomEvent("shape-chat-load", { detail: { id } }));
    };

    const newChat = () => {
        window.dispatchEvent(new Event("shape-chat-new"));
        window.dispatchEvent(new Event("shape-chat-focus-input"));
    };

    const closeChat = (id: string) => {
        if (id === NEW_CHAT_TAB_ID) return;
        const rest = order.filter((item) => item !== id);
        setOrder(rest);
        void commands
            .setConversationArchived(id, true)
            .then(() => window.dispatchEvent(new CustomEvent("shape-chat-refresh")))
            .catch(() => {});
        if (id !== activeId) return;
        const next = rest[0];
        if (next) openChat(next);
        else newChat();
    };

    const moveTab = (tabId: string, overId: string) => {
        if (tabId === overId || tabId === NEW_CHAT_TAB_ID || overId === NEW_CHAT_TAB_ID) return;
        setOrder((prev) => {
            const from = prev.indexOf(tabId);
            const to = prev.indexOf(overId);
            if (from < 0 || to < 0) return prev;
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    };

    const rowRef = useRef<HTMLDivElement>(null);
    const indRef = useRef<HTMLDivElement>(null);
    const boxRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
    const selectedId = shown.find((tab) => tab.active)?.id ?? "";
    const prevActive = useRef(selectedId);

    const readBox = useCallback(() => {
        const row = rowRef.current;
        const active = row?.querySelector<HTMLElement>("[data-active='true']");
        if (!row || !active) return null;
        return {
            x: active.offsetLeft,
            y: active.offsetTop,
            w: active.offsetWidth,
            h: active.offsetHeight,
        };
    }, []);

    const paintHighlight = useCallback((animate: boolean) => {
        const el = indRef.current;
        const next = readBox();
        if (!el || !next) return;
        const from = boxRef.current;
        if (!animate && el.getAnimations().length > 0) return;
        if (animate && from.w > 0) {
            const anim = el.animate(
                [
                    {
                        transform: `translate(${from.x}px, ${from.y}px) scale(1)`,
                        width: `${from.w}px`,
                        height: `${from.h}px`,
                    },
                    {
                        transform: `translate(${(from.x + next.x) / 2}px, ${next.y}px) scale(1.08)`,
                        width: `${(from.w + next.w) / 2}px`,
                        height: `${next.h}px`,
                        offset: 0.42,
                    },
                    {
                        transform: `translate(${next.x}px, ${next.y}px) scale(1)`,
                        width: `${next.w}px`,
                        height: `${next.h}px`,
                    },
                ],
                {
                    duration: 340,
                    easing: "cubic-bezier(0.32, 0.72, 0, 1)",
                    fill: "forwards",
                },
            );
            boxRef.current = next;
            anim.onfinish = () => {
                el.style.width = `${next.w}px`;
                el.style.height = `${next.h}px`;
                el.style.transform = `translate(${next.x}px, ${next.y}px) scale(1)`;
                anim.cancel();
            };
            return;
        }
        el.getAnimations().forEach((anim) => anim.cancel());
        el.style.width = `${next.w}px`;
        el.style.height = `${next.h}px`;
        el.style.transform = `translate(${next.x}px, ${next.y}px) scale(1)`;
        boxRef.current = next;
    }, [readBox]);

    useLayoutEffect(() => {
        const switched = prevActive.current !== "" && prevActive.current !== selectedId;
        prevActive.current = selectedId;
        paintHighlight(switched);
        const row = rowRef.current;
        if (!row) return;
        const observer = new ResizeObserver(() => {
            if (indRef.current?.getAnimations().length) return;
            paintHighlight(false);
        });
        observer.observe(row);
        return () => observer.disconnect();
    }, [selectedId, shown, paintHighlight]);

    return (
        <div
            className="shape-window-titlebar relative z-30 flex h-titlebar w-full shrink-0 items-center gap-2 pl-2"
            data-tauri-drag-region
        >
            <div className="flex shrink-0 items-center" data-no-drag>
                <ChromeAvatar />
            </div>
            <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden py-1" data-tauri-drag-region>
                <div
                    className="group/tabs relative flex h-full w-full min-w-0 items-stretch overflow-hidden rounded-full bg-[#ffffff11] px-0.5"
                    data-tauri-drag-region
                >
                    <div ref={rowRef} className="relative flex h-full min-w-0 flex-1 items-stretch gap-1">
                        <div
                            ref={indRef}
                            aria-hidden
                            className="pointer-events-none absolute top-0 left-0 rounded-full bg-[#ffffff10]"
                        />
                        {shown.map((tab, index) => (
                            <div
                                key={tab.id}
                                className="flex min-w-0 flex-1 items-stretch"
                                style={{ flex: "1 1 0%", minWidth: 0 }}
                            >
                                {index > 0 ? (
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "my-auto h-3.5 w-px shrink-0 bg-white/15 transition-opacity duration-200",
                                            (tab.active || shown[index - 1]?.active) && "opacity-0",
                                        )}
                                    />
                                ) : null}
                                <Pill
                                    id={tab.id}
                                    title={tab.title}
                                    active={tab.active}
                                    onOpen={() => openChat(tab.id)}
                                    onClose={tab.id === NEW_CHAT_TAB_ID ? undefined : () => closeChat(tab.id)}
                                    onMove={moveTab}
                                />
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        aria-label="New chat"
                        data-no-drag
                        onClick={newChat}
                        className="pointer-events-none flex h-full w-0 shrink-0 items-center justify-center overflow-hidden text-text-secondary opacity-0 transition-[width,opacity] duration-200 ease-out group-hover/tabs:pointer-events-auto group-hover/tabs:w-8 group-hover/tabs:opacity-100 hover:text-text-primary"
                    >
                        <Icon icon={Add20Regular} style={{ ["--icon-size" as string]: "16px" }} />
                    </button>
                </div>
            </div>
            <WindowControlsSpacer />
        </div>
    );
}

function Pill({
    id,
    title,
    active,
    onOpen,
    onClose,
    onMove,
}: {
    id: string;
    title: string;
    active: boolean;
    onOpen: () => void;
    onClose?: () => void;
    onMove: (tabId: string, overId: string) => void;
}) {
    return (
        <div
            data-chat-tab={id}
            data-no-drag
            onPointerDown={(event) => {
                if (event.button !== 0) return;
                if ((event.target as HTMLElement).closest("[data-close]")) return;
                const pointerId = event.pointerId;
                const startX = event.clientX;
                let reordered = false;
                const move = (ev: PointerEvent) => {
                    if (ev.pointerId !== pointerId) return;
                    if (Math.abs(ev.clientX - startX) < 12) return;
                    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-chat-tab]");
                    const over = hit?.getAttribute("data-chat-tab");
                    if (over && over !== id) {
                        onMove(id, over);
                        reordered = true;
                    }
                };
                const up = (ev: PointerEvent) => {
                    if (ev.pointerId !== pointerId) return;
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                    if (!reordered) onOpen();
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
            }}
            data-active={active ? "true" : "false"}
            className={cn(
                "group relative z-[1] grid h-full min-w-0 flex-1 grid-cols-[14px_minmax(0,1fr)_14px] items-center rounded-full px-2.5",
                "text-[13px] leading-none tracking-[-0.011em]",
                active ? "text-text-primary" : "text-text-secondary hover:text-text-primary",
            )}
        >
            {!active ? (
                <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 origin-center scale-100 rounded-full bg-transparent transition-[background-color,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.06] group-hover:bg-white/[0.08]"
                />
            ) : null}
            <span />
            <span
                className="block min-w-0 truncate text-center leading-none"
                style={{
                    maskImage: "linear-gradient(90deg, transparent, #000 12px, #000 calc(100% - 16px), transparent)",
                    WebkitMaskImage: "linear-gradient(90deg, transparent, #000 12px, #000 calc(100% - 16px), transparent)",
                }}
            >
                {title}
            </span>
            {onClose ? (
                <button
                    type="button"
                    data-close=""
                    aria-label={`Close ${title}`}
                    onClick={onClose}
                    className="flex size-3.5 items-center justify-center justify-self-center rounded-full text-text-muted opacity-0 hover:bg-white/10 hover:text-text-primary group-hover:opacity-100"
                >
                    <Icon icon={Dismiss20Regular} style={{ ["--icon-size" as string]: "12px" }} />
                </button>
            ) : (
                <span />
            )}
        </div>
    );
}
