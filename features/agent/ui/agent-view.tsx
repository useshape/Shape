"use client";

import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ChatInput } from "@/features/chat/ui/composer/input";
import { ChatMessageList } from "@/features/chat/ui/message/list";
import { useChatSession } from "@/features/chat/lib/use-chat-session";
import { useAgentLayout } from "@/features/agent/lib/agent-layout-context";
import { parseMessageContent } from "@/features/chat/ui/md/renderer";
import type { ComposerTaskItem } from "@/features/chat/ui/composer/activity";
import { AgentSidebar } from "./agent-sidebar";
import { AgentRecentSessions } from "./agent-recent-sessions";
import { ShapeLogo } from "@/components/ui/shape-logo";

function AgentChatColumn({ session }: { session: ReturnType<typeof useChatSession> }) {
    const isEmpty = session.messages.length === 0;

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

    useEffect(() => {
        const onAnswer = (e: Event) => {
            const answer = (e as CustomEvent<{ answer?: string }>).detail?.answer;
            if (!answer?.trim()) return;
            void session.handleSendMessage(answer);
        };
        window.addEventListener("shape-question-answer", onAnswer as EventListener);
        return () => window.removeEventListener("shape-question-answer", onAnswer as EventListener);
    }, [session.handleSendMessage]);

    const input = (
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
    );

    return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-editor">
            {isEmpty ? (
                <div className="flex min-h-0 flex-1 flex-col items-center px-6 py-8">
                    <div className="flex-1" />
                    <div className="flex w-full max-w-2xl flex-col items-center gap-6">
                        <ShapeLogo size={40} className="opacity-80" />
                        <div className="w-full">{input}</div>
                        <AgentRecentSessions
                            conversations={session.recentConvs.slice(0, 5)}
                            onSelectConversation={(id) => void session.handleLoadConversation(id, { force: true })}
                        />
                    </div>
                    <div className="flex-1" />
                </div>
            ) : (
                <>
                    <div className="relative flex min-h-0 flex-1 flex-col">
                        <div
                            className="pointer-events-none relative z-10 shrink-0 transition-opacity duration-200"
                            style={{
                                height: 30,
                                marginBottom: -30,
                                opacity: session.scrolledFromTop ? 1 : 0,
                                background:
                                    "linear-gradient(to bottom, var(--color-background) 0%, transparent 100%)",
                            }}
                            aria-hidden
                        />
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
                            className="h-full overflow-y-auto no-scrollbar select-text"
                        >
                            <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col px-4 pb-8 pt-4">
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
                                />
                            </div>
                        </div>
                    </div>
                    <div className="relative z-20 mx-auto w-full max-w-3xl">
                        <div
                            className="pointer-events-none absolute inset-x-0 bottom-full h-8"
                            style={{
                                background: "linear-gradient(to top, var(--color-background) 0%, transparent 100%)",
                            }}
                            aria-hidden
                        />
                        {input}
                    </div>
                </>
            )}
        </div>
    );
}

export function AgentView({ className }: { className?: string }) {
    const session = useChatSession();
    const { sessionsOpen } = useAgentLayout();

    useEffect(() => {
        const onJump = (e: Event) => {
            const { messageIndex } = (e as CustomEvent<{ messageIndex: number }>).detail;
            const el = document.querySelector(`[data-chat-message-index="${messageIndex}"]`);
            if (!el) return;
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("bg-panel-hover");
            window.setTimeout(() => el.classList.remove("bg-panel-hover"), 1500);
        };
        const onNewChat = () => void session.handleNewChat();
        const onViewHistory = () => session.handleViewAllHistory();

        window.addEventListener("shape-agent-chat-jump", onJump);
        window.addEventListener("shape-agent-new-chat", onNewChat);
        window.addEventListener("shape-agent-view-history", onViewHistory);
        return () => {
            window.removeEventListener("shape-agent-chat-jump", onJump);
            window.removeEventListener("shape-agent-new-chat", onNewChat);
            window.removeEventListener("shape-agent-view-history", onViewHistory);
        };
    }, [session]);

    return (
        <div className={cn("flex h-full w-full overflow-hidden bg-editor font-sans", className)}>
            <div
                className={cn(
                    "shrink-0 overflow-hidden border bg-panel rounded-xl m-2 border-border transition-[width] duration-300 ease-[var(--ease-out)]",
                    sessionsOpen ? "w-[220px]" : "w-0 border-r-0",
                )}
            >
                <AgentSidebar
                    conversations={session.recentConvs}
                    activeConversationId={session.conversationId}
                    onNewSession={() => void session.handleNewChat()}
                    onSelectConversation={(id) => void session.handleLoadConversation(id, { force: true })}
                />
            </div>
            <div className="min-h-0 min-w-0 flex-1">
                <AgentChatColumn session={session} />
            </div>
        </div>
    );
}
