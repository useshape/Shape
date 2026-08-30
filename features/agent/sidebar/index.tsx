"use client";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { loginGitHub, useGitHubAuth } from "@/lib/github-auth/store";
import { openSettingsWindow } from "@/lib/open-settings";
import { RepoList } from "./repos";
import { AccountRow } from "./account";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { AgentOverlay } from "../overlay";

export const AGENT_SIDEBAR_NAV_SLOT = "shape-agent-sidebar-nav";

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
            className={cn("flex w-full items-center gap-3 px-1.5! text-left")}
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
}: {
    onNewChat: () => void;
    onSearch: () => void;
    expanded: boolean;
    overlay: AgentOverlay;
    filesOpen?: boolean;
}) {
    const github = useGitHubAuth();
    const showHostedNav = Boolean(overlay) || filesOpen;

    const items = [
        { label: "New Chat", icon: "add", onClick: onNewChat },
        { label: "Search", icon: "search", onClick: onSearch },
        {
            label: "Automations",
            icon: "bot",
            onClick: () => void openSettingsWindow({ category: "agents", section: "mcp" }),
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
                expanded ? "w-56" : "w-12",
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
                    <nav
                        className={cn(
                            "flex shrink-0 gap-0.5 pt-3",
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
                            "mt-auto shrink-0 pt-1",
                            expanded ? "px-1 pb-1" : "flex flex-col items-center gap-1 px-1 pb-2",
                        )}
                    >
                        {expanded ? (
                            <>
                                {!github.loggedIn ? (
                                    <button
                                        type="button"
                                        onClick={() => void loginGitHub()}
                                        className="mb-1 flex w-full items-center justify-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
                                    >
                                        <Icon name="github" size={14} />
                                        Connect GitHub
                                    </button>
                                ) : null}
                                <AccountRow />
                            </>
                        ) : (
                            <Tooltip content="Settings" side="right" delayDuration={80}>
                                <button
                                    type="button"
                                    onClick={() => void openSettingsWindow()}
                                    className="flex size-9 items-center justify-center rounded-md text-text-muted transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
                                    aria-label="Settings"
                                >
                                    <Icon name="settings" size={18} />
                                </button>
                            </Tooltip>
                        )}
                    </div>
                </>
            )}
        </aside>
    );
}
