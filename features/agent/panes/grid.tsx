"use client";

import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Chat from "@/features/chat/ui/chat";
import Graph from "@/features/git/ui/graph/graph";
import { PullRequestsPanel } from "@/features/chat/ui/prs/view";
import { ChatMessageList } from "@/features/chat/ui/message/list";
import { groupChatMessages } from "@/features/chat/lib/chat-session-utils";
import { ChatInput } from "@/features/chat/ui/composer/input";
import type { ReasoningEffort } from "@/features/chat/ui/composer/reasoning-effort";
import { ChatEmptyState } from "@/features/chat/ui/shell/empty";
import {
    createPendingAttachment,
    processAttachment,
    type ComposerAttachment,
} from "@/features/chat/ui/composer/attachments";
import { commands, useProjectState, type ChatMessage } from "@/lib/backend";
import { EditorSplitProvider, EditorViewProvider } from "@/core/providers/editor";
import { FileEditor } from "@/features/agent/workspace/editor";
import {
    activateChat,
    closeTool,
    fileTabPath,
    getStrip,
    isFileTab,
    isShowcaseTab,
    setPaneWeights,
    showView,
    showsSplit,
    subscribeStrip,
    terminalVisible,
    type ToolId,
} from "../strip";
import { ComponentShowcase } from "../showcase/view";

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

function CompanionChat({ conversationId }: { conversationId: string }) {
    const { project_path } = useProjectState();
    const [title, setTitle] = useState("New chat");
    const [messages, setMessages] = useState<ChatMessage[] | null>(null);
    const [draft, setDraft] = useState("");
    const [files, setFiles] = useState<ComposerAttachment[]>([]);
    const [model, setModel] = useState("auto");
    const [effort, setEffort] = useState<ReasoningEffort>("low");
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        const load = () => {
            void commands.getConversation(conversationId).then((conv) => {
                if (cancelled) return;
                setTitle(conv.title?.trim() || "New chat");
                setMessages(conv.history ?? []);
            }).catch(() => {
                if (!cancelled) setMessages([]);
            });
        };
        load();
        const onReload = (event: Event) => {
            const id = (event as CustomEvent<{ id?: string | null }>).detail?.id;
            if (id === conversationId) load();
        };
        const onRefresh = () => load();
        window.addEventListener("shape-reload-view", onReload as EventListener);
        window.addEventListener("shape-chat-refresh", onRefresh);
        return () => {
            cancelled = true;
            window.removeEventListener("shape-reload-view", onReload as EventListener);
            window.removeEventListener("shape-chat-refresh", onRefresh);
        };
    }, [conversationId]);

    const addFiles = (incoming: File[]) => {
        if (incoming.length === 0) return;
        const pending = incoming.map((file) => createPendingAttachment(file));
        setFiles((prev) => [...prev, ...pending]);
        for (const att of pending) {
            void processAttachment(att).then((ready) => {
                setFiles((prev) => prev.map((item) => (item.id === ready.id ? ready : item)));
            });
        }
    };

    const send = () => {
        const text = draft.trim();
        if (!text) return;
        setDraft("");
        activateChat(conversationId);
        window.dispatchEvent(new CustomEvent("shape-chat-send-text", {
            detail: { text, conversationId },
        }));
    };

    const composer = (
        <ChatInput
            inputValue={draft}
            isLoading={false}
            uploadedFiles={files}
            onInputChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send();
                }
            }}
            onSendMessage={send}
            onStopMessage={noop}
            setUploadedFiles={setFiles}
            addUploadedFiles={addFiles}
            selectedModel={model}
            setSelectedModel={setModel}
            reasoningEffort={effort}
            setReasoningEffort={setEffort}
            onNewChat={noop}
            folderLocked={!project_path}
        />
    );

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
                {!messages || messages.length === 0 ? (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5">
                        <div className="flex w-full max-w-4xl flex-col gap-4">
                            {messages ? <ChatEmptyState /> : <div className="h-16" />}
                            {composer}
                        </div>
                    </div>
                ) : (
                    <>
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
                        <div className="shrink-0 px-5 pb-3">{composer}</div>
                    </>
                )}
            </div>
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
    const showcase = Boolean(strip.activeId && isShowcaseTab(strip.activeId));
    const filePath = strip.activeId && isFileTab(strip.activeId) ? fileTabPath(strip.activeId) : null;
    const chatTarget = tool || filePath || showcase ? parkHost : chatHost;

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

    const liveColumn = (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel border border-white/9 rounded-t-[15px] squircle-b-[10px] m-0.5">
                <div ref={setChatHost} className="min-h-0 flex-1" />
            </div>
        </div>
    );

    return (
        <div ref={rowRef} data-pane-grid="" className="relative flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
            <div ref={setParkHost} className="hidden" />
            {tool && strip.activeId ? (
                <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
                        {strip.activeId === "tool:graph" ? <Graph hideHeader surface="panel" active /> : null}
                        {strip.activeId === "tool:prs" ? <PullRequestsPanel pane="full" /> : null}
                        {strip.activeId === "tool:terminal" ? (
                            <Suspense fallback={<div className="h-full w-full bg-panel" />}>
                                <Terminal terminalOnly isOpen onClose={() => closeTool("tool:terminal")} />
                            </Suspense>
                        ) : null}
                    </div>
                </div>
            ) : null}
            {showcase ? <ComponentShowcase /> : null}
            {!tool && !showcase && filePath ? (
                <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-hidden bg-panel">
                        <EditorViewProvider>
                            <EditorSplitProvider>
                                <FileEditor path={filePath} />
                            </EditorSplitProvider>
                        </EditorViewProvider>
                    </div>
                </div>
            ) : null}
            {!tool && !showcase && !filePath && splitOpen && split ? (
                <>
                    <div data-pane="" className="flex min-h-0 min-w-0 basis-0 flex-col overflow-hidden" style={{ flexGrow: split.weights[0] }}>
                        {focusLeft ? liveColumn : <CompanionChat conversationId={split.left} />}
                    </div>
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize split"
                        className="z-20 w-1.5 shrink-0 cursor-col-resize bg-border"
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
                        {focusLeft ? <CompanionChat conversationId={split.right} /> : liveColumn}
                    </div>
                </>
            ) : null}
            {!tool && !showcase && !filePath && !splitOpen ? liveColumn : null}
            {chatTarget ? createPortal(<Chat className="h-full bg-transparent" showTitlebar={false} />, chatTarget) : null}
        </div>
    );
}
