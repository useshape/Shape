import React from "react";
import type { Conversation } from "@/lib/backend/types";

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

export function ChatWelcome({
    recentConvs,
    onLoadConversation,
    onViewAll
}: {
    recentConvs: Conversation[];
    onLoadConversation: (id: string) => void;
    onViewAll: () => void;
}) {
    return (
        <div className="flex flex-col flex-1 px-4 pb-1">
            <div className="flex-1" />
            <div className="pb-1 flex flex-col gap-3">
                <div className="flex items-center justify-between text-md text-text-disabled">
                    <span className="font-regular">Recent</span>
                    <button
                        onClick={onViewAll}
                        className="text-text-muted hover:text-text-primary transition-colors"
                    >
                        View All <span className="ml-2 text-md text-text-disabled">Ctrl-Shift-H</span>
                    </button>
                </div>
                <div className="flex flex-col">
                    {recentConvs.length === 0 ? (
                        <div className="py-3 text-sm text-text-muted">
                            No recent chats
                        </div>
                    ) : (
                        recentConvs.map((conv) => (
                            <button
                                key={conv.id}
                                onClick={() => onLoadConversation(conv.id)}
                                className="flex items-center justify-between w-full py-2 rounded-md transition-colors gap-3"
                            >
                                <span className="text-sm text-text-secondary truncate min-w-0 hover:text-text-primary">{conv.title}</span>
                                <span className="text-xs text-text-muted shrink-0 tabular-nums">{formatRelative(conv.timestamp)}</span>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

