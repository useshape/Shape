"use client";

import { Icon } from "@/components/ui/icon";
import { ShapeLogo } from "@/components/ui/shape-logo";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/backend/types";
import { openChatHistoryMenu } from "@/features/chat/ui/shell/history";
import { useAgentLayout } from "@/features/agent/lib/agent-layout-context";
import { usePinnedWorkspaces } from "@/features/agent/lib/pinned-workspaces";
import { loginShape, useShapeAuth } from "@/lib/shape-auth/store";
import type { ShapeTier } from "@/lib/shape-auth/types";
import { ShapeAccountAvatar } from "@/features/workbench/titlebar/ui/account-avatar";
import { useMemo, type ReactNode } from "react";

function formatRelative(timestamp: number) {
    const now = Date.now() / 1000;
    const diff = Math.max(0, now - timestamp);
    const minutes = Math.floor(diff / 60);
    const hours = Math.floor(diff / 3600);
    const days = Math.floor(diff / 86400);
    if (days >= 1) return `${days}d`;
    if (hours >= 1) return `${hours}h`;
    return `${Math.max(1, minutes)}m`;
}

function tierLabel(tier: ShapeTier): string {
    switch (tier) {
        case "plus":
            return "Plus";
        case "pro":
            return "Pro";
        case "max":
            return "Max";
        case "team":
            return "Team";
        default:
            return "Free";
    }
}

function SidebarNavItem({
    icon,
    label,
    onClick,
}: {
    icon: string;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-text-secondary transition-[color,background-color] duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
        >
            <Icon name={icon} size={15} className="shrink-0 text-text-muted" />
            <span className="truncate">{label}</span>
        </button>
    );
}

function WorkspaceRow({
    conversation,
    active,
    pinned,
    onSelect,
    onTogglePin,
}: {
    conversation: Conversation;
    active: boolean;
    pinned: boolean;
    onSelect: () => void;
    onTogglePin: () => void;
}) {
    return (
        <div
            className={cn(
                "group relative flex w-full items-center gap-1 rounded-sm transition-[color,background-color] duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                active
                    ? "bg-panel-active text-text-primary"
                    : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
            )}
        >
            {active ? (
                <span
                    aria-hidden
                    className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-success"
                />
            ) : null}
            <button
                type="button"
                onClick={onSelect}
                className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2.5 pr-1 text-left"
            >
                <span className="min-w-0 flex-1 truncate text-sm">{conversation.title}</span>
                <span className="shrink-0 text-2xs tabular-nums text-text-muted">
                    {formatRelative(conversation.timestamp)}
                </span>
            </button>
            <button
                type="button"
                aria-label={pinned ? "Unpin workspace" : "Pin workspace"}
                title={pinned ? "Unpin" : "Pin"}
                onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin();
                }}
                className={cn(
                    "mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-text-muted transition-[color,background-color,opacity] duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-active hover:text-text-primary",
                    pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
            >
                <Icon name="push_pin" size={12} />
            </button>
        </div>
    );
}

function SectionLabel({ children }: { children: ReactNode }) {
    return (
        <div className="mb-1 px-2.5 text-2xs font-medium text-text-muted">
            {children}
        </div>
    );
}

export function AgentSidebar({
    conversations,
    activeConversationId,
    onNewSession,
    onSelectConversation,
}: {
    conversations: Conversation[];
    activeConversationId: string | null;
    onNewSession: () => void;
    onSelectConversation: (id: string) => void;
}) {
    const { closeAiSettings, openAiSettings } = useAgentLayout();
    const auth = useShapeAuth();
    const { pinned, togglePin } = usePinnedWorkspaces();

    const displayName = auth.name?.trim() || auth.email?.trim() || "Account";
    const plan = tierLabel(auth.tier);

    const { pinnedList, workspaceList } = useMemo(() => {
        const pinnedConvs: Conversation[] = [];
        const rest: Conversation[] = [];
        for (const conv of conversations) {
            if (pinned.has(conv.id)) pinnedConvs.push(conv);
            else rest.push(conv);
        }
        return { pinnedList: pinnedConvs, workspaceList: rest };
    }, [conversations, pinned]);

    const select = (id: string) => {
        closeAiSettings();
        onSelectConversation(id);
    };

    return (
        <aside className="flex h-full w-full min-h-0 flex-col bg-panel">
            <div className="relative z-20 flex h-titlebar shrink-0 items-stretch">
                <div className="titlebar-drag-region absolute inset-0 z-0" data-tauri-drag-region />
                <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2 px-3">
                    <ShapeLogo size={16} className="logo-invert opacity-90" />
                    <span className="truncate text-sm font-medium tracking-tight text-text-primary">
                        Shape
                    </span>
                </div>
            </div>

            <nav className="flex shrink-0 flex-col gap-0.5 px-2 pt-2">
                <SidebarNavItem
                    icon="home"
                    label="Home"
                    onClick={() => {
                        closeAiSettings();
                    }}
                />
                <SidebarNavItem
                    icon="add"
                    label="Create"
                    onClick={() => {
                        closeAiSettings();
                        onNewSession();
                    }}
                />
                <SidebarNavItem icon="search" label="Search" onClick={openChatHistoryMenu} />
            </nav>

            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 px-1.5 pb-2">
                {pinnedList.length > 0 ? (
                    <div className="shrink-0">
                        <SectionLabel>Pinned</SectionLabel>
                        <div className="flex flex-col gap-px">
                            {pinnedList.map((conv) => (
                                <WorkspaceRow
                                    key={conv.id}
                                    conversation={conv}
                                    active={conv.id === activeConversationId}
                                    pinned
                                    onSelect={() => select(conv.id)}
                                    onTogglePin={() => togglePin(conv.id)}
                                />
                            ))}
                        </div>
                    </div>
                ) : null}

                <div className="flex min-h-0 flex-1 flex-col">
                    <SectionLabel>My workspaces</SectionLabel>
                    <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                        {conversations.length === 0 ? (
                            <div className="px-2.5 py-3 text-xs text-text-muted">
                                No workspaces yet
                            </div>
                        ) : workspaceList.length === 0 && pinnedList.length > 0 ? (
                            <div className="px-2.5 py-2 text-xs text-text-muted">
                                All workspaces are pinned
                            </div>
                        ) : (
                            <div className="flex flex-col gap-px">
                                {workspaceList.map((conv) => (
                                    <WorkspaceRow
                                        key={conv.id}
                                        conversation={conv}
                                        active={conv.id === activeConversationId}
                                        pinned={false}
                                        onSelect={() => select(conv.id)}
                                        onTogglePin={() => togglePin(conv.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="shrink-0 border-t border-border px-2 py-2">
                {auth.loggedIn ? (
                    <div className="flex items-center gap-2 rounded-sm px-1.5 py-1.5">
                        <ShapeAccountAvatar
                            userId={auth.userId}
                            name={auth.name}
                            email={auth.email}
                            offline={Boolean(auth.offline)}
                            size={28}
                            className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-text-primary">{displayName}</div>
                            <div className="truncate text-2xs font-medium text-text-muted">
                                {plan}
                            </div>
                        </div>
                        <button
                            type="button"
                            aria-label="AI settings"
                            title="AI settings"
                            onClick={openAiSettings}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-muted transition-[color,background-color] duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
                        >
                            <Icon name="settings" size={16} />
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => void loginShape()}
                        className="flex w-full items-center justify-center rounded-sm px-2 py-2 text-sm text-text-secondary transition-[color,background-color] duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
                    >
                        Sign in
                    </button>
                )}
            </div>
        </aside>
    );
}
