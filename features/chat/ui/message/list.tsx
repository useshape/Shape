"use client";

import type { RefObject, ReactNode } from "react";
import { ChatMessageItem } from "./item";
import { ChatErrorCard } from "../blocks/error";
import type { ChatMessage } from "@/lib/backend";

export function ChatMessageList({
    messageGroups,
    messages,
    isLoading,
    activityLabel,
    sendError,
    onDismissError,
    messagesEndRef,
    onRedo,
    onRestore,
    isFileEditResolved,
    emptyState,
}: {
    messageGroups: { msg: ChatMessage; msgIdx: number }[][];
    messages: ChatMessage[];
    isLoading: boolean;
    activityLabel: string | null;
    sendError: string | null;
    onDismissError: () => void;
    messagesEndRef: RefObject<HTMLDivElement | null>;
    onRedo: (msgIdx: number) => void;
    onRestore: (msgIdx: number) => void;
    isFileEditResolved: (file: string, replacement?: string) => boolean;
    emptyState?: ReactNode;
    activeChatTabId?: string;
}) {
    return (
        <>
            {messages.length === 0 ? (
                <div className="flex min-h-full w-full flex-col">
                    {emptyState ?? null}
                </div>
            ) : (
                <>
                    {messageGroups.map((group, groupIdx) => (
                    <div
                        key={`turn-${group[0]?.msg.timestamp ?? groupIdx}`}
                        className="relative mb-4 flex flex-col first:mt-2"
                    >
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
                                        isFileEditResolved={isFileEditResolved}
                                    />
                                </div>
                            );
                        })}
                    </div>
                ))}
                </>
            )}
            {sendError ? (
                <div className="mb-4 px-2">
                    <ChatErrorCard message={sendError} onDismiss={onDismissError} />
                </div>
            ) : null}
            <div ref={messagesEndRef} />
        </>
    );
}
