"use client";

import type { RemixiconComponentType } from "@remixicon/react";
import { RiAddLine, RiGithubFill, RiHistoryLine, RiNotification3Line, RiQuillPenAiFill, RiSearchLine, RiSettings3Line } from "@remixicon/react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { loginGitHub, useGitHubAuth } from "@/lib/github/store";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { ChatList } from "./chats";
import { AccountRow } from "./account";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { AGENT_SIDEBAR_HISTORY_SLOT } from "../chrome";
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
                    <Icon icon={RiNotification3Line} />
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
    icon: RemixiconComponentType;
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
                    <Icon icon={icon} />
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
            <Icon icon={icon} className="shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
        </Button>
    );
}

export function AgentSidebar({
    onNewChat,
    onSearch,
    expanded,
    overlay,
    onDesign,
    showDesign,
}: {
    onNewChat: () => void;
    onSearch: () => void;
    expanded: boolean;
    overlay: AgentOverlay;
    onDesign?: () => void;
    showDesign?: boolean;
    onToggleSidebar?: () => void;
}) {
    const github = useGitHubAuth();
    const showHostedNav = Boolean(overlay);

    const items = [
        { label: "New Chat", icon: RiAddLine, onClick: onNewChat },
        { label: "Search", icon: RiSearchLine, onClick: onSearch },
        ...(showDesign && onDesign
            ? [{ label: "Design", icon: RiQuillPenAiFill, onClick: onDesign }]
            : []),
        {
            label: "Customize",
            icon: RiSettings3Line,
            onClick: () => void openSettingsWindow(),
        },
    ];

    return (
        <aside
            className={cn(
                "flex h-full shrink-0 flex-col overflow-hidden bg-sidebar border-r border-border text-text-primary",
                "transition-[width] duration-[var(--transition-base)] ease-[var(--ease-out)]",
                expanded ? "w-76" : "w-12",
            )}
        >
            {showHostedNav ? null : (
            <div
                className={cn(
                    HEADER_CLASS,
                    expanded ? "justify-between px-2" : "justify-center px-1.5",
                )}
            >
                {expanded ? (
                    <div
                        id={AGENT_SIDEBAR_HISTORY_SLOT}
                        data-collapsed="false"
                        className="flex min-h-0 shrink-0 items-center"
                    />
                ) : null}
                    <Tooltip content="History" side={expanded ? "bottom" : "right"} delayDuration={80}>
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
                            className={cn(
                                "flex items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary",
                                expanded ? "size-7" : "size-9",
                            )}
                        >
                            <Icon icon={RiHistoryLine} />
                        </button>
                    </Tooltip>
            </div>
            )}

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

                    {expanded ? <ChatList onNewChat={onNewChat} /> : <div className="min-h-0 flex-1" />}
                </>
            )}

            <div
                className={cn(
                    "mt-auto shrink-0",
                    expanded ? "px-1 pb-1" : "flex flex-col items-center gap-1 px-1 pb-2",
                )}
            >
                {expanded ? (
                    <>
                        {!showHostedNav && !github.loggedIn ? (
                            <button
                                type="button"
                                onClick={() => void loginGitHub()}
                                className="mb-1 flex w-full items-center justify-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                            >
                                <Icon icon={RiGithubFill} />
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
                                <Icon icon={RiSettings3Line} />
                            </button>
                        </Tooltip>
                    </div>
                )}
            </div>
        </aside>
    );
}
