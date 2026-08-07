"use client";

import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { SidebarSwitchPanelMenuItems } from "@/features/panels";
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
    embedWindowControls?: ReactNode;
}) {
    void _onClosePanel;
    const closeTab = (tabId: string) => {
        onCloseTab(tabId);
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <header className="chat-tab-bar relative flex h-[36px] shrink-0 items-stretch bg-panel">
                    <div className="relative z-10 flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden pl-2">
                        <div className="relative min-w-0 flex-1">
                            <div className="chat-tab-scroll flex min-w-0 items-center gap-0.5 overflow-x-auto no-scrollbar">
                                {tabs.map((tab) => {
                                    const active = tab.id === activeTabId;
                                    return (
                                        <div
                                            key={tab.id}
                                            className={cn(
                                                "group relative flex h-8 max-w-[180px] shrink-0 items-center gap-1 rounded-md px-3 text-sm transition-colors",
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
                                                        : "text-text-muted",
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
