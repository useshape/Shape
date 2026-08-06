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
                        "chat-tab-bar relative flex shrink-0 items-stretch border-b border-border bg-panel",
                        columnChrome ? "h-titlebar" : "h-[36px]",
                    )}
                    {...(columnChrome ? { "data-tauri-drag-region": true } : {})}
                >
                    <div className="relative z-10 flex min-w-0 items-center gap-0.5 overflow-hidden pl-2" data-no-drag>
                        <div className="relative min-w-0 max-w-full">
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
                        </div>
                    </div>

                    <div className="min-w-0 flex-1" data-tauri-drag-region={columnChrome || undefined} aria-hidden />

                    <div className="relative z-10 flex shrink-0 items-center gap-0.5 px-1" data-no-drag>
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
                        <div className="relative z-10 flex shrink-0 items-stretch" data-no-drag>
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
