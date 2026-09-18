"use client";

import { useSyncExternalStore } from "react";
import { UserMessageCard } from "@/features/chat/ui/message/bubble";
import { MessageRenderer } from "@/features/chat/ui/md/renderer";
import {
    getActiveSubagent,
    subagentWorkflowContent,
    subscribeSubagents,
} from "./store";

export function SubagentChatView() {
    const card = useSyncExternalStore(subscribeSubagents, getActiveSubagent, getActiveSubagent);
    if (!card) return null;

    const live = card.status === "running" || card.status === "pending";
    const task = card.task?.trim() || card.title;
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
