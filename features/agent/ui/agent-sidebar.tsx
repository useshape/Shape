"use client";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/backend/types";
import { openChatHistoryMenu } from "@/features/chat/ui/shell/history";
import { useAgentLayout } from "@/features/agent/lib/agent-layout-context";
import { AnimatedSidebarIcon } from "@/features/activity-bar";
import { loginShape, useShapeAuth } from "@/lib/shape-auth/store";
import type { ShapeTier } from "@/lib/shape-auth/types";
import { ShapeAccountAvatar } from "@/features/workbench/titlebar/ui/account-avatar";

function formatRelative(timestamp: number) {
    const now = Date.now() / 1000;
    const diff = Math.max(0, now - timestamp);
    const minutes = Math.floor(diff / 60);
    const hours = Math.floor(diff / 3600);
    const days = Math.floor(diff / 86400);
    if (days >= 1) return `${days}d ago`;
    if (hours >= 1) return `${hours}h ago`;
    return `${Math.max(1, minutes)}m ago`;
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
            className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm font-medium text-text-secondary transition-[color,background-color] duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
        >
            <Icon name={icon} size={16} className="shrink-0 text-text-muted" />
            <span className="truncate">{label}</span>
        </button>
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
    const { sessionsOpen, toggleSessions, openAiSettings, closeAiSettings } = useAgentLayout();
    const auth = useShapeAuth();

    const displayName = auth.name?.trim() || auth.email?.trim() || "Account";
    const plan = tierLabel(auth.tier);

    return (
        <aside className="flex h-full w-full min-h-0 flex-col bg-panel">
            <div className="flex shrink-0 items-center px-2 pt-2">
                <button
                    type="button"
                    aria-label="Toggle Sessions"
                    aria-pressed={sessionsOpen}
                    title="Toggle Sessions"
                    onClick={toggleSessions}
                    className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-[color,background-color] duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary",
                        sessionsOpen && "text-text-primary",
                    )}
                >
                    <AnimatedSidebarIcon active={sessionsOpen} size={16} />
                </button>
            </div>

            <nav className="flex shrink-0 flex-col gap-0.5 px-2 pt-1">
                <SidebarNavItem
                    icon="add"
                    label="New Chat"
                    onClick={() => {
                        closeAiSettings();
                        onNewSession();
                    }}
                />
                <SidebarNavItem
                    icon="search"
                    label="Search"
                    onClick={openChatHistoryMenu}
                />
                <SidebarNavItem
                    icon="tune"
                    label="Customize"
                    onClick={openAiSettings}
                />
            </nav>

            <div className="mt-3 flex min-h-0 flex-1 flex-col px-2 pb-2">
                <div className="mb-1 px-2 text-xs text-text-muted">Sessions</div>

                <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                    {conversations.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-text-muted">No sessions yet</div>
                    ) : (
                        <div className="flex flex-col gap-0.5">
                            {conversations.map((conv) => {
                                const active = conv.id === activeConversationId;
                                return (
                                    <button
                                        key={conv.id}
                                        type="button"
                                        onClick={() => {
                                            closeAiSettings();
                                            onSelectConversation(conv.id);
                                        }}
                                        className={cn(
                                            "flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-[color,background-color] duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                                            active
                                                ? "bg-panel-active text-text-primary"
                                                : "text-text-secondary hover:bg-panel-hover hover:text-text-primary",
                                        )}
                                    >
                                        <span className="truncate text-sm">{conv.title}</span>
                                        <span className="text-2xs tabular-nums text-text-muted">
                                            {formatRelative(conv.timestamp)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="shrink-0 px-2 pb-2 pt-1">
                {auth.loggedIn ? (
                    <div className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
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
                            <div className="truncate text-2xs text-text-muted">{plan}</div>
                        </div>
                        <button
                            type="button"
                            aria-label="AI settings"
                            title="AI settings"
                            onClick={openAiSettings}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-[color,background-color] duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
                        >
                            <Icon name="settings" size={16} />
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => void loginShape()}
                        className="flex w-full items-center justify-center rounded-md px-2 py-2 text-sm text-text-secondary transition-[color,background-color] duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
                    >
                        Sign in
                    </button>
                )}
            </div>
        </aside>
    );
}
