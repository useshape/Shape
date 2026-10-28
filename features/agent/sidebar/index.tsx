"use client";

import { GithubMark } from "@/components/ui/github-mark";
import { FolderOpen20Regular } from "@fluentui/react-icons/headless/svg/folder-open";
import { MoreHorizontal20Regular } from "@fluentui/react-icons/headless/svg/more-horizontal";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { Settings20Regular } from "@fluentui/react-icons/headless/svg/settings";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { loginGitHub, useGitHubAuth } from "@/lib/github/store";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { useShapeAuth } from "@/lib/cloud/store";
import { useProjectState } from "@/lib/backend";
import { getRepoName } from "@/lib/workspace/repo-history";
import { ChatList } from "./chats";
import { AccountMenu, ProfileAvatar } from "./menu";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { SidebarToggleBtn, AGENT_SIDEBAR_BACK_SLOT } from "../chrome";
import type { AgentOverlay } from "../overlay";

export const AGENT_SIDEBAR_NAV_SLOT = "shape-agent-sidebar-nav";

function RoundIconBtn({
    label,
    onClick,
    children,
}: {
    label: string;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Tooltip content={label} side="bottom" delayDuration={80}>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={label}
                onClick={onClick}
                className="size-8 min-h-8 min-w-8 rounded-full"
            >
                {children}
            </Button>
        </Tooltip>
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
    const { project_path } = useProjectState();
    const repo = project_path ? getRepoName(project_path) : null;
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
                "relative z-20 flex h-full pt-2 shrink-0 flex-col overflow-hidden bg-sidebar text-text-primary",
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
                        <div className="relative z-20 flex h-titlebar shrink-0 items-center justify-start gap-0.5 px-1.5">
                            <SidebarToggleBtn
                                open={expanded}
                                collapsed={!expanded}
                                onToggle={toggleSidebar}
                            />
                            {expanded ? (
                                <>
                                    <RoundIconBtn label="Search" onClick={onSearch}>
                                        <Icon icon={Search20Regular} style={{ ["--icon-size" as string]: "20px" }} />
                                    </RoundIconBtn>
                                    <RoundIconBtn
                                        label={repo ? `Project: ${repo}` : "Open project"}
                                        onClick={() => window.dispatchEvent(new Event("shape-open-project-pick"))}
                                    >
                                        <Icon icon={FolderOpen20Regular} style={{ ["--icon-size" as string]: "20px" }} />
                                    </RoundIconBtn>
                                </>
                            ) : null}
                        </div>

                        {expanded ? (
                            <ChatList
                                onNewChat={() => {
                                    window.dispatchEvent(new Event("shape-chat-new"));
                                    window.dispatchEvent(new Event("shape-chat-focus-input"));
                                }}
                            />
                        ) : (
                            <div className="flex min-h-0 flex-1 flex-col items-center gap-1 pt-1">
                                <RoundIconBtn label="Search" onClick={onSearch}>
                                    <Icon icon={Search20Regular} style={{ ["--icon-size" as string]: "20px" }} />
                                </RoundIconBtn>
                                <RoundIconBtn
                                    label={repo ? `Project: ${repo}` : "Open project"}
                                    onClick={() => window.dispatchEvent(new Event("shape-open-project-pick"))}
                                >
                                    <Icon icon={FolderOpen20Regular} style={{ ["--icon-size" as string]: "20px" }} />
                                </RoundIconBtn>
                            </div>
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
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-1">
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
