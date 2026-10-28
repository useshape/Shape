"use client";

import type { RefObject, ReactNode } from "react";
import { ChatMessageItem } from "./item";
import type { ChatMessage } from "@/lib/backend";
import { toTimestampMs } from "@/lib/ui/timestamp";

function dayKey(timestamp: number): string {
    const d = new Date(toTimestampMs(timestamp));
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(timestamp: number): string {
    const d = new Date(toTimestampMs(timestamp));
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (today.getTime() - then.getTime()) / 86_400_000;
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function ChatMessageList({
    messageGroups,
    messages,
    isLoading,
    activityLabel,
    messagesEndRef,
    onRedo,
    onRestore,
    onFork,
    isFileEditResolved,
    emptyState,
    fullWidthBubbles,
    surface = "code",
    talkMark = null,
    talkName = "Shape",
}: {
    messageGroups: { msg: ChatMessage; msgIdx: number }[][];
    messages: ChatMessage[];
    isLoading: boolean;
    activityLabel: string | null;
    messagesEndRef: RefObject<HTMLDivElement | null>;
    onRedo: (msgIdx: number) => void;
    onRestore: (msgIdx: number) => void;
    onFork?: (msgIdx: number) => void;
    isFileEditResolved: (file: string, replacement?: string) => boolean;
    emptyState?: ReactNode;
    activeChatTabId?: string;
    /** @deprecated sticky removed */
    stickyTurnIndex?: number;
    fullWidthBubbles?: boolean;
    surface?: "code" | "talk";
    talkMark?: { shape: "circle" | "square" | "triangle" | "cloud"; color: string } | null;
    talkName?: string;
}) {
    return (
        <>
            {messages.length === 0 ? (
                <div className="flex min-h-full w-full flex-1 flex-col items-center justify-center">
                    {emptyState ?? null}
                </div>
            ) : (
                <>
                    {messageGroups.map((group, groupIdx) => {
                        const stamp = group[0]?.msg.timestamp ?? 0;
                        const prevStamp = messageGroups[groupIdx - 1]?.[0]?.msg.timestamp ?? 0;
                        const showDay = groupIdx === 0 || dayKey(stamp) !== dayKey(prevStamp);
                        return (
                        <div
                            key={`turn-${group[0]?.msg.timestamp ?? groupIdx}`}
                            data-chat-turn={groupIdx}
                            className="relative mb-3 flex flex-col gap-2 first:mt-2 last:mb-10 scroll-mt-4 overflow-visible"
                        >
                            {showDay && stamp > 0 ? (
                                <div className="flex justify-center py-2">
                                    <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-xs text-text-muted">
                                        {dayLabel(stamp)}
                                    </span>
                                </div>
                            ) : null}
                            {group.map(({ msg, msgIdx }) => {
                                const isGen =
                                    isLoading
                                    && msg.role === "assistant"
                                    && msgIdx === messages.length - 1;
                                return (
                                    <div
                                        key={`${msg.role}-${msg.timestamp}-${msgIdx}`}
                                        data-chat-message-index={msgIdx}
                                        className="rounded-lg transition-colors duration-[var(--transition-fast)]"
                                    >
                                        <ChatMessageItem
                                            role={msg.role}
                                            content={msg.content}
                                            timestamp={msg.timestamp}
                                            stats={msg.stats}
                                            model={msg.model}
                                            isGenerating={isGen}
                                            activityLabel={isGen ? activityLabel : null}
                                            index={msgIdx}
                                            onRedo={onRedo}
                                            onRestore={onRestore}
                                            onFork={onFork}
                                            isFileEditResolved={isFileEditResolved}
                                            fullWidthBubbles={fullWidthBubbles}
                                            surface={surface}
                                            talkMark={talkMark}
                                            talkName={talkName}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        );
                    })}
                </>
            )}
            <div ref={messagesEndRef} className="h-28 shrink-0" aria-hidden />
        </>
    );
}
