"use client";

import { useSyncExternalStore } from "react";
import { UserMessageCard } from "@/features/chat/ui/message/bubble";
import { MessageRenderer } from "@/features/chat/ui/md/renderer";
import {
    getActiveWorker,
    subscribeMultiwork,
} from "./session-store";

export function MultiworkWorkerView() {
    const worker = useSyncExternalStore(subscribeMultiwork, getActiveWorker, getActiveWorker);
    if (!worker) return null;

    const live = worker.status === "running" || worker.status === "pending";
    const task = worker.task?.trim() || worker.title;

    return (
        <div className="mx-auto flex min-h-full w-full min-w-0 flex-col gap-4 pb-16 pt-8">
            <UserMessageCard className="w-full max-w-none">
                {task}
            </UserMessageCard>
            <div className="min-w-0 chat-text text-text-primary">
                <MessageRenderer
                    content={worker.transcript || ""}
                    isGenerating={live}
                    skipSubagentSync
                    activityLabel={live ? worker.activity : undefined}
                />
            </div>
        </div>
    );
}
