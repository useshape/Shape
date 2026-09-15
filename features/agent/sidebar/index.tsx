"use client";

import type { RemixiconComponentType } from "@remixicon/react";
import { RiAddLine, RiBrushFill, RiGithubFill, RiBrushLine, RiSearchLine, RiSettings3Line } from "@remixicon/react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { loginGitHub, useGitHubAuth } from "@/lib/github/store";
import { openSettingsWindow } from "@/lib/window/open-settings";
import { ChatList } from "./chats";
import { AccountRow } from "./account";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { SidebarToggleBtn } from "../chrome";
import type { AgentOverlay } from "../overlay";

export const AGENT_SIDEBAR_NAV_SLOT = "shape-agent-sidebar-nav";

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
            <Tooltip
                content={label}
                side="right"
                delayDuration={80}
            >
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
            className={cn("flex h-8 w-full items-center justify-start gap-3 px-1.5! text-left")}
        >
            <Icon icon={icon} className="shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
        </Button>
    );
}

export function AgentSidebar({
    onSearch,
    expanded,
    overlay,
    onDesign,
    showDesign,
    onToggleSidebar,
}: {
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
        ...(showDesign && onDesign
            ? [{ label: "Design", icon: RiBrushLine, onClick: onDesign }]
            : []),
        {
            label: "Customize",
            icon: RiSettings3Line,
            onClick: () => void openSettingsWindow(),
        },
    ];

    const newChat = () => {
        window.dispatchEvent(new Event("shape-chat-new"));
        window.dispatchEvent(new Event("shape-chat-focus-input"));
    };

    return (
        <aside
            className={cn(
                "flex h-full shrink-0 flex-col overflow-hidden bg-sidebar border-none! text-text-primary",
                "transition-[width] duration-[var(--transition-base)] ease-[var(--ease-out)]",
                expanded ? "w-76" : "w-12",
            )}
        >
            {showHostedNav ? (
                <div
                    id={AGENT_SIDEBAR_NAV_SLOT}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                    data-collapsed={expanded ? "false" : "true"}
                />
            ) : (
                <>
                    <div
                        className={cn(
                            "flex h-10 shrink-0 items-center",
                            expanded ? "justify-start px-2" : "justify-center px-1.5",
                        )}
                    >
                        <SidebarToggleBtn
                            open={expanded}
                            collapsed={!expanded}
                            onToggle={() => {
                                if (onToggleSidebar) {
                                    onToggleSidebar();
                                    return;
                                }
                                window.dispatchEvent(
                                    new CustomEvent("shape-layout-toggle", {
                                        detail: { id: "primary-sidebar" },
                                    }),
                                );
                            }}
                        />
                    </div>
                    <nav
                        className={cn(
                            "flex shrink-0 gap-0.5",
                            expanded ? "flex-col px-2" : "flex-col items-center px-1.5",
                        )}
                    >
                        {expanded ? (
                            <div className="flex h-8 w-full items-center gap-0.5">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={newChat}
                                    className="flex h-8 min-w-0 flex-1 items-center justify-start gap-3 px-1.5! text-left"
                                >
                                    <Icon icon={RiAddLine} className="shrink-0 text-text-muted" />
                                    <span className="min-w-0 flex-1 truncate">New Chat</span>
                                </Button>
                                <Tooltip content="Search" side="bottom" delayDuration={80}>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Search"
                                        onClick={onSearch}
                                        className="size-8 shrink-0 text-text-secondary hover:text-text-primary"
                                    >
                                        <Icon icon={RiSearchLine} />
                                    </Button>
                                </Tooltip>
                            </div>
                        ) : (
                            <>
                                <NavItem label="New Chat" icon={RiAddLine} onClick={newChat} collapsed />
                                <NavItem label="Search" icon={RiSearchLine} onClick={onSearch} collapsed />
                            </>
                        )}
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
                                className="justify-start px-3 rounded-md w-full mb-1"
                                variant="ghost"
                                size="md"
                            >
                                <Icon icon={RiGithubFill} />
                                Connect GitHub
                            </Button>
                        ) : null}
                        <AccountRow />
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
                                <Icon icon={RiSettings3Line} />
                            </button>
                        </Tooltip>
                    </div>
                )}
            </div>
        </aside>
    );
}
