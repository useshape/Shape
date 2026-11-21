"use client";

import { PanelBottom20Filled } from "@fluentui/react-icons/headless/svg/panel-bottom";



import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";


import { Tooltip } from "@/components/ui/tooltip";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { getRepoName } from "@/lib/workspace/repo-history";
import { useProjectState } from "@/lib/backend";
import { AGENT_CHROME_ACTIONS_SLOT, AGENT_TABS_SLOT } from "@/features/agent/chrome";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
    getSubagents,
    openSubagent,
    subscribeSubagents,
    upsertSubagent,
    type SubagentCard,
} from "@/features/agent/subagents/store";
import { ThreadReplies } from "@/features/agent/sidebar/chats";
import { cn } from "@/lib/utils";
import { RevealName } from "@/components/ui/reveal-name";

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
    const line = user
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
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

function chatSubagents(parentId: string | null, extra: SubagentCard[]): SubagentCard[] {
    const live = getSubagents();
    const map = new Map<string, SubagentCard>();
    for (const card of live) {
        if (!parentId || !card.parentId || card.parentId === parentId) {
            map.set(card.id, card);
        }
    }
    for (const card of extra) {
        if (!map.has(card.id)) map.set(card.id, card);
    }
    return [...map.values()];
}

export function ChatTitlebar({
    title,
    conversationId,
    onSelect,
    subagentTitle,
    onCloseSubagent,
    extractedSubagents = [],
}: {
    title: string;
    conversationId: string | null;
    recentIds: string[];
    timestamp?: number | null;
    onSelect?: (id: string) => void;
    subagentTitle?: string | null;
    onCloseSubagent?: () => void;
    extractedSubagents?: SubagentCard[];
}) {
    const { project_path } = useProjectState();
    const repo = project_path ? getRepoName(project_path) : null;
    const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
    const [tabsSlot, setTabsSlot] = useState<HTMLElement | null>(null);
    const [terminalOpen, setTerminalOpen] = useState(false);
    const [threadMenuOpen, setThreadMenuOpen] = useState(false);
    useSyncExternalStore(subscribeSubagents, getSubagents, getSubagents);
    const subagents = chatSubagents(conversationId, extractedSubagents);

    useEffect(() => {
        const find = () => {
            const actions = document.getElementById(AGENT_CHROME_ACTIONS_SLOT);
            const tabs = document.getElementById(AGENT_TABS_SLOT);
            setActionsSlot(actions && actions.isConnected ? actions : null);
            setTabsSlot(tabs && tabs.isConnected ? tabs : null);
        };
        find();
        const timer = window.setInterval(find, 200);
        const stop = window.setTimeout(() => window.clearInterval(timer), 4000);
        return () => {
            window.clearInterval(timer);
            window.clearTimeout(stop);
        };
    }, []);

    useEffect(() => {
        try {
            setTerminalOpen(localStorage.getItem("shape-agent-terminal-open") === "true");
        } catch {
            /* ignore */
        }
        const onOpen = (e: Event) => {
            const open = (e as CustomEvent<{ open?: boolean }>).detail?.open;
            if (typeof open === "boolean") setTerminalOpen(open);
        };
        window.addEventListener("shape-terminal-open", onOpen as EventListener);
        return () => window.removeEventListener("shape-terminal-open", onOpen as EventListener);
    }, []);

    const toggleTerminal = () => {
        window.dispatchEvent(
            new CustomEvent("shape-layout-toggle", {
                detail: { id: "terminal", value: !terminalOpen },
            }),
        );
    };

    const actions = (
        <div className="flex items-center gap-2">
            <Tooltip content={terminalOpen ? "Hide terminal" : "Show terminal"}>
                <button
                    type="button"
                    aria-label={terminalOpen ? "Hide terminal" : "Show terminal"}
                    aria-pressed={terminalOpen}
                    onClick={toggleTerminal}
                    className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary data-[active=true]:text-text-primary"
                    data-active={terminalOpen}
                >
                    <Icon icon={PanelBottom20Filled} />
                </button>
            </Tooltip>
        </div>
    );

    const openListedThread = (card: SubagentCard) => {
        const parent = card.parentId || conversationId || undefined;
        upsertSubagent({
            id: card.id,
            title: card.title,
            activity: card.activity || card.task || "Done",
            status: card.status,
            parentId: parent,
            task: card.task,
            model: card.model,
            transcript: card.transcript,
        });
        openSubagent(card.id);
        window.dispatchEvent(new CustomEvent("shape-open-subagent", {
            detail: { id: card.id, parentId: parent },
        }));
        setThreadMenuOpen(false);
    };

    const chatCrumb = subagents.length > 0 ? (
        <li className="flex min-w-0 items-center">
            <DropdownMenu open={threadMenuOpen} onOpenChange={setThreadMenuOpen}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            "-mx-1 flex min-w-0 max-w-[220px] items-center gap-0.5 rounded-md px-1 py-0.5 text-left text-sm whitespace-nowrap",
                            subagentTitle
                                ? "text-text-tertiary hover:bg-background-primary-hover hover:text-text-secondary"
                                : "text-text-secondary",
                        )}
                    >
                        <RevealName text={title} className="min-w-0 truncate" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 overflow-visible p-1.5">
                    <button
                        type="button"
                        className="relative z-10 flex h-8 w-full items-center rounded-md bg-sidebar px-2 text-left text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                        onClick={() => {
                            onCloseSubagent?.();
                            setThreadMenuOpen(false);
                        }}
                    >
                        <span className="min-w-0 flex-1 truncate">{title}</span>
                    </button>
                    <ThreadReplies
                        cards={subagents}
                        color={null}
                        onOpen={(id) => {
                            const card = subagents.find((item) => item.id === id);
                            if (card) openListedThread(card);
                        }}
                    />
                </DropdownMenuContent>
            </DropdownMenu>
        </li>
    ) : subagentTitle ? (
        <BreadcrumbItem onClick={() => onCloseSubagent?.()} className="min-w-0 truncate">
            <RevealName text={title} />
        </BreadcrumbItem>
    ) : (
        <BreadcrumbItem current className="min-w-0 truncate">
            <RevealName text={title} />
        </BreadcrumbItem>
    );

    const crumb = (
        <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden">
            <div className="min-w-0 shrink-0" data-no-drag>
                <Breadcrumb className="w-auto min-w-0 max-w-full overflow-hidden" aria-label="Project">
                    {repo ? (
                        <BreadcrumbItem onClick={() => window.dispatchEvent(new Event("shape-open-project-pick"))}>
                            {repo}
                        </BreadcrumbItem>
                    ) : null}
                    {chatCrumb}
                    {subagentTitle ? (
                        <BreadcrumbItem current className="min-w-0 max-w-[24rem]">
                            <RevealName text={subagentTitle} appear className="min-w-0 truncate" />
                        </BreadcrumbItem>
                    ) : null}
                </Breadcrumb>
            </div>
            <div className="h-full min-w-4 flex-1" data-tauri-drag-region />
            {actionsSlot && actionsSlot.isConnected ? createPortal(actions, actionsSlot) : null}
        </div>
    );

    if (!tabsSlot || !tabsSlot.isConnected) return null;
    return createPortal(crumb, tabsSlot);
}
