"use client";

import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { SidebarPanelActionButton } from "@/features/panels";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { SidebarSwitchPanelMenuItems } from "@/features/panels";
import { openAgentWindow } from "@/lib/open-agent-window";
import { cn } from "@/lib/utils";
import { ChatMoreMenu } from "./more";
import type { ReactNode } from "react";

export type ChatTab = {
    id: string;
    title: string;
};

export const NEW_CHAT_TAB_ID = "__new_chat__";

export function ChatTabBar({
    tabs,
    activeTabId,
    onSelectTab,
    onCloseTab,
    onNewChat,
    onClosePanel: _onClosePanel,
    sidebarSide = "right",
    columnChrome = false,
    embedWindowControls,
}: {
    tabs: ChatTab[];
    activeTabId: string;
    onSelectTab: (tabId: string) => void;
    onCloseTab: (tabId: string) => void;
    onNewChat: () => void;
    onSelectConversation?: (id: string) => void;
    activeConversationId?: string | null;
    projectPath?: string | null;
    onClosePanel?: () => void;
    sidebarSide?: "left" | "right";
    columnChrome?: boolean;
    embedWindowControls?: ReactNode;
}) {
    void _onClosePanel;
    const closeTab = (tabId: string) => {
        onCloseTab(tabId);
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <header
                    className={cn(
                        "chat-tab-bar relative flex shrink-0 items-stretch bg-panel",
                        columnChrome ? "h-titlebar" : "h-[36px]",
                    )}
                >
                    {columnChrome ? (
                        <div
                            className="titlebar-drag-region absolute inset-0 z-0"
                            data-tauri-drag-region
                        />
                    ) : null}

                    <div
                        className={cn(
                            "relative z-10 flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden",
                            columnChrome ? "pl-2" : "pl-2",
                        )}
                    >
                        <div className="relative min-w-0 flex-1">
                            <div className="chat-tab-scroll flex min-w-0 items-center gap-0.5 overflow-x-auto no-scrollbar">
                                {tabs.map((tab) => {
                                    const active = tab.id === activeTabId;
                                    return (
                                        <div
                                            key={tab.id}
                                            className={cn(
                                                "group relative flex h-7 max-w-[180px] shrink-0 items-center gap-1 px-2 text-sm transition-colors",
                                                columnChrome ? "rounded-sm" : "rounded-md",
                                                active
                                                    ? "bg-surface-3 text-text-primary"
                                                    : "text-text-muted hover:bg-panel-hover hover:text-text-secondary",
                                            )}
                                        >
                                            <button
                                                type="button"
                                                className="min-w-0 truncate text-left"
                                                onClick={() => onSelectTab(tab.id)}
                                            >
                                                {tab.title}
                                            </button>
                                            <button
                                                type="button"
                                                className={cn(
                                                    "flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-muted hover:bg-panel-hover hover:text-text-primary",
                                                    tabs.length > 1
                                                        ? "invisible group-hover:visible"
                                                        : "opacity-60 group-hover:opacity-100",
                                                )}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    closeTab(tab.id);
                                                }}
                                                aria-label={
                                                    tabs.length <= 1
                                                        ? "Close chat panel"
                                                        : `Close ${tab.title}`
                                                }
                                            >
                                                <Icon name="close" size={12} />
                                            </button>
                                        </div>
                                    );
                                })}
                                <Tooltip content="New Chat">
                                    <button
                                        type="button"
                                        onClick={onNewChat}
                                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-panel-hover hover:text-text-primary"
                                        aria-label="New Chat"
                                    >
                                        <Icon name="add" size={14} />
                                    </button>
                                </Tooltip>
                            </div>
                            <div
                                className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-10 bg-linear-to-l from-panel to-transparent"
                                aria-hidden
                            />
                        </div>
                    </div>

                    <div className="relative z-10 flex shrink-0 items-center gap-0.5 px-1">
                        <Tooltip content="Open Agent window">
                            <SidebarPanelActionButton
                                onClick={() => void openAgentWindow()}
                                className="h-6 w-6"
                            >
                                <Icon name="agents" size={14} />
                            </SidebarPanelActionButton>
                        </Tooltip>
                        <ChatMoreMenu />
                    </div>

                    {embedWindowControls ? (
                        <div className="relative z-10 flex shrink-0 items-stretch">
                            {embedWindowControls}
                        </div>
                    ) : null}
                </header>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
                <SidebarSwitchPanelMenuItems currentSide={sidebarSide} currentPanelId="chat" />
            </ContextMenuContent>
        </ContextMenu>
    );
}
