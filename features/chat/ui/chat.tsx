"use client";

import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useChatSession } from "../lib/use-chat-session";
import { ChatTabBar } from "./shell/tabs";
import { ChatInput } from "./composer/input";
import { ChatMessageList } from "./message/list";
import { ChatEmptyState } from "./shell/empty";
import { parseMessageContent } from "./md/renderer";
import type { ComposerTaskItem } from "./composer/activity";
import { AGENT_TABS_SLOT } from "@/features/agent/chrome";
import { ChatHistoryStepper, useChatTurnActive } from "./shell/history-stepper";

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
        // Only real todo tasks belong in the composer strip - never tool chatter
        // like "Generating", "List dir", "Read file", etc.
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
    React.useEffect(() => {
        const onAnswer = (e: Event) => {
            const answer = (e as CustomEvent<{ answer?: string }>).detail?.answer;
            if (!answer?.trim()) return;
            void sendRef.current(answer);
        };
        const onNewChat = () => {
            void newChatRef.current();
        };
        window.addEventListener("shape-question-answer", onAnswer as EventListener);
        window.addEventListener("shape-chat-new", onNewChat);
        return () => {
            window.removeEventListener("shape-question-answer", onAnswer as EventListener);
            window.removeEventListener("shape-chat-new", onNewChat);
        };
    }, []);

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
    );

    return (
        <div className={cn("flex h-full w-full flex-col overflow-hidden font-sans", className)}>
            {tabsSlot ? createPortal(tabBar, tabsSlot) : null}

            <div className="relative flex min-h-0 flex-1 flex-col">
                {/* Twin of the composer fade — only when scrolled from top */}
                <div className="pointer-events-none relative z-20 h-0 shrink-0 overflow-visible">
                    <div
                        className="absolute inset-x-0 top-0 h-10 transition-opacity duration-200"
                        style={{
                            opacity: session.scrolledFromTop ? 1 : 0,
                            background:
                                "linear-gradient(to bottom, var(--color-panel) 0%, var(--color-panel) 40%, transparent 100%)",
                        }}
                        aria-hidden
                    />
                </div>
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
                        <div className="mx-auto flex min-h-full w-full min-w-0 max-w-3xl flex-col pb-8 pt-1">
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
                                emptyState={
                                    <ChatEmptyState
                                        onSelectMode={(mode) => {
                                            session.setSelectedMode(mode);
                                            window.dispatchEvent(new CustomEvent("shape-chat-focus-input"));
                                        }}
                                    />
                                }
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
                                />
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="relative z-20 mx-auto w-full max-w-3xl shrink-0">
                    <div
                        className="pointer-events-none absolute inset-x-0 bottom-full h-10"
                        style={{
                            background:
                                "linear-gradient(to top, var(--color-panel) 0%, var(--color-panel) 40%, transparent 100%)",
                        }}
                        aria-hidden
                    />
                    <ChatInput
                        inputValue={session.inputValue}
                        isLoading={session.isLoading}
                        uploadedFiles={session.uploadedFiles}
                        onInputChange={session.handleInputChange}
                        onKeyDown={session.handleKeyDown}
                        onSendMessage={() => { void session.handleSendMessage(); }}
                        onStopMessage={() => { void session.handleStopMessage(); }}
                        setUploadedFiles={session.setUploadedFiles}
                        selectedModel={session.selectedModel}
                        setSelectedModel={session.setSelectedModel}
                        selectedMode={session.selectedMode}
                        setSelectedMode={session.setSelectedMode}
                        pendingEdits={session.pendingEdits}
                        onAcceptAllEdits={() => void session.handleAcceptAll()}
                        onRejectAllEdits={() => void session.handleRejectAll()}
                        onAcceptEdit={(id) => void session.handleAcceptEdit(id)}
                        onRejectEdit={(id) => void session.handleRejectEdit(id)}
                        taskItems={taskItems}
                    />
                </div>
            </div>
        </div>
    );
}
