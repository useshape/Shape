"use client";

import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useChatSession } from "../lib/use-chat-session";
import { ChatTitlebar } from "./shell/titlebar";
import { ChatInput } from "./composer/input";
import { ChatMessageList } from "./message/list";
import { ChatErrorDialog } from "./blocks/error";
import { ChatEmptyState } from "./shell/empty";
import { parseMessageContent } from "./md/renderer";
import type { ComposerTaskItem } from "./composer/activity";
import { AGENT_TABS_SLOT } from "@/features/agent/chrome";
import { ChatHistoryStepper, useChatTurnActive } from "./shell/history-stepper";
import { useSyncChatGenerating } from "../lib/generating-chats";
import { SubagentChatView } from "@/features/agent/subagents/view";
import {
    closeSubagent,
    extractSubagentsFromText,
    getActiveSubagent,
    getSubagents,
    openSubagent,
    setSubagentParentConversation,
    subscribeSubagents,
    upsertSubagent,
} from "@/features/agent/subagents/store";

function stickyPromptText(content: string): string {
    const cleaned = content
        .replace(/<attached_(?:image|file|asset)\b[^>]*>[\s\S]*?<\/attached_(?:image|file|asset)>\n*/g, "")
        .trim()
        .replace(/\s+/g, " ");
    if (cleaned.length <= 120) return cleaned;
    return `${cleaned.slice(0, 117)}…`;
}

export default function Chat({
    className,
    embedded,
}: {
    className?: string;
    embedded?: boolean;
    /** @deprecated unused in shell */
    onClose?: () => void;
    sidebarSide?: "left" | "right";
    embedWindowControls?: React.ReactNode;
}) {
    const session = useChatSession();
    const activeSubagent = React.useSyncExternalStore(subscribeSubagents, getActiveSubagent, getActiveSubagent);

    React.useEffect(() => {
        setSubagentParentConversation(session.conversationId);
        return () => setSubagentParentConversation(null);
    }, [session.conversationId]);

    React.useEffect(() => {
        const onOpen = (e: Event) => {
            const detail = (e as CustomEvent<{ id?: string; parentId?: string }>).detail;
            if (detail?.parentId && detail.parentId !== session.conversationId) {
                void session.handleSelectChatTab(detail.parentId);
            }
            if (detail?.id) openSubagent(detail.id);
        };
        const onOpenForParent = (e: Event) => {
            const parentId = (e as CustomEvent<{ parentId?: string }>).detail?.parentId;
            if (parentId && parentId !== session.conversationId && parentId !== session.activeChatTabId) {
                void session.handleSelectChatTab(parentId);
            }
            const fromMessages = session.messages
                .map((m) => extractSubagentsFromText(m.content || "", parentId))
                .flat();
            const first = fromMessages[0];
            if (first) {
                upsertSubagent({
                    id: first.id,
                    title: first.title,
                    task: first.task,
                    model: first.model,
                    transcript: first.transcript,
                    activity: first.task || "Working…",
                    status: first.status,
                    parentId,
                });
                openSubagent(first.id);
                return;
            }
            const liveFirst = parentId
                ? getSubagents().find((c) => c.parentId === parentId)
                : getSubagents()[0];
            if (liveFirst) openSubagent(liveFirst.id);
        };
        window.addEventListener("shape-open-subagent", onOpen as EventListener);
        window.addEventListener("shape-open-subagents-for", onOpenForParent as EventListener);
        return () => {
            window.removeEventListener("shape-open-subagent", onOpen as EventListener);
            window.removeEventListener("shape-open-subagents-for", onOpenForParent as EventListener);
        };
    }, [session.conversationId, session.handleSelectChatTab, session.messages]);
    useSyncChatGenerating(session.conversationId ?? session.activeChatTabId, session.isLoading);
    const [tabsSlot, setTabsSlot] = React.useState<HTMLElement | null>(null);
    React.useEffect(() => {
        const find = () => document.getElementById(AGENT_TABS_SLOT);
        setTabsSlot(find());
        const timer = window.setInterval(() => {
            const el = find();
            if (el) {
                setTabsSlot(el);
                window.clearInterval(timer);
            }
        }, 50);
        const stop = window.setTimeout(() => window.clearInterval(timer), 2000);
        return () => {
            window.clearInterval(timer);
            window.clearTimeout(stop);
        };
    }, []);

    const taskItems = useMemo((): ComposerTaskItem[] => {
        const lastAssistant = [...session.messages].reverse().find((m) => m.role === "assistant");
        if (!lastAssistant) return [];

        const todos = parseMessageContent(lastAssistant.content).find((c) => c.type === "todos");
        if (!todos?.todos?.length) return [];

        const items: ComposerTaskItem[] = [];
        for (const t of todos.todos) {
            if (t.status === "done" || t.status === "cancelled") continue;
            items.push({
                id: t.id || t.label,
                label: t.label,
                status: t.status === "active" ? "running" : "pending",
            });
        }
        return items;
    }, [session.messages]);

    const newChatRef = React.useRef(session.handleNewChat);
    newChatRef.current = session.handleNewChat;
    const restoreRef = React.useRef(session.handleRestore);
    restoreRef.current = session.handleRestore;

    React.useEffect(() => {
        const onNewChat = () => {
            void newChatRef.current();
        };
        const onRestoreLast = () => {
            const msgs = session.messages;
            for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i]?.role === "user") {
                    void restoreRef.current(i);
                    return;
                }
            }
        };
        window.addEventListener("shape-chat-new", onNewChat);
        window.addEventListener("shape-chat-restore-last", onRestoreLast);
        return () => {
            window.removeEventListener("shape-chat-new", onNewChat);
            window.removeEventListener("shape-chat-restore-last", onRestoreLast);
        };
    }, [session.messages]);

    const extractedSubagents = useMemo(() => {
        const parentId = session.conversationId ?? session.activeChatTabId ?? undefined;
        const seen = new Map<string, { id: string; title: string; task?: string; model?: string; transcript?: string; status: "pending" | "running" | "done" | "error" }>();
        for (const m of session.messages) {
            for (const item of extractSubagentsFromText(m.content || "", parentId)) {
                seen.set(item.id, item);
            }
        }
        return [...seen.values()].map((item) => ({
            id: item.id,
            title: item.title,
            activity: item.task || "Working…",
            task: item.task,
            model: item.model,
            transcript: item.transcript,
            status: item.status,
            parentId,
            updatedAt: Date.now(),
        }));
    }, [session.messages, session.conversationId, session.activeChatTabId]);

    const titlebar = (
        <ChatTitlebar
            title={session.chatTitle}
            conversationId={session.conversationId ?? session.activeChatTabId}
            recentIds={(session.recentConvs ?? []).map((c) => c.id)}
            timestamp={
                (session.recentConvs ?? []).find((c) => c.id === session.conversationId)?.timestamp
                ?? session.messages.at(-1)?.timestamp
                ?? null
            }
            subagentTitle={activeSubagent?.title ?? null}
            extractedSubagents={extractedSubagents}
            onCloseSubagent={() => closeSubagent()}
            onSelect={(id) => {
                closeSubagent();
                void session.handleSelectChatTab(id);
            }}
        />
    );

    const turnCount = session.messageGroups.length;
    const [activeTurn, selectTurn] = useChatTurnActive(
        session.scrollContainerRef,
        turnCount,
        { streaming: session.isLoading },
    );

    const isEmpty = session.messages.length === 0;

    const turnLabels = useMemo(
        () =>
            session.messageGroups.map((group) => {
                const user = group.find((g) => g.msg.role === "user")?.msg;
                return user ? stickyPromptText(user.content) : `Turn`;
            }),
        [session.messageGroups],
    );

    const composer = (
        <ChatInput
            inputValue={session.inputValue}
            isLoading={session.isLoading}
            uploadedFiles={session.uploadedFiles}
            onInputChange={session.handleInputChange}
            onKeyDown={session.handleKeyDown}
            onSendMessage={() => {
                void session.handleSendMessage();
            }}
            onStopMessage={() => {
                void session.handleStopMessage();
            }}
            setUploadedFiles={session.setUploadedFiles}
            addUploadedFiles={session.addUploadedFiles}
            selectedModel={session.selectedModel}
            setSelectedModel={session.setSelectedModel}
            selectedMode={session.selectedMode}
            setSelectedMode={session.setSelectedMode}
            reasoningEffort={session.reasoningEffort}
            setReasoningEffort={session.setReasoningEffort}
            fastMode={session.fastMode}
            setFastMode={session.setFastMode}
            pendingEdits={session.pendingEdits}
            onAcceptAllEdits={() => void session.handleAcceptAll()}
            onRejectAllEdits={() => void session.handleRejectAll()}
            onAcceptEdit={(id) => void session.handleAcceptEdit(id)}
            onRejectEdit={(id) => void session.handleRejectEdit(id)}
            taskItems={isEmpty ? [] : taskItems}
            queuedMessages={session.messageQueue}
            onEditQueuedMessage={session.handleEditQueuedMessage}
            onRemoveQueuedMessage={session.handleRemoveQueuedMessage}
            variant={embedded || !isEmpty ? "default" : "empty"}
            density={embedded ? "compact" : "auto"}
        />
    );

    const insetX = embedded ? "px-2" : "px-5 md:px-6";
    const columnWidth = embedded ? "max-w-none" : "max-w-4xl";

    return (
        <div className={cn("flex h-full w-full flex-col overflow-hidden font-sans", className)}>
            {embedded ? null : tabsSlot ? createPortal(titlebar, tabsSlot) : null}

            <div className="relative flex min-h-0 flex-1 flex-col">
                {activeSubagent ? (
                    <div className="relative min-h-0 flex-1">
                        <div className="absolute inset-0 z-0 overflow-y-auto px-5 no-scrollbar select-text md:px-6">
                            <SubagentChatView />
                        </div>
                    </div>
                ) : isEmpty && !embedded ? (
                    <div className={cn("flex min-h-0 flex-1 flex-col items-center justify-center pb-8", insetX)}>
                        <div className={cn("flex w-full flex-col items-center gap-5", columnWidth)}>
                            <ChatEmptyState
                                onSelectMode={(mode) => {
                                    session.setSelectedMode(mode);
                                    window.dispatchEvent(new CustomEvent("shape-chat-focus-input"));
                                }}
                            />
                            <div className="w-full">
                                {composer}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="relative min-h-0 flex-1">
                            <div
                                ref={session.scrollContainerRef}
                                onScroll={session.handleScroll}
                                onKeyDown={(e) => {
                                    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "a") return;
                                    const target = e.target as HTMLElement | null;
                                    if (target?.closest("textarea, input, [contenteditable='true']")) return;
                                    e.preventDefault();
                                    const root = e.currentTarget;
                                    const range = document.createRange();
                                    range.selectNodeContents(root);
                                    const sel = window.getSelection();
                                    sel?.removeAllRanges();
                                    sel?.addRange(range);
                                }}
                                className={cn("absolute inset-0 z-0 flex flex-col overflow-y-auto no-scrollbar select-text", insetX)}
                            >
                                <div className={cn("mx-auto flex min-h-full w-full min-w-0 flex-col", columnWidth, embedded ? "pb-8 pt-3" : "pb-48 pt-8")}>
                                    <ChatMessageList
                                        messageGroups={session.messageGroups}
                                        messages={session.messages}
                                        isLoading={session.isLoading}
                                        activityLabel={session.activityLabel}
                                        messagesEndRef={session.messagesEndRef}
                                        onRedo={session.handleRedo}
                                        onRestore={session.handleRestore}
                                        isFileEditResolved={session.isEditResolved}
                                        activeChatTabId={session.activeChatTabId}
                                    />
                                </div>
                            </div>
                            <div
                                className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-linear-to-b from-panel to-transparent transition-opacity duration-200"
                                style={{ opacity: session.scrolledFromTop ? 1 : 0 }}
                                aria-hidden
                            />
                            {turnCount >= 2 && !embedded ? (
                                <div className="pointer-events-none absolute inset-y-0 right-1 z-10 hidden w-9 py-6 md:flex lg:right-3">
                                    <div className="pointer-events-auto flex h-full w-full items-stretch justify-end">
                                        <ChatHistoryStepper
                                            className="h-full"
                                            turnCount={turnCount}
                                            activeIndex={activeTurn}
                                            onSelect={selectTurn}
                                            turnLabels={turnLabels}
                                        />
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className={cn("relative z-20 w-full shrink-0 overflow-visible", insetX)}>
                            <div className={cn("relative mx-auto w-full overflow-visible", columnWidth)}>
                                <div
                                    className="pointer-events-none absolute inset-x-0 bottom-full h-20 bg-linear-to-t from-panel to-transparent"
                                    aria-hidden
                                />
                                {composer}
                            </div>
                        </div>
                    </>
                )}
            </div>
            <ChatErrorDialog
                message={session.sendError}
                onDismiss={() => session.setSendError(null)}
                onRetry={() => {
                    session.setSendError(null);
                    void session.handleSendMessage();
                }}
            />
        </div>
    );
}
