"use client";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { loginGitHub, useGitHubAuth } from "@/lib/github-auth/store";
import { openSettingsWindow } from "@/lib/open-settings";
import { openGitWindow } from "@/lib/open-git-window";
import { RepoList } from "./repos";
import { AccountRow } from "./account";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { SidebarToggleBtn, AGENT_SIDEBAR_BACK_SLOT } from "../chrome";
import type { AgentOverlay } from "../overlay";
import {
    notificationStore,
    useNotifications,
    useUnreadNotificationCount,
} from "@/features/notifications";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";

export const AGENT_SIDEBAR_NAV_SLOT = "shape-agent-sidebar-nav";

/** Fixed header height so overlay / design / normal modes don't shift the rail. */
const HEADER_CLASS = "flex h-10 shrink-0 items-center gap-0.5";

function SidebarNotificationsCollapsed() {
    const { notifications } = useNotifications();
    const unreadCount = useUnreadNotificationCount();

    return (
        <DropdownMenu
            onOpenChange={(open) => {
                if (open) notificationStore.markViewed();
            }}
        >
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Notifications"
                    className="relative flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
                >
                    <Icon name="notifications" size={18} />
                    {unreadCount > 0 ? (
                        <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-2xs font-medium text-accent-fg">
                            {Math.min(unreadCount, 99)}
                        </span>
                    ) : null}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-72">
                <div className="px-2 py-1.5 text-sm font-medium text-text-primary">Notifications</div>
                {notifications.length === 0 ? (
                    <DropdownMenuItem disabled>None yet</DropdownMenuItem>
                ) : (
                    [...notifications].reverse().slice(0, 12).map((n) => (
                        <DropdownMenuItem key={n.id} className="whitespace-normal text-sm">
                            {n.message}
                        </DropdownMenuItem>
                    ))
                )}
                {notifications.length > 0 ? (
                    <DropdownMenuItem onClick={() => notificationStore.clearAll()}>
                        Clear all
                    </DropdownMenuItem>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function NavItem({
    label,
    icon,
    onClick,
    collapsed,
}: {
    label: string;
    icon: string;
    onClick: () => void;
    collapsed?: boolean;
}) {
    if (collapsed) {
        return (
            <Tooltip content={label} side="right" delayDuration={80}>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onClick}
                    aria-label={label}
                    className="size-9 shrink-0 text-text-secondary hover:text-text-primary"
                >
                    <Icon name={icon} size={18} />
                </Button>
            </Tooltip>
        );
    }

    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClick}
            className={cn("flex h-8 w-full items-center gap-3 px-1.5! text-left")}
        >
            <Icon name={icon} size={16} className="shrink-0 text-text-muted opacity-80" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
        </Button>
    );
}

export function AgentSidebar({
    onNewChat,
    onSearch,
    expanded,
    overlay,
    filesOpen,
    designOpen,
    onToggleSidebar,
}: {
    onNewChat: () => void;
    onSearch: () => void;
    expanded: boolean;
    overlay: AgentOverlay;
    filesOpen?: boolean;
    designOpen?: boolean;
    onToggleSidebar: () => void;
}) {
    const github = useGitHubAuth();
    // Design / settings / git / files replace nav via portal — never leave design chrome outside design mode.
    const showHostedNav = Boolean(overlay) || Boolean(filesOpen) || Boolean(designOpen);

    const items = [
        { label: "New Chat", icon: "add", onClick: onNewChat },
        { label: "Search", icon: "search", onClick: onSearch },
        {
            label: "GitHub",
            icon: "github",
            onClick: () => void openGitWindow(),
        },
        {
            label: "Automations",
            icon: "bot",
            onClick: () => void openSettingsWindow({ category: "agents", section: "integrations" }),
        },
        {
            label: "Customize",
            icon: "tune",
            onClick: () => void openSettingsWindow(),
        },
    ] as const;

    return (
        <aside
            className={cn(
                "flex h-full shrink-0 flex-col overflow-hidden bg-sidebar text-text-primary",
                "transition-[width] duration-[var(--transition-base)] ease-[var(--ease-out)]",
                expanded ? "w-76" : "w-12",
            )}
        >
            <div
                className={cn(
                    HEADER_CLASS,
                    expanded ? "justify-between px-2" : "justify-center px-1.5",
                )}
            >
                <SidebarToggleBtn open={expanded} onToggle={onToggleSidebar} collapsed={!expanded} />
                {showHostedNav ? (
                    <div
                        id={AGENT_SIDEBAR_BACK_SLOT}
                        className={cn("flex min-h-0 shrink-0 items-center justify-end", expanded ? "min-w-0" : "hidden")}
                    />
                ) : expanded ? (
                    <Tooltip content="History" side="bottom" delayDuration={80}>
                        <button
                            type="button"
                            aria-label="History"
                            onClick={() => {
                                void import("@/features/chat/ui/shell/history").then(
                                    ({ openChatHistoryMenu }) => {
                                        openChatHistoryMenu();
                                    },
                                );
                            }}
                            className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
                        >
                            <Icon name="history" size={15} />
                        </button>
                    </Tooltip>
                ) : null}
            </div>

            {showHostedNav ? (
                <div
                    id={AGENT_SIDEBAR_NAV_SLOT}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                    data-collapsed={expanded ? "false" : "true"}
                />
            ) : (
                <>
                    <nav
                        className={cn(
                            "flex shrink-0 gap-0.5",
                            expanded ? "flex-col px-2" : "flex-col items-center px-1.5",
                        )}
                    >
                        {items.map((item) => (
                            <NavItem
                                key={item.label}
                                label={item.label}
                                icon={item.icon}
                                onClick={item.onClick}
                                collapsed={!expanded}
                            />
                        ))}
                    </nav>

                    {expanded ? <RepoList /> : <div className="min-h-0 flex-1" />}

                    <div
                        className={cn(
                            "mt-auto shrink-0",
                            expanded ? "px-1 pb-1" : "flex flex-col items-center gap-1 px-1 pb-2",
                        )}
                    >
                        {expanded ? (
                            <>
                                {!github.loggedIn ? (
                                    <button
                                        type="button"
                                        onClick={() => void loginGitHub()}
                                        className="mb-1 flex w-full items-center justify-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                                    >
                                        <Icon name="github" size={14} />
                                        Connect GitHub
                                    </button>
                                ) : null}
                                <AccountRow />
                            </>
                        ) : (
                            <div className="flex flex-col items-center gap-1">
                                <SidebarNotificationsCollapsed />
                                <Tooltip content="Settings" side="right" delayDuration={80}>
                                    <button
                                        type="button"
                                        onClick={() => void openSettingsWindow()}
                                        className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
                                        aria-label="Settings"
                                    >
                                        <Icon name="settings" size={18} />
                                    </button>
                                </Tooltip>
                            </div>
                        )}
                    </div>
                </>
            )}
        </aside>
    );
}
