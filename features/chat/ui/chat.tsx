"use client";

import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useChatSession } from "../lib/use-chat-session";
import { ChatTitlebar } from "./shell/titlebar";
import { ChatInput } from "./composer/input";
import { ChatMessageList } from "./message/list";
import { ChatEmptyState } from "./shell/empty";
import { ComposerContextBar } from "./composer/context-bar";
import { parseMessageContent } from "./md/renderer";
import type { ComposerTaskItem } from "./composer/activity";
import { AGENT_TABS_SLOT } from "@/features/agent/chrome";
import { ChatHistoryStepper, useChatTurnActive } from "./shell/history-stepper";
import { useSyncChatGenerating } from "../lib/generating-chats";

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
}: {
    className?: string;
    /** @deprecated unused in shell */
    onClose?: () => void;
    sidebarSide?: "left" | "right";
    embedWindowControls?: React.ReactNode;
}) {
    const session = useChatSession();
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

    const titlebar = (
        <ChatTitlebar
            title={session.chatTitle}
            conversationId={session.conversationId}
            recentIds={(session.recentConvs ?? []).map((c) => c.id)}
            timestamp={
                (session.recentConvs ?? []).find((c) => c.id === session.conversationId)?.timestamp
                ?? session.messages.at(-1)?.timestamp
                ?? null
            }
            onSelect={(id) => {
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
            variant={isEmpty ? "empty" : "default"}
        />
    );

    return (
        <div className={cn("flex h-full w-full flex-col overflow-hidden font-sans", className)}>
            {tabsSlot ? createPortal(titlebar, tabsSlot) : null}

            <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="pointer-events-none relative z-20 h-0 shrink-0 overflow-visible">
                    <div
                        className="absolute inset-x-0 top-0 h-40 transition-opacity duration-200"
                        style={{
                            opacity: session.scrolledFromTop ? 1 : 0,
                            background:
                                "linear-gradient(to bottom, var(--color-panel) 0%, color-mix(in srgb, var(--color-panel) 78%, transparent) 28%, color-mix(in srgb, var(--color-panel) 38%, transparent) 62%, transparent 100%)",
                        }}
                        aria-hidden
                    />
                </div>

                {isEmpty ? (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-8 md:px-6">
                        <div className="flex w-full max-w-4xl flex-col items-center gap-5">
                            <ChatEmptyState
                                onSelectMode={(mode) => {
                                    session.setSelectedMode(mode);
                                    window.dispatchEvent(new CustomEvent("shape-chat-focus-input"));
                                }}
                            />
                            <div className="w-full">
                                {composer}
                                <ComposerContextBar className="mt-2" />
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
                                className="absolute inset-0 z-0 flex flex-col overflow-y-auto px-5 no-scrollbar select-text md:px-6"
                            >
                                <div className="mx-auto flex min-h-full w-full min-w-0 max-w-4xl flex-col pb-72 pt-8">
                                    <ChatMessageList
                                        messageGroups={session.messageGroups}
                                        messages={session.messages}
                                        isLoading={session.isLoading}
                                        activityLabel={session.activityLabel}
                                        sendError={session.sendError}
                                        onDismissError={() => session.setSendError(null)}
                                        onRetryError={() => {
                                            session.setSendError(null);
                                            void session.handleSendMessage();
                                        }}
                                        messagesEndRef={session.messagesEndRef}
                                        onRedo={session.handleRedo}
                                        onRestore={session.handleRestore}
                                        isFileEditResolved={session.isEditResolved}
                                        activeChatTabId={session.activeChatTabId}
                                    />
                                </div>
                            </div>
                            {turnCount >= 2 ? (
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

                        <div className="relative z-20 w-full shrink-0 overflow-visible px-5 md:px-6">
                            <div className="relative mx-auto w-full max-w-4xl overflow-visible">
                                <div
                                    className="pointer-events-none absolute inset-x-0 bottom-full h-40"
                                    style={{
                                        background:
                                            "linear-gradient(to top, var(--color-panel) 0%, color-mix(in srgb, var(--color-panel) 78%, transparent) 28%, color-mix(in srgb, var(--color-panel) 38%, transparent) 62%, transparent 100%)",
                                    }}
                                    aria-hidden
                                />
                                {composer}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
