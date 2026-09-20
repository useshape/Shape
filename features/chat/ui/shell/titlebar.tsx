"use client";

import { RiLayoutBottomLine } from "@remixicon/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { getRepoName } from "@/lib/workspace/repo-history";
import { useProjectState } from "@/lib/backend";
import { ProjectKindGlyph } from "@/features/detection/ui/kind-glyph";
import { AGENT_CHROME_ACTIONS_SLOT } from "@/features/agent/chrome";
import { ChatHistoryMenu } from "./history";
import { OpenInMenu } from "./open-in";
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
    onSelect: (id: string) => void;
    subagentTitle?: string | null;
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
            <OpenInMenu />
            <Tooltip content={terminalOpen ? "Hide terminal" : "Show terminal"}>
                <button
                    type="button"
                    aria-label={terminalOpen ? "Hide terminal" : "Show terminal"}
                    aria-pressed={terminalOpen}
                    onClick={toggleTerminal}
                    className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary data-[active=true]:text-text-primary"
                    data-active={terminalOpen}
                >
                    <Icon icon={RiLayoutBottomLine} />
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
                            {providerIcon(card.model || "auto", 14)}
                            <span className="min-w-0 flex-1 truncate">{card.title}</span>
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
        <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden">
            <div className="shrink-0 pr-1">
                <ChatHistoryMenu
                    activeConversationId={conversationId}
                    onSelectConversation={(id) => onSelect(id)}
                    projectPath={project_path}
                    align="start"
                />
            </div>
            <Breadcrumb className="w-auto min-w-0 max-w-full overflow-hidden" aria-label="Project">
                {repo ? (
                    <BreadcrumbItem onClick={() => window.dispatchEvent(new Event("shape-open-project-pick"))}>
                        <ProjectKindGlyph path={project_path} className="size-5" />
                        {repo}
                    </BreadcrumbItem>
                ) : null}
                {chatCrumb}
                {subagentTitle ? (
                    <BreadcrumbItem current className="min-w-0 truncate">
                        {subagentTitle}
                    </BreadcrumbItem>
                ) : null}
            </Breadcrumb>
            <div className="h-full min-w-4 flex-1" />
            {actionsSlot && actionsSlot.isConnected ? createPortal(actions, actionsSlot) : null}
        </div>
    );
}
