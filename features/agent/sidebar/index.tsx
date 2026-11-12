"use client";

import { GithubMark } from "@/components/ui/github-mark";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { Compose20Regular } from "@fluentui/react-icons/headless/svg/compose";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { Settings20Regular } from "@fluentui/react-icons/headless/svg/settings";

import { type IconGlyph, Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { loginGitHub, useGitHubAuth } from "@/lib/github/store";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { useShapeAuth } from "@/lib/cloud/store";
import { ChatList } from "./chats";
import { AccountMenu, ProfileAvatar } from "./menu";
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
                "flex h-9 w-full items-center justify-start gap-2 px-1.5! text-left",
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
    const showHostedNav = Boolean(overlay);

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

    const newChat = () => {
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
                    !open && "pointer-events-none -translate-x-full opacity-0",
                )}
            >
                {showHostedNav ? (
                    <>
                        <div
                            className={cn(
                                "relative z-20 flex h-titlebar shrink-0 items-center",
                                expanded ? "justify-between pl-3 pr-2" : "justify-center px-1.5",
                            )}
                            data-chrome-leading="true"
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
                                expanded ? "justify-between pl-2 pr-2" : "justify-center px-1.5",
                            )}
                            data-chrome-leading="true"
                        >
                            {expanded ? (
                                <AccountMenu>
                                    <button
                                        type="button"
                                        aria-label="Account"
                                        className="flex items-center gap-2 squircle-2xl px-1 py-0.5 text-left hover:bg-panel-hover"
                                    >
                                        <ProfileAvatar
                                            gitAvatarUrl={github.loggedIn ? github.avatarUrl : null}
                                            shapeUserId={shapeAuth.userId}
                                            offline={Boolean(shapeAuth.offline)}
                                            name={displayName}
                                            size={20}
                                        />
                                        <Icon
                                            icon={ChevronDown20Regular}
                                            className="shrink-0 text-text-muted!"
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

                        {expanded ? null : (
                            <nav className="flex shrink-0 flex-col items-center gap-0.5 px-1.5">
                                <NavItem label="New Chat" icon={Compose20Regular} onClick={newChat} collapsed />
                                <NavItem label="Command Palette" icon={Search20Regular} onClick={onSearch} collapsed />
                            </nav>
                        )}

                        {expanded ? (
                            <ChatList
                                onNewChat={() => {
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
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void openSettingsWindow()}
                                className="flex h-9 w-full items-center justify-start gap-2 px-1.5! text-left"
                            >
                                <Icon icon={Settings20Regular} className="shrink-0 text-text-muted" />
                                <span className="min-w-0 flex-1 truncate">Settings</span>
                            </Button>
                        </>
                    ) : (
                        <NavItem label="Settings" icon={Settings20Regular} onClick={() => void openSettingsWindow()} collapsed />
                    )}
                </div>
            </div>
        </aside>
    );
}
