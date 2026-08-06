"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { SidebarPanelActionButton } from "@/features/panels";
import { commands } from "@/lib/backend";
import type { Conversation } from "@/lib/backend/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export const CHAT_HISTORY_OPEN_EVENT = "shape-chat-open-history";

function formatConversationDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

export function openChatHistoryMenu() {
    window.dispatchEvent(
        new CustomEvent("shape-command-palette", {
            detail: {
                filter: "agents",
                placeholder: "Search agents, files, actions...",
            },
        }),
    );
}

export function ChatHistoryMenu({
    activeConversationId,
    onSelectConversation,
    projectPath,
    align = "end",
    variant = "icon",
    tooltip = "Chat History",
    triggerClassName,
}: {
    activeConversationId?: string | null;
    onSelectConversation?: (id: string, conversation?: Conversation) => void;
    projectPath?: string | null;
    align?: "start" | "center" | "end";
    variant?: "icon" | "text";
    tooltip?: string;
    triggerClassName?: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(false);

    const loadConversations = useCallback(async () => {
        setLoading(true);
        try {
            const convs = await commands.getConversations(projectPath ?? undefined);
            setConversations(convs);
        } catch {
            setConversations([]);
        } finally {
            setLoading(false);
        }
    }, [projectPath]);

    useEffect(() => {
        if (!open) return;
        void loadConversations();
        setQuery("");
    }, [open, loadConversations]);

    useEffect(() => {
        const handleOpen = () => setOpen(true);
        window.addEventListener(CHAT_HISTORY_OPEN_EVENT, handleOpen);
        return () => window.removeEventListener(CHAT_HISTORY_OPEN_EVENT, handleOpen);
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return conversations;
        return conversations.filter((conv) => conv.title.toLowerCase().includes(q));
    }, [conversations, query]);

    const handleSelect = useCallback(
        async (conversation: Conversation) => {
            setOpen(false);
            if (onSelectConversation) {
                onSelectConversation(conversation.id, conversation);
                return;
            }
            await commands.loadConversation(
                conversation.id,
                conversation.project_path ?? projectPath ?? undefined,
            );
            window.dispatchEvent(new CustomEvent("shape-chat-refresh"));
        },
        [onSelectConversation, projectPath],
    );

    const handleDelete = useCallback(async (conversationId: string) => {
        await commands.deleteConversation(conversationId);
        setConversations((prev) => prev.filter((conv) => conv.id !== conversationId));
        window.dispatchEvent(new CustomEvent("shape-chat-refresh"));
    }, []);

    const trigger =
        variant === "text" ? (
            <Button
                variant="ghost"
                size="sm"
                className={cn("h-7 px-sm font-normal", triggerClassName)}
            >
                History
            </Button>
        ) : (
            <SidebarPanelActionButton className="h-6 w-6" aria-label={tooltip}>
                <Icon name="history" size={14} />
            </SidebarPanelActionButton>
        );

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <Tooltip content={tooltip}>
                <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align={align} className="w-72 overflow-hidden p-0">
                <div>
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search history..."
                        onKeyDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-surface-1 h-10! rounded-xl"
                    />
                </div>
                <div className="max-h-[320px] overflow-y-auto custom-scrollbar p-1">
                    {loading ? (
                        <div className="px-2 py-3 text-sm text-text-muted">Loading...</div>
                    ) : filtered.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-text-muted">
                            {query.trim() ? "No matching conversations" : "No conversations yet"}
                        </div>
                    ) : (
                        filtered.map((conversation) => {
                            const active = conversation.id === activeConversationId;
                            return (
                                <DropdownMenuItem
                                    key={conversation.id}
                                    className="group gap-2 pr-1"
                                    onSelect={() => void handleSelect(conversation)}
                                >
                                    <span
                                        className={cn(
                                            "min-w-0 flex-1 truncate",
                                            active && "font-medium text-text-primary",
                                        )}
                                    >
                                        {conversation.title}
                                    </span>
                                    <span className="shrink-0 text-xs text-text-muted tabular-nums">
                                        {formatConversationDate(conversation.timestamp)}
                                    </span>
                                    <button
                                        type="button"
                                        className="invisible flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary group-hover:visible"
                                        aria-label={`Delete ${conversation.title}`}
                                        onPointerDown={(e) => e.preventDefault()}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            void handleDelete(conversation.id);
                                        }}
                                    >
                                        <Icon name="delete" size={14} />
                                    </button>
                                </DropdownMenuItem>
                            );
                        })
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
