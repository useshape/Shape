"use client";

import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useChatSession } from "../lib/use-chat-session";
import { ChatTabBar } from "./shell/tabs";
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
        .replace(/<attached_(?:image|file)\b[^>]*>[\s\S]*?<\/attached_(?:image|file)>\n*/g, "")
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
    useSyncChatGenerating(session.activeChatTabId, session.isLoading);
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
        if (!session.isLoading) return [];

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
    }, [session.isLoading, session.messages]);

    const sendRef = React.useRef(session.handleSendMessage);
    sendRef.current = session.handleSendMessage;
    const newChatRef = React.useRef(session.handleNewChat);
    newChatRef.current = session.handleNewChat;
    const restoreRef = React.useRef(session.handleRestore);
    restoreRef.current = session.handleRestore;

    React.useEffect(() => {
        const onAnswer = (e: Event) => {
            const answer = (e as CustomEvent<{ answer?: string }>).detail?.answer;
            if (!answer?.trim()) return;
            void sendRef.current(answer);
        };
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
        window.addEventListener("shape-question-answer", onAnswer as EventListener);
        window.addEventListener("shape-chat-new", onNewChat);
        window.addEventListener("shape-chat-restore-last", onRestoreLast);
        return () => {
            window.removeEventListener("shape-question-answer", onAnswer as EventListener);
            window.removeEventListener("shape-chat-new", onNewChat);
            window.removeEventListener("shape-chat-restore-last", onRestoreLast);
        };
    }, [session.messages]);

    const tabBar = (
        <ChatTabBar
            title={session.chatTitle}
            onNewChat={() => void session.handleNewChat()}
            tabs={session.openChatTabs}
            activeTabId={session.activeChatTabId}
            onSelectTab={(id) => void session.handleSelectChatTab(id)}
            onCloseTab={(id) => void session.handleCloseChatTab(id)}
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
            variant={isEmpty ? "empty" : "default"}
        />
    );

    return (
        <div className={cn("flex h-full w-full flex-col overflow-hidden font-sans", className)}>
            {tabsSlot ? createPortal(tabBar, tabsSlot) : null}

            <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="pointer-events-none relative z-20 h-0 shrink-0 overflow-visible">
                    <div
                        className="absolute inset-x-0 top-0 h-16 transition-opacity duration-200"
                        style={{
                            opacity: session.scrolledFromTop ? 1 : 0,
                            background:
                                "linear-gradient(to bottom, color-mix(in srgb, var(--color-panel) 88%, transparent) 0%, color-mix(in srgb, var(--color-panel) 45%, transparent) 55%, transparent 100%)",
                        }}
                        aria-hidden
                    />
                </div>

                {isEmpty ? (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 pb-8">
                        <div className="flex w-full max-w-3xl flex-col items-center gap-5">
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
                                className="absolute inset-0 z-0 flex flex-col overflow-y-auto px-3 no-scrollbar select-text"
                            >
                                <div className="mx-auto flex min-h-full w-full min-w-0 max-w-3xl flex-col pb-28 pt-8">
                                    <ChatMessageList
                                        messageGroups={session.messageGroups}
                                        messages={session.messages}
                                        isLoading={session.isLoading}
                                        activityLabel={session.activityLabel}
                                        sendError={session.sendError}
                                        onDismissError={() => session.setSendError(null)}
                                        messagesEndRef={session.messagesEndRef}
                                        onRedo={session.handleRedo}
                                        onRestore={session.handleRestore}
                                        isFileEditResolved={session.isEditResolved}
                                        activeChatTabId={session.activeChatTabId}
                                    />
                                </div>
                            </div>
                            {turnCount >= 2 ? (
                                <div className="pointer-events-none absolute inset-y-0 right-1 z-10 hidden w-9 items-center justify-center md:flex lg:right-3">
                                    <div className="pointer-events-auto">
                                        <ChatHistoryStepper
                                            turnCount={turnCount}
                                            activeIndex={activeTurn}
                                            onSelect={selectTurn}
                                            turnLabels={turnLabels}
                                        />
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="relative z-20 mx-auto w-full max-w-3xl shrink-0 overflow-visible">
                            <div
                                className="pointer-events-none absolute inset-x-0 bottom-full h-16"
                                style={{
                                    background:
                                        "linear-gradient(to top, color-mix(in srgb, var(--color-panel) 88%, transparent) 0%, color-mix(in srgb, var(--color-panel) 45%, transparent) 55%, transparent 100%)",
                                }}
                                aria-hidden
                            />
                            {composer}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
