"use client";

import { ArrowLeft20Regular } from "@fluentui/react-icons/headless/svg/arrow-left";
import { ArrowRight20Regular } from "@fluentui/react-icons/headless/svg/arrow-right";
import { Edit20Regular } from "@fluentui/react-icons/headless/svg/edit";
import { People20Filled } from "@fluentui/react-icons/headless/svg/people";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { useWorkspaceMode } from "@/lib/ui/workspace-mode";
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
import { NEW_CHAT_TAB_ID } from "@/features/chat/ui/shell/tabs";
import {
    chatNavBack,
    chatNavForward,
    ensureChatNav,
    getChatNav,
    subscribeChatNav,
} from "@/features/chat/lib/chat-nav";
import { cn } from "@/lib/utils";
import { ArrowLeft20Filled, ArrowRight20Filled, Search20Regular, Settings20Regular } from "@fluentui/react-icons";
import { useProjectState } from "@/lib/backend";
import { TerminalToggle } from "@/features/agent/chrome";

function Cluster({ children }: { children: ReactNode }) {
    return (
        <div className="inline-flex items-center p-1.5">
            {children}
        </div>
    );
}

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

function ModelMark({ model }: { model?: string }) {
    return (
        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-text-muted">
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

function NavButton({
    label,
    disabled,
    onClick,
    children,
}: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Tooltip content={label}>
            <button
                type="button"
                aria-label={label}
                disabled={disabled}
                onClick={onClick}
                className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary disabled:pointer-events-none disabled:text-text-disabled"
            >
                {children}
            </button>
        </Tooltip>
    );
}

export function ChatTitlebar({
    title,
    conversationId,
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
    subagentModel?: string | null;
    onCloseSubagent?: () => void;
    extractedSubagents?: SubagentCard[];
}) {
    const workspaceModeId = useWorkspaceMode();
    const code = workspaceModeId === "Code";
    const { project_path } = useProjectState();
    const project = project_path?.split(/[/\\]/).filter(Boolean).pop() || "shape";
    useSyncExternalStore(subscribeSubagents, getSubagents, getSubagents);
    const nav = useSyncExternalStore(subscribeChatNav, getChatNav, getChatNav);
    const subagents = chatSubagents(conversationId, extractedSubagents);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(title);
    const canRename = Boolean(conversationId && conversationId !== NEW_CHAT_TAB_ID);

    useEffect(() => {
        ensureChatNav();
    }, []);

    useEffect(() => {
        if (!editing) setDraft(title);
    }, [title, editing]);

    const commitRename = () => {
        const next = draft.trim();
        setEditing(false);
        if (!canRename || !next || next === title || !conversationId) return;
        window.dispatchEvent(
            new CustomEvent("shape-chat-rename", { detail: { id: conversationId, title: next } }),
        );
    };

    if (!code) {
        return (
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
                <span className="truncate text-sm text-text-secondary">{workspaceModeId}</span>
                {subagentTitle ? (
                    <span className="ml-2 truncate text-sm text-text-muted">{subagentTitle}</span>
                ) : null}
            </div>
        );
    }

    const name = subagents.length > 0 ? (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="min-w-0 truncate text-left text-sm text-text-primary hover:text-text-secondary"
                >
                    {title}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52">
                <DropdownMenuItem onClick={() => onCloseSubagent?.()}>{title}</DropdownMenuItem>
                {subagents.map((card) => (
                    <DropdownMenuItem
                        key={card.id}
                        onClick={() => openSubagent(card.id)}
                        className="gap-2"
                    >
                        <Icon icon={People20Filled} className="text-text-muted" />
                        <span className="min-w-0 flex-1 truncate">{card.title}</span>
                        <ModelMark model={card.model} />
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    ) : (
        <span className="min-w-0 truncate text-sm text-text-primary">{title}</span>
    );

    return (
        <div className="flex h-9 shrink-0 items-center gap-1 px-2 my-2">
            <Cluster>
                <NavButton label="Back" disabled={!nav.canBack} onClick={chatNavBack}>
                    <Icon icon={ArrowLeft20Filled} className="icon-md" />
                </NavButton>
                <NavButton label="Forward" disabled={!nav.canForward} onClick={chatNavForward}>
                    <Icon icon={ArrowRight20Filled} className="icon-md" />
                </NavButton>
            </Cluster>
            {editing ? (
                <input
                    autoFocus
                    value={draft}
                    aria-label="Chat name"
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            commitRename();
                        }
                        if (event.key === "Escape") {
                            event.preventDefault();
                            setDraft(title);
                            setEditing(false);
                        }
                    }}
                    className="h-7 min-w-0 max-w-64 rounded-md bg-surface-2 px-2 text-sm text-text-primary outline-none"
                />
            ) : (
                <Cluster>
                    <div className="flex min-w-0 items-center gap-1.5 px-2 text-sm">
                        <span className="shrink-0 truncate text-text-muted">{project}</span>
                        <span className="shrink-0 text-text-muted"></span>
                        <span
                            className="min-w-0 truncate text-text-primary"
                            onDoubleClick={() => {
                                if (!canRename) return;
                                setDraft(title);
                                setEditing(true);
                            }}
                        >
                            {subagentTitle ?? name}
                        </span>
                    </div>
                </Cluster>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-1">
                <Cluster>
                    <TerminalToggle />
                    <NavButton
                        label="Search"
                        onClick={() => window.dispatchEvent(new Event("shape-open-chat-search"))}
                    >
                        <Icon icon={Search20Regular} className="icon-md" />
                    </NavButton>
                    <NavButton
                        label="Settings"
                        onClick={() => window.dispatchEvent(new Event("shape-open-settings"))}
                    >
                        <Icon icon={Settings20Regular} className="icon-md" />
                    </NavButton>
                </Cluster>
            </div>
        </div>
    );
}
