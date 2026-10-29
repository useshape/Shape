"use client";

import { useProjectState } from "@/lib/backend";
import { useWorkspaceMode } from "@/lib/ui/workspace-mode";
import { ChatOmnibox } from "./omnibox";

function isGenericChatTitle(title: string | null | undefined): boolean {
    const value = (title || "").trim().toLowerCase();
    return !value || value === "new chat" || value === "chat";
}

function latestRename(messages: { content?: string }[] | undefined): string | null {
    if (!messages) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
        const match = messages[i]?.content?.match(/<rename_chat>([^<]+)<\/rename_chat>/i);
        const title = match?.[1]?.trim();
        if (title) return title;
    }
    return null;
}

function firstPromptTitle(messages: { role?: string; content?: string }[] | undefined): string | null {
    const user = messages?.find((m) => m.role === "user")?.content || "";
    const line = user.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!line) return null;
    return line.length > 48 ? `${line.slice(0, 48).trimEnd()}…` : line;
}

export function resolveChatCrumbTitle(opts: {
    chatTitle: string;
    tabTitle?: string;
    convTitle?: string;
    messages?: { role?: string; content?: string }[];
}): string {
    const renamed = latestRename(opts.messages);
    const picks = [opts.chatTitle, renamed, opts.convTitle, opts.tabTitle, firstPromptTitle(opts.messages)];
    return picks.find((title) => !isGenericChatTitle(title))?.trim() || "New chat";
}

export function ChatTitlebar({
    title,
    actions = true,
}: {
    title: string;
    conversationId: string | null;
    recentIds: string[];
    timestamp?: number | null;
    onSelect?: (id: string) => void;
    subagentTitle?: string | null;
    subagentModel?: string | null;
    onCloseSubagent?: () => void;
    extractedSubagents?: { id: string; title: string }[];
    actions?: boolean;
}) {
    const mode = useWorkspaceMode();
    const { project_path } = useProjectState();
    if (mode !== "Code") {
        return (
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
                <span className="truncate text-sm text-text-secondary">{mode}</span>
            </div>
        );
    }
    return <ChatOmnibox title={title} projectPath={project_path} showActions={actions} />;
}
