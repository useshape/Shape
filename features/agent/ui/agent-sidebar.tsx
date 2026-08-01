"use client";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/backend/types";
import { Button } from "@/components/ui/button";
import { openChatHistoryMenu } from "@/features/chat/ui/shell/history";

function formatRelative(timestamp: number) {
    const now = Date.now() / 1000;
    const diff = Math.max(0, now - timestamp);
    const minutes = Math.floor(diff / 60);
    const hours = Math.floor(diff / 3600);
    const days = Math.floor(diff / 86400);
    if (days >= 1) return `${days}d ago`;
    if (hours >= 1) return `${hours}h ago`;
    return `${Math.max(1, minutes)}m ago`;
}

export function AgentSidebar({
    conversations,
    activeConversationId,
    onNewSession,
    onSelectConversation,
}: {
    conversations: Conversation[];
    activeConversationId: string | null;
    onNewSession: () => void;
    onSelectConversation: (id: string) => void;
}) {
    return (
        <aside className="flex h-full w-[220px] shrink-0 flex-col bg-panel">
            <div className="p-3">
                <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 w-full justify-center gap-1.5 font-normal"
                    onClick={onNewSession}
                >
                    <Icon name="add" size={14} />
                    New session
                </Button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-2 pb-3">
                <div className="mb-2 flex items-center justify-between px-1">
                    <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <Icon name="forum" size={14} />
                        <span>Sessions</span>
                    </div>
                    <button
                        type="button"
                        onClick={openChatHistoryMenu}
                        className="text-xs text-text-muted transition-colors hover:text-text-primary"
                    >
                        View all
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                    {conversations.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-text-muted">No sessions yet</div>
                    ) : (
                        <div className="flex flex-col gap-0.5">
                            {conversations.map((conv) => {
                                const active = conv.id === activeConversationId;
                                return (
                                    <button
                                        key={conv.id}
                                        type="button"
                                        onClick={() => onSelectConversation(conv.id)}
                                        className={cn(
                                            "flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                                            active
                                                ? "bg-panel-active text-text-primary"
                                                : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                                        )}
                                    >
                                        <span className="truncate text-sm">{conv.title}</span>
                                        <span className="text-2xs text-text-muted tabular-nums">
                                            {formatRelative(conv.timestamp)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}
