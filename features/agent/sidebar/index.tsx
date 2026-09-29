"use client";

import { GithubMark } from "@/components/ui/github-mark";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { Compose20Regular } from "@fluentui/react-icons/headless/svg/compose";
import { People20Regular } from "@fluentui/react-icons/headless/svg/people";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { Settings20Regular } from "@fluentui/react-icons/headless/svg/settings";

import { useSyncExternalStore } from "react";
import { type IconGlyph, Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { loginGitHub, useGitHubAuth } from "@/lib/github/store";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { useProjectState } from "@/lib/backend";
import { useShapeAuth } from "@/lib/cloud/store";
import {
    isMultiworkMode,
    resetMultiworkSession,
    setMultiworkMode,
    subscribeMultiwork,
} from "@/features/multiwork";
import { ChatList } from "./chats";
import { AccountMenu, ProfileAvatar } from "./menu";
import { AgentTabsChip } from "./agent-tabs-chip";
import { ChatHistoryMenu } from "@/features/chat/ui/shell/history";
import { ChatUsageButton } from "@/features/chat/ui/composer/usage";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { SidebarToggleBtn, AGENT_SIDEBAR_BACK_SLOT } from "../chrome";
import type { AgentOverlay } from "../overlay";

export const AGENT_SIDEBAR_NAV_SLOT = "shape-agent-sidebar-nav";

function NavItem({
    label,
    icon,
    onClick,
    collapsed,
    active,
}: {
    label: string;
    icon: IconGlyph;
    onClick: () => void;
    collapsed?: boolean;
    active?: boolean;
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
                    aria-current={active ? "page" : undefined}
                    className={cn(
                        "size-9 shrink-0 text-text-secondary hover:text-text-primary",
                        active && "bg-panel-active text-text-primary",
                    )}
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
            aria-current={active ? "page" : undefined}
            className={cn(
                "flex h-8 w-full items-center justify-start gap-3 px-1.5! text-left",
                active && "bg-panel-active",
            )}
        >
            <Icon icon={icon} className="shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
        </Button>
    );
}

export function AgentSidebar({
    onSearch,
    expanded,
    open = true,
    overlay,
    onToggleSidebar,
}: {
    onSearch: () => void;
    expanded: boolean;
    open?: boolean;
    overlay: AgentOverlay;
    onBrowser?: () => void;
    showBrowser?: boolean;
    onToggleSidebar?: () => void;
}) {
    const github = useGitHubAuth();
    const shapeAuth = useShapeAuth();
    const { project_path } = useProjectState();
    const showHostedNav = Boolean(overlay);
    const multiwork = useSyncExternalStore(subscribeMultiwork, isMultiworkMode, () => false);

    const displayName =
        (shapeAuth.name && !/^n\/?a$/i.test(shapeAuth.name.trim()) ? shapeAuth.name.trim() : null)
        ?? (github.loggedIn && github.username ? github.username : null)
        ?? "Personal";

    const toggleSidebar = () => {
        if (onToggleSidebar) {
            onToggleSidebar();
            return;
        }
        window.dispatchEvent(
            new CustomEvent("shape-layout-toggle", {
                detail: { id: "primary-sidebar" },
            }),
        );
    };

    const items: { label: string; icon: IconGlyph; onClick: () => void; active?: boolean }[] = [
        {
            label: "Multiwork",
            icon: People20Regular,
            active: multiwork,
            onClick: () => {
                if (multiwork) {
                    // Deselect mode; leave background workers/sessions alone.
                    setMultiworkMode(false);
                    return;
                }
                setMultiworkMode(true);
                window.dispatchEvent(new Event("shape-chat-new"));
                window.dispatchEvent(new Event("shape-chat-focus-input"));
            },
        },
        {
            label: "Options",
            icon: Settings20Regular,
            onClick: () => void openSettingsWindow(),
        },
    ];

    const newChat = () => {
        // New Chat always returns to regular chat; Multiwork sessions keep running in the background.
        setMultiworkMode(false);
        window.dispatchEvent(new Event("shape-chat-new"));
        window.dispatchEvent(new Event("shape-chat-focus-input"));
    };

    return (
        <aside
            aria-hidden={!open}
            className={cn(
                "relative z-20 flex h-full shrink-0 flex-col overflow-hidden bg-sidebar text-text-primary",
                "transition-[width,border-color] duration-[var(--transition-base)] ease-[var(--ease-out)]",
                !open ? "w-0 border-r-transparent" : expanded ? "w-80" : "w-12",
            )}
        >
            <div
                className={cn(
                    "flex h-full min-h-0 shrink-0 flex-col",
                    expanded ? "w-80" : "w-12",
                    "transition-[opacity,transform] duration-[var(--transition-base)] ease-[var(--ease-out)]",
                    !open && "pointer-events-none -translate-x-3 opacity-0",
                )}
            >
                {showHostedNav ? (
                    <>
                        <div
                            className={cn(
                                "relative z-20 flex h-titlebar shrink-0 items-center",
                                expanded ? "justify-between px-2" : "justify-center px-1.5",
                            )}
                        >
                            <SidebarToggleBtn
                                open={expanded}
                                collapsed={!expanded}
                                onToggle={toggleSidebar}
                            />
                            {expanded ? (
                                <div id={AGENT_SIDEBAR_BACK_SLOT} className="flex items-center" />
                            ) : null}
                        </div>
                        <div
                            id={AGENT_SIDEBAR_NAV_SLOT}
                            className="flex min-h-0 flex-1 flex-col overflow-hidden"
                            data-collapsed={expanded ? "false" : "true"}
                        />
                    </>
                ) : (
                    <>
                        <div
                            className={cn(
                                "relative z-20 flex h-titlebar shrink-0 items-center gap-1",
                                expanded ? "justify-between px-2" : "justify-center px-1.5",
                            )}
                        >
                            {expanded ? (
                                <AccountMenu>
                                    <button
                                        type="button"
                                        aria-label="Account"
                                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-panel-hover"
                                    >
                                        <ProfileAvatar
                                            gitAvatarUrl={github.loggedIn ? github.avatarUrl : null}
                                            shapeUserId={shapeAuth.userId}
                                            offline={Boolean(shapeAuth.offline)}
                                            name={displayName}
                                            size={22}
                                        />
                                        <span className="min-w-0 flex-1 truncate text-sm font-normal text-text-primary">
                                            {displayName}
                                        </span>
                                        <Icon
                                            icon={ChevronDown20Regular}
                                            className="shrink-0 text-text-muted"
                                            style={{ ["--icon-size" as string]: "14px" }}
                                        />
                                    </button>
                                </AccountMenu>
                            ) : null}
                            <SidebarToggleBtn
                                open={expanded}
                                collapsed={!expanded}
                                onToggle={toggleSidebar}
                            />
                        </div>

                        {expanded ? <AgentTabsChip /> : null}

                        <nav
                            className={cn(
                                "flex shrink-0 gap-0.5",
                                expanded ? "flex-col px-2" : "flex-col items-center px-1.5",
                            )}
                        >
                            {expanded ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={newChat}
                                    className="flex h-8 w-full items-center justify-start gap-3 px-1.5! text-left"
                                >
                                    <Icon icon={Compose20Regular} className="shrink-0 text-text-muted" />
                                    <span className="min-w-0 flex-1 truncate">New Chat</span>
                                </Button>
                            ) : (
                                <>
                                    <NavItem label="New Chat" icon={Compose20Regular} onClick={newChat} collapsed />
                                    <NavItem label="Search" icon={Search20Regular} onClick={onSearch} collapsed />
                                </>
                            )}
                            {items.map((item) => (
                                <NavItem
                                    key={item.label}
                                    label={item.label}
                                    icon={item.icon}
                                    onClick={item.onClick}
                                    collapsed={!expanded}
                                    active={item.active}
                                />
                            ))}
                        </nav>

                        {expanded ? (
                            <ChatList
                                listKind={multiwork ? "multiwork" : "chat"}
                                onNewChat={() => {
                                    if (multiwork) {
                                        // New Multiwork session (stay in mode).
                                        resetMultiworkSession();
                                    } else {
                                        setMultiworkMode(false);
                                    }
                                    window.dispatchEvent(new Event("shape-chat-new"));
                                    window.dispatchEvent(new Event("shape-chat-focus-input"));
                                }}
                            />
                        ) : (
                            <div className="min-h-0 flex-1" />
                        )}
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
                                <Button
                                    type="button"
                                    onClick={() => void loginGitHub()}
                                    className="mb-1 w-full justify-start rounded-md px-3"
                                    variant="ghost"
                                    size="md"
                                >
                                    <Icon icon={GithubMark} />
                                    Connect GitHub
                                </Button>
                            ) : null}
                            <div className="flex items-center gap-0.5 px-1 pb-0.5">
                                <ChatHistoryMenu
                                    projectPath={project_path}
                                    variant="icon"
                                    tooltip="Chat history"
                                    align="start"
                                />
                                <ChatUsageButton />
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-1">
                            <ChatUsageButton compact />
                            <Tooltip content="Settings" side="right" delayDuration={80}>
                                <button
                                    type="button"
                                    onClick={() => void openSettingsWindow()}
                                    className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
                                    aria-label="Settings"
                                >
                                    <Icon icon={Settings20Regular} />
                                </button>
                            </Tooltip>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}
