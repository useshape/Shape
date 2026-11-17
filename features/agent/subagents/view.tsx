"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { commands, type ChatMessage } from "@/lib/backend";
import { groupChatMessages } from "@/features/chat/lib/chat-session-utils";
import { ChatMessageList } from "@/features/chat/ui/message/list";
import { MessageRenderer } from "@/features/chat/ui/md/renderer";
import { GeneratingIndicator } from "@/features/chat/ui/blocks/generating";
import {
    getActiveSubagent,
    subagentDisplayTitle,
    subagentWorkflowContent,
    subscribeSubagents,
} from "./store";

export function SubagentChatView() {
    const card = useSyncExternalStore(subscribeSubagents, getActiveSubagent, getActiveSubagent);
    const endRef = useRef<HTMLDivElement>(null);
    const [history, setHistory] = useState<ChatMessage[] | null>(null);

    useEffect(() => {
        if (!card?.id) {
            setHistory(null);
            return;
        }
        let cancelled = false;
        void commands.getConversation(card.id).then((conv) => {
            if (!cancelled) setHistory(conv.history ?? []);
        }).catch(() => {
            if (!cancelled) setHistory(null);
        });
        return () => {
            cancelled = true;
        };
    }, [card?.id, card?.status, card?.updatedAt]);

    const messages = useMemo(() => {
        const visible = (history ?? []).filter((message) => !message.hidden);
        const firstUser = visible.findIndex((message) => message.role === "user");
        if (firstUser < 0) return visible;
        return visible.filter((_, index) => index !== firstUser);
    }, [history]);
    const groups = useMemo(() => groupChatMessages(messages), [messages]);

    if (!card) return null;

    if (messages.length > 0) {
        return (
            <ChatMessageList
                messageGroups={groups}
                messages={messages}
                isLoading={card.status === "running" || card.status === "pending"}
                activityLabel={card.status === "running" ? card.activity : null}
                messagesEndRef={endRef}
                onRedo={() => {}}
                onRestore={() => {}}
                isFileEditResolved={() => true}
            />
        );
    }

    const live = card.status === "running" || card.status === "pending";
    const workflow = subagentWorkflowContent(card);

    return (
        <div className="mx-auto flex min-h-full w-full min-w-0 max-w-4xl flex-col gap-3 pb-16 pt-8">
            <p className="text-sm text-text-muted">{subagentDisplayTitle(card)}</p>
            {live && !workflow ? <GeneratingIndicator label={card.activity || "Working"} /> : null}
            {workflow ? (
                <div className="min-w-0 chat-text text-text-primary">
                    <MessageRenderer
                        content={workflow}
                        isGenerating={live}
                        skipSubagentSync
                        activityLabel={live ? card.activity : undefined}
                    />
                </div>
            ) : null}
        </div>
    );
}
