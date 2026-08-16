"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useChatSession } from "../lib/use-chat-session";
import { ChatTabBar } from "./shell/tabs";
import { ChatInput } from "./composer/input";
import { ChatMessageList } from "./message/list";
import { ChatEmptyState } from "./shell/empty";
import { parseMessageContent } from "./md/renderer";
import type { ComposerTaskItem } from "./composer/activity";

export default function Chat({
    className,
    onClose,
    sidebarSide = "right",
    embedWindowControls,
}: {
    className?: string;
    onClose?: () => void;
    sidebarSide?: "left" | "right";
    embedWindowControls?: React.ReactNode;
}) {
    const session = useChatSession();

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
    React.useEffect(() => {
        const onAnswer = (e: Event) => {
            const answer = (e as CustomEvent<{ answer?: string }>).detail?.answer;
            if (!answer?.trim()) return;
            void sendRef.current(answer);
        };
        window.addEventListener("shape-question-answer", onAnswer as EventListener);
        return () => window.removeEventListener("shape-question-answer", onAnswer as EventListener);
    }, []);

    return (
        <div className={cn("flex h-full w-full flex-col overflow-hidden bg-panel font-sans", className)}>
            <ChatTabBar
                title={session.chatTitle}
                onNewChat={() => void session.handleNewChat()}
                onClosePanel={onClose}
                sidebarSide={sidebarSide}
                embedWindowControls={embedWindowControls}
            />

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
                    className="relative z-0 flex min-h-0 flex-1 flex-col overflow-y-auto px-3 custom-scrollbar select-text"
                >
                    <div className="flex min-h-full w-full min-w-0 flex-col pb-8 pt-1">
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

                <div className="relative z-20 shrink-0">
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
