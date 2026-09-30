"use client";

import { LayoutRowTwo20Regular } from "@fluentui/react-icons/headless/svg/layout-row-two";
import { People20Filled } from "@fluentui/react-icons/headless/svg/people";



import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";


import { Tooltip } from "@/components/ui/tooltip";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { getRepoName } from "@/lib/workspace/repo-history";
import { useProjectState } from "@/lib/backend";
import { AGENT_CHROME_ACTIONS_SLOT } from "@/features/agent/chrome";
import { CommitMenu } from "@/features/agent/workspace/commit-menu";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { providerIcon } from "@/lib/ui/provider-icon";
import {
    getSubagents,
    openSubagent,
    subscribeSubagents,
    type SubagentCard,
} from "@/features/agent/subagents/store";
import { cn } from "@/lib/utils";

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

function shortModelName(model?: string): string {
    const id = (model || "").trim();
    if (!id || id === "auto" || id.endsWith("/auto")) return "Auto";
    const leaf = id.split("/").pop() || id;
    if (/\s/.test(leaf)) return leaf;
    return leaf.replace(/[-_]+/g, " ");
}

function ModelMark({ model, pin = false }: { model?: string; pin?: boolean }) {
    return (
        <span className={cn("flex shrink-0 items-center gap-1 text-xs text-text-muted", pin && "ml-auto")}>
            {providerIcon(model || "auto", 12)}
            <span className="max-w-[7rem] truncate">{shortModelName(model)}</span>
        </span>
    );
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
    subagentModel,
    onCloseSubagent,
    extractedSubagents = [],
}: {
    title: string;
    conversationId: string | null;
    recentIds: string[];
    timestamp?: number | null;
    onSelect: (id: string) => void;
    subagentTitle?: string | null;
    subagentModel?: string | null;
    onCloseSubagent?: () => void;
    extractedSubagents?: SubagentCard[];
}) {
    const { project_path } = useProjectState();
    const repo = project_path ? getRepoName(project_path) : null;
    const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
    const [terminalOpen, setTerminalOpen] = useState(false);
    useSyncExternalStore(subscribeSubagents, getSubagents, getSubagents);
    const subagents = chatSubagents(conversationId, extractedSubagents);

    useEffect(() => {
        const find = () => {
            const el = document.getElementById(AGENT_CHROME_ACTIONS_SLOT);
            setActionsSlot(el && el.isConnected ? el : null);
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
            {project_path ? <CommitMenu projectPath={project_path} /> : null}
            <Tooltip content={terminalOpen ? "Hide terminal" : "Show terminal"}>
                <button
                    type="button"
                    aria-label={terminalOpen ? "Hide terminal" : "Show terminal"}
                    aria-pressed={terminalOpen}
                    onClick={toggleTerminal}
                    className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary data-[active=true]:text-text-primary"
                    data-active={terminalOpen}
                >
                    <Icon icon={LayoutRowTwo20Regular} />
                </button>
            </Tooltip>
        </div>
    );

    const chatCrumb = subagents.length > 0 ? (
        <li className="flex min-w-0 items-center">
            <DropdownMenu>
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
                        <span className="min-w-0 truncate">{title}</span>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-52">
                    <DropdownMenuItem
                        onClick={() => onCloseSubagent?.()}
                    >
                        {title}
                    </DropdownMenuItem>
                    {subagents.map((card) => (
                        <DropdownMenuItem
                            key={card.id}
                            onClick={() => openSubagent(card.id)}
                            className="gap-2"
                        >
                            <Icon icon={People20Filled} className="text-text-muted" />
                            <span className="min-w-0 flex-1 truncate">{card.title}</span>
                            <ModelMark model={card.model} pin />
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </li>
    ) : subagentTitle ? (
        <BreadcrumbItem onClick={() => onCloseSubagent?.()} className="min-w-0 truncate">
            {title}
        </BreadcrumbItem>
    ) : (
        <BreadcrumbItem current className="min-w-0 truncate">
            {title}
        </BreadcrumbItem>
    );

    return (
        <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden pl-1">
            <Breadcrumb className="w-auto min-w-0 max-w-full overflow-hidden" aria-label="Project">
                {repo ? (
                    <BreadcrumbItem onClick={() => window.dispatchEvent(new Event("shape-open-project-pick"))}>
                        {repo}
                    </BreadcrumbItem>
                ) : null}
                {chatCrumb}
                {subagentTitle ? (
                    <BreadcrumbItem current className="min-w-0 max-w-[24rem]">
                        <span className="flex min-w-0 items-center gap-1.5">
                            <Icon icon={People20Filled} className="shrink-0 text-text-muted" />
                            <span className="min-w-0 truncate">{subagentTitle}</span>
                            <ModelMark model={subagentModel || undefined} />
                        </span>
                    </BreadcrumbItem>
                ) : null}
            </Breadcrumb>
            <div className="h-full min-w-4 flex-1" />
            {actionsSlot && actionsSlot.isConnected ? createPortal(actions, actionsSlot) : null}
        </div>
    );
}
