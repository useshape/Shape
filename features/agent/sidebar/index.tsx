"use client";

import { GithubMark } from "@/components/ui/github-mark";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { MoreHorizontal20Regular } from "@fluentui/react-icons/headless/svg/more-horizontal";
import { Settings20Regular } from "@fluentui/react-icons/headless/svg/settings";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { loginGitHub, useGitHubAuth } from "@/lib/github/store";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { useShapeAuth } from "@/lib/cloud/store";
import { ChatList } from "./chats";
import { AccountMenu, ProfileAvatar } from "./menu";
import { ChatUsageButton } from "@/features/chat/ui/composer/usage";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Checkmark20Regular } from "@fluentui/react-icons/headless/svg/checkmark";
import { setWorkspaceMode, useWorkspaceMode, WORKSPACE_MODES } from "@/lib/ui/workspace-mode";
import { SidebarToggleBtn, AGENT_SIDEBAR_BACK_SLOT } from "../chrome";
import type { AgentOverlay } from "../overlay";

export const AGENT_SIDEBAR_NAV_SLOT = "shape-agent-sidebar-nav";

export function AgentSidebar({
    onSearch: _onSearch,
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
    const workspaceModeId = useWorkspaceMode();
    const activeMode = WORKSPACE_MODES.find((mode) => mode.id === workspaceModeId) ?? WORKSPACE_MODES[0];
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
                                "relative z-20 flex h-titlebar shrink-0 items-center",
                                expanded ? "justify-between gap-0.5 px-1.5" : "justify-center px-1.5",
                            )}
                        >
                            {expanded ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="gap-1.5 px-1.5 text-lg font-medium"
                                        >
                                            <img
                                                src={activeMode.icon}
                                                alt=""
                                                width={16}
                                                height={16}
                                                className="size-5 mr-0.5 shrink-0"
                                            />
                                            <span className="leading-none">{activeMode.id}</span>
                                            <Icon
                                                icon={ChevronDown20Regular}
                                                className="text-text-muted"
                                                style={{ ["--icon-size" as string]: "16px" }}
                                            />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-44">
                                        {WORKSPACE_MODES.map((mode) => (
                                            <DropdownMenuItem key={mode.id} onSelect={() => setWorkspaceMode(mode.id)}>
                                                <img
                                                    src={mode.icon}
                                                    alt=""
                                                    width={16}
                                                    height={16}
                                                    className="size-6 shrink-0"
                                                />
                                                <span className="min-w-0 flex-1">{mode.id}</span>
                                                {mode.id === workspaceModeId ? (
                                                    <Icon icon={Checkmark20Regular} className="text-text-muted" />
                                                ) : null}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : null}
                            <SidebarToggleBtn
                                open={expanded}
                                collapsed={!expanded}
                                onToggle={toggleSidebar}
                            />
                        </div>

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
                            <div className="flex items-center gap-1 px-1 pb-1">
                                <AccountMenu side="top">
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
                                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                                            {displayName}
                                        </span>
                                        <Icon
                                            icon={MoreHorizontal20Regular}
                                            className="shrink-0 text-text-muted"
                                        />
                                    </button>
                                </AccountMenu>
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
