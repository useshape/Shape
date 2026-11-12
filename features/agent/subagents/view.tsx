"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { commands, type ChatMessage } from "@/lib/backend";
import { groupChatMessages } from "@/features/chat/lib/chat-session-utils";
import { ChatMessageList } from "@/features/chat/ui/message/list";
import { UserMessageCard } from "@/features/chat/ui/message/bubble";
import { MessageRenderer } from "@/features/chat/ui/md/renderer";
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

    const messages = useMemo(
        () => (history ?? []).filter((message) => !message.hidden),
        [history],
    );
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
    const task = card.task?.trim() || subagentDisplayTitle(card);
    const workflow = subagentWorkflowContent(card);

    return (
        <div className="mx-auto flex min-h-full w-full min-w-0 max-w-4xl flex-col gap-4 pb-16 pt-8">
            <UserMessageCard className="w-full max-w-none">
                {task}
            </UserMessageCard>
            <div className="min-w-0 chat-text text-text-primary">
                <MessageRenderer
                    content={workflow}
                    isGenerating={live}
                    skipSubagentSync
                    activityLabel={live ? card.activity : undefined}
                />
            </div>
        </div>
    );
}
