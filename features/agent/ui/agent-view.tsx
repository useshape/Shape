"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChatInput } from "@/features/chat/ui/composer/input";
import { ChatMessageList } from "@/features/chat/ui/message/list";
import { useChatSession } from "@/features/chat/lib/use-chat-session";
import { useAgentLayout } from "@/features/agent/lib/agent-layout-context";
import { parseMessageContent } from "@/features/chat/ui/md/renderer";
import type { ComposerTaskItem } from "@/features/chat/ui/composer/activity";
import { Icon } from "@/components/ui/icon";
import { AgentSidebar } from "./agent-sidebar";
import { AgentRecentSessions } from "./agent-recent-sessions";
import { AgentRightRail } from "./agent-right-rail";
import { AgentComposerFooter } from "./agent-composer-footer";
import { ShapeLogo } from "@/components/ui/shape-logo";
import { AiSettingsPanel } from "@/features/settings/ui/ai-settings";
import { useSettings } from "@/lib/settings";
import { AnimatedSecondarySidebarIcon, AnimatedSidebarIcon } from "@/features/activity-bar";

const PANEL_DEFAULT_WIDTH = 440;
const PANEL_MIN_WIDTH = 300;
const PANEL_MAX_WIDTH = 780;
const SESSIONS_WIDTH = 220;
const CHROME_EASE = "duration-[220ms] ease-[var(--ease-out)]";

function AgentChromeToggle({
    label,
    active,
    onClick,
    children,
}: {
    label: string;
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={onClick}
            className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-[color,background-color] duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary",
                active && "text-text-primary",
            )}
        >
            {children}
        </button>
    );
}

function AgentAiSettingsOverlay() {
    const settings = useSettings();
    const { closeAiSettings } = useAgentLayout();

    return (
        <div className="flex h-full min-h-0 animate-[agent-fade-in_180ms_var(--ease-out)] flex-col overflow-hidden bg-editor">
            <div className="flex h-10 shrink-0 items-center gap-2 px-3">
                <button
                    type="button"
                    onClick={closeAiSettings}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-[color,background-color] duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
                    aria-label="Back"
                    title="Back"
                >
                    <Icon name="arrow_back" size={16} />
                </button>
                <div className="text-sm font-medium text-text-primary">AI Settings</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
                <div className="mx-auto w-full max-w-2xl">
                    <AiSettingsPanel settings={settings} />
                </div>
            </div>
        </div>
    );
}

function AgentChatColumn({ session }: { session: ReturnType<typeof useChatSession> }) {
    const { sessionsOpen, toggleSessions, panelOpen, togglePanel, aiSettingsOpen } = useAgentLayout();
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

    const scrollToBottom = () => {
        session.messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    };

    const chromeBar = (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-10 items-center justify-between px-2">
            <div
                className={cn(
                    "pointer-events-auto transition-[opacity,transform] ",
                    CHROME_EASE,
                    sessionsOpen ? "pointer-events-none scale-95 opacity-0" : "scale-100 opacity-100",
                )}
            >
                <AgentChromeToggle label="Toggle Sessions" active={false} onClick={toggleSessions}>
                    <AnimatedSidebarIcon active={false} size={16} />
                </AgentChromeToggle>
            </div>
            <div className="pointer-events-auto">
                <AgentChromeToggle label="Toggle Panel" active={panelOpen} onClick={togglePanel}>
                    <AnimatedSecondarySidebarIcon active={panelOpen} size={16} />
                </AgentChromeToggle>
            </div>
        </div>
    );

    if (aiSettingsOpen) {
        return (
            <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-editor">
                {chromeBar}
                <div className="min-h-0 flex-1 pt-10">
                    <AgentAiSettingsOverlay />
                </div>
            </div>
        );
    }

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
            {chromeBar}
            {isEmpty ? (
                <div className="flex min-h-0 flex-1 animate-[agent-fade-in_200ms_var(--ease-out)] flex-col items-center px-6 pb-8 pt-10">
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
                    <div className="w-full max-w-2xl">
                        <AgentComposerFooter />
                    </div>
                </div>
            ) : (
                <>
                    <div className="relative flex min-h-0 flex-1 flex-col pt-10">
                        <div
                            className="pointer-events-none relative z-10 shrink-0 transition-opacity duration-[var(--transition-base)] ease-[var(--ease-out)]"
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
                            style={{ fontSize: "var(--conversation-font-size)", lineHeight: "var(--conversation-line-height)" }}
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
                        {session.scrolledFromBottom ? (
                            <div className="pointer-events-none absolute inset-x-0 bottom-full z-30 mb-2 flex justify-center">
                                <button
                                    type="button"
                                    onClick={scrollToBottom}
                                    className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-panel text-text-muted shadow-sm transition-[color,background-color,transform,opacity] duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary animate-[agent-fade-in_160ms_var(--ease-out)]"
                                    title="Scroll to bottom"
                                    aria-label="Scroll to bottom"
                                >
                                    <Icon name="expand_more" size={16} />
                                </button>
                            </div>
                        ) : null}
                        <div
                            className="pointer-events-none absolute inset-x-0 bottom-full h-8"
                            style={{
                                background: "linear-gradient(to top, var(--color-background) 0%, transparent 100%)",
                            }}
                            aria-hidden
                        />
                        {input}
                        <AgentComposerFooter />
                    </div>
                </>
            )}
        </div>
    );
}

export function AgentView({ className }: { className?: string }) {
    const session = useChatSession();
    const { sessionsOpen, panelOpen, panelTab, setPanelTab, setPanelOpen } = useAgentLayout();
    const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
    const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

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

    useEffect(() => {
        if (session.pendingEdits.length === 0) return;
        setPanelOpen(true);
        if (panelTab === "preview" || panelTab === "terminal") return;
        setPanelTab("changes");
    }, [session.pendingEdits.length, panelTab, setPanelOpen, setPanelTab]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragRef.current) return;
            const delta = dragRef.current.startX - e.clientX;
            const next = Math.min(
                PANEL_MAX_WIDTH,
                Math.max(PANEL_MIN_WIDTH, dragRef.current.startWidth + delta),
            );
            setPanelWidth(next);
        };
        const onUp = () => {
            dragRef.current = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, []);

    const sessionsShellWidth = sessionsOpen ? SESSIONS_WIDTH + 16 : 0; // include floating gutters roughly
    const panelShellWidth = panelOpen ? panelWidth + 16 : 0;

    return (
        <div className={cn("flex h-full w-full overflow-hidden bg-editor font-sans", className)}>
            <div
                className={cn(
                    "shrink-0 overflow-hidden transition-[width,opacity] ",
                    CHROME_EASE,
                )}
                style={{
                    width: sessionsShellWidth,
                    opacity: sessionsOpen ? 1 : 0,
                    pointerEvents: sessionsOpen ? "auto" : "none",
                }}
                aria-hidden={!sessionsOpen}
            >
                <div
                    className="floating-panel h-full"
                    style={{
                        width: SESSIONS_WIDTH,
                        // Keep card geometry stable while the shell width animates.
                        minWidth: SESSIONS_WIDTH,
                    }}
                >
                    <AgentSidebar
                        conversations={session.recentConvs}
                        activeConversationId={session.conversationId}
                        onNewSession={() => void session.handleNewChat()}
                        onSelectConversation={(id) => void session.handleLoadConversation(id, { force: true })}
                    />
                </div>
            </div>

            <div className="min-h-0 min-w-0 flex-1">
                <AgentChatColumn session={session} />
            </div>

            <div
                className={cn(
                    "flex shrink-0 overflow-hidden transition-[width,opacity] ",
                    CHROME_EASE,
                )}
                style={{
                    width: panelShellWidth,
                    opacity: panelOpen ? 1 : 0,
                    pointerEvents: panelOpen ? "auto" : "none",
                }}
                aria-hidden={!panelOpen}
            >
                <AgentRightRail
                    width={panelWidth}
                    tab={panelTab}
                    onTabChange={setPanelTab}
                    onClose={() => setPanelOpen(false)}
                    onResizeStart={(clientX) => {
                        dragRef.current = { startX: clientX, startWidth: panelWidth };
                        document.body.style.cursor = "col-resize";
                        document.body.style.userSelect = "none";
                    }}
                    edits={session.pendingEdits}
                    onAcceptAll={() => void session.handleAcceptAll()}
                    onRejectAll={() => void session.handleRejectAll()}
                    onAcceptEdit={(id) => void session.handleAcceptEdit(id)}
                    onRejectEdit={(id) => void session.handleRejectEdit(id)}
                />
            </div>
        </div>
    );
}
