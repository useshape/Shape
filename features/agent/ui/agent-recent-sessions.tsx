"use client";

import type { Conversation } from "@/lib/backend/types";
import { openChatHistoryMenu } from "@/features/chat/ui/shell/history";

const formatRelative = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = Math.max(0, now - timestamp);
    const minutes = Math.floor(diff / 60);
    const hours = Math.floor(diff / 3600);
    const days = Math.floor(diff / 86400);
    if (days >= 1) return `${days}d`;
    if (hours >= 1) return `${hours}h`;
    return `${Math.max(1, minutes)}m`;
};

export function AgentRecentSessions({
    conversations,
    onSelectConversation,
}: {
    conversations: Conversation[];
    onSelectConversation: (id: string) => void;
}) {
    return (
        <div className="flex w-full flex-col gap-3">
            <div className="flex items-center justify-between text-sm text-text-muted">
                <span>Recent sessions</span>
                <button
                    type="button"
                    onClick={openChatHistoryMenu}
                    className="text-text-secondary transition-colors hover:text-text-primary"
                >
                    View all
                </button>
            </div>
            <div className="flex flex-col gap-1">
                {conversations.length === 0 ? (
                    <div className="py-2 text-sm text-text-muted">No recent chats</div>
                ) : (
                    conversations.map((conv) => (
                        <button
                            key={conv.id}
                            type="button"
                            onClick={() => onSelectConversation(conv.id)}
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border-subtle p-2 text-left transition-colors hover:bg-panel-hover"
                        >
                            <span className="min-w-0 truncate text-sm text-text-secondary hover:text-text-primary">
                                {conv.title}
                            </span>
                            <span className="shrink-0 text-sm text-text-muted tabular-nums">
                                {formatRelative(conv.timestamp)}
                            </span>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
