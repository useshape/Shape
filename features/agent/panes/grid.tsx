"use client";

import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Chat from "@/features/chat/ui/chat";
import Graph from "@/features/git/ui/graph/graph";
import { PullRequestsPanel } from "@/features/chat/ui/prs/view";
import { ChatMessageList } from "@/features/chat/ui/message/list";
import { groupChatMessages } from "@/features/chat/lib/chat-session-utils";
import { useChatStream } from "@/features/chat/lib/chat-stream-store";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ArrowUp20Regular } from "@fluentui/react-icons/headless/svg/arrow-up";
import { ChatOmnibox } from "@/features/chat/ui/shell/omnibox";
import { commands, useProjectState, type ChatMessage } from "@/lib/backend";
import {
    activateChat,
    closeTool,
    getStrip,
    setPaneWeights,
    showView,
    showsSplit,
    subscribeStrip,
    terminalVisible,
    type ToolId,
} from "../strip";

const Terminal = lazy(() => import("@/features/terminal/ui/terminal"));
const noop = () => {};
const unresolved = () => false;

function toolFromDetail(detail: unknown): ToolId | null {
    const value = typeof detail === "string"
        ? detail
        : (detail as { kind?: string; id?: string } | null)?.kind
            ?? (detail as { id?: string } | null)?.id;
    const id = (value || "").toLowerCase();
    if (id === "graph" || id === "git") return "tool:graph";
    if (id === "prs" || id === "pulls" || id === "pull-requests") return "tool:prs";
    if (id === "terminal" || id === "panel") return "tool:terminal";
    return null;
}

function SplitSide({ conversationId }: { conversationId: string }) {
    const { project_path } = useProjectState();
    const [title, setTitle] = useState("New chat");
    const [draft, setDraft] = useState("");

    useEffect(() => {
        let cancelled = false;
        void commands.getConversation(conversationId).then((conv) => {
            if (!cancelled) setTitle(conv.title?.trim() || "New chat");
        }).catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [conversationId]);

    const send = () => {
        const text = draft.trim();
        if (!text) return;
        setDraft("");
        activateChat(conversationId);
        window.dispatchEvent(new CustomEvent("shape-chat-send-text", {
            detail: { text, conversationId },
        }));
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <ChatOmnibox title={title} projectPath={project_path} showActions={false} />
            <IdleTranscript conversationId={conversationId} />
            <form
                className="shrink-0 px-3 pb-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    send();
                }}
            >
                <div className="flex h-11 items-center gap-2 rounded-full bg-surface-4 px-2">
                    <input
                        value={draft}
                        aria-label="Message"
                        placeholder="Message"
                        onChange={(event) => setDraft(event.target.value)}
                        className="h-8 min-w-0 flex-1 bg-transparent px-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                    />
                    <Button type="submit" size="icon" variant="default" aria-label="Send" disabled={!draft.trim()} className="size-8 rounded-full">
                        <Icon icon={ArrowUp20Regular} />
                    </Button>
                </div>
            </form>
        </div>
    );
}

function IdleTranscript({ conversationId }: { conversationId: string }) {
    const { peekSnapshot } = useChatStream();
    const endRef = useRef<HTMLDivElement>(null);
    const [messages, setMessages] = useState<ChatMessage[] | null>(null);

    useEffect(() => {
        const cached = peekSnapshot(conversationId);
        if (cached && cached.length > 0) {
            setMessages(cached);
            return;
        }
        let cancelled = false;
        void commands.getConversation(conversationId).then((conv) => {
            if (!cancelled) setMessages(conv.history ?? []);
        }).catch(() => {
            if (!cancelled) setMessages([]);
        });
        return () => {
            cancelled = true;
        };
    }, [conversationId, peekSnapshot]);

    if (!messages) return <div className="min-h-0 flex-1 bg-panel" />;
    return (
        <div data-chat-scroll="" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <ChatMessageList
                messageGroups={groupChatMessages(messages)}
                messages={messages}
                isLoading={false}
                activityLabel={null}
                messagesEndRef={endRef}
                onRedo={noop}
                onRestore={noop}
                isFileEditResolved={unresolved}
            />
        </div>
    );
}

export function PaneGrid() {
    const strip = useSyncExternalStore(subscribeStrip, getStrip, getStrip);
    const rowRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ start: number; left: number; right: number; span: number } | null>(null);
    const [chatHost, setChatHost] = useState<HTMLElement | null>(null);
    const [parkHost, setParkHost] = useState<HTMLElement | null>(null);
    const splitOpen = showsSplit(strip);
    const split = strip.split;
    const focusLeft = splitOpen && strip.activeId === split?.left;
    const tool = strip.activeId === "tool:graph" || strip.activeId === "tool:prs" || strip.activeId === "tool:terminal";
    const chatTarget = tool ? parkHost : chatHost;

    useEffect(() => {
        const onOpen = (event: Event) => {
            const next = toolFromDetail((event as CustomEvent).detail);
            if (next) showView(next);
        };
        const onPrs = () => showView("tool:prs");
        const onTerminal = () => showView("tool:terminal");
        const onToggle = (event: Event) => {
            const detail = (event as CustomEvent<{ id?: string; value?: boolean }>).detail;
            if (detail?.id !== "terminal" && detail?.id !== "panel") return;
            if (detail.value === false || (detail.value == null && terminalVisible())) {
                closeTool("tool:terminal");
                return;
            }
            showView("tool:terminal");
        };
        const onShortcut = (event: Event) => {
            const action = (event as CustomEvent<{ action?: string }>).detail?.action;
            if (action === "toggle" || (!action && terminalVisible())) {
                if (terminalVisible()) closeTool("tool:terminal");
                else showView("tool:terminal");
                return;
            }
            showView("tool:terminal");
        };
        window.addEventListener("shape-open-pane", onOpen as EventListener);
        window.addEventListener("shape-set-active-tab", onOpen as EventListener);
        window.addEventListener("shape-open-pull-requests", onPrs);
        window.addEventListener("shape-layout-toggle", onToggle as EventListener);
        window.addEventListener("shape-open-workspace-terminal", onTerminal);
        window.addEventListener("shape-terminal-shortcut", onShortcut as EventListener);
        return () => {
            window.removeEventListener("shape-open-pane", onOpen as EventListener);
            window.removeEventListener("shape-set-active-tab", onOpen as EventListener);
            window.removeEventListener("shape-open-pull-requests", onPrs);
            window.removeEventListener("shape-layout-toggle", onToggle as EventListener);
            window.removeEventListener("shape-open-workspace-terminal", onTerminal);
            window.removeEventListener("shape-terminal-shortcut", onShortcut as EventListener);
        };
    }, []);

    useEffect(() => {
        const onMove = (event: MouseEvent) => {
            const session = dragRef.current;
            const row = rowRef.current;
            if (!session || !row) return;
            const cells = row.querySelectorAll<HTMLElement>(":scope > [data-pane]");
            const left = cells[0];
            const right = cells[1];
            if (!left || !right) return;
            const delta = ((event.clientX - session.start) / session.span) * (session.left + session.right);
            const min = (session.left + session.right) * 0.18;
            const nextLeft = Math.min(session.left + session.right - min, Math.max(min, session.left + delta));
            left.style.flexGrow = String(nextLeft);
            right.style.flexGrow = String(session.left + session.right - nextLeft);
        };
        const onUp = () => {
            if (!dragRef.current) return;
            dragRef.current = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            const row = rowRef.current;
            if (!row) return;
            const cells = [...row.querySelectorAll<HTMLElement>(":scope > [data-pane]")];
            setPaneWeights(cells.map((cell) => Number.parseFloat(cell.style.flexGrow) || 1));
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, []);

    return (
        <div ref={rowRef} data-pane-grid="" className="relative flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
            <div ref={setParkHost} className="hidden" />
            {tool && strip.activeId === "tool:graph" ? <Graph hideHeader surface="panel" active /> : null}
            {tool && strip.activeId === "tool:prs" ? <PullRequestsPanel pane="full" /> : null}
            {tool && strip.activeId === "tool:terminal" ? (
                <Suspense fallback={<div className="h-full w-full bg-panel" />}>
                    <Terminal terminalOnly isOpen onClose={() => closeTool("tool:terminal")} />
                </Suspense>
            ) : null}
            {!tool && splitOpen && split ? (
                <>
                    <div data-pane="" className="flex min-h-0 min-w-0 basis-0 flex-col overflow-hidden" style={{ flexGrow: split.weights[0] }}>
                        {focusLeft ? <div ref={setChatHost} className="min-h-0 flex-1" /> : <SplitSide conversationId={split.left} />}
                    </div>
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize split"
                        className="z-20 w-1.5 shrink-0 cursor-col-resize bg-white/10"
                        onMouseDown={(event) => {
                            event.preventDefault();
                            dragRef.current = {
                                start: event.clientX,
                                left: split.weights[0],
                                right: split.weights[1],
                                span: Math.max(1, rowRef.current?.clientWidth ?? 1),
                            };
                            document.body.style.cursor = "col-resize";
                            document.body.style.userSelect = "none";
                        }}
                    />
                    <div data-pane="" className="flex min-h-0 min-w-0 basis-0 flex-col overflow-hidden" style={{ flexGrow: split.weights[1] }}>
                        {focusLeft ? <SplitSide conversationId={split.right} /> : <div ref={setChatHost} className="min-h-0 flex-1" />}
                    </div>
                </>
            ) : null}
            {!tool && !splitOpen ? <div ref={setChatHost} className="min-h-0 min-w-0 flex-1" /> : null}
            {chatTarget ? createPortal(<Chat className="h-full bg-transparent" />, chatTarget) : null}
        </div>
    );
}
