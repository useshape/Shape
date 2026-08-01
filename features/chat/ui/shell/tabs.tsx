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
import { ChatHistoryMenu } from "./history";

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
    onSelectConversation,
    activeConversationId,
    projectPath,
    onClosePanel,
    sidebarSide = "right",
}: {
    tabs: ChatTab[];
    activeTabId: string;
    onSelectTab: (tabId: string) => void;
    onCloseTab: (tabId: string) => void;
    onNewChat: () => void;
    onSelectConversation: (id: string) => void;
    activeConversationId?: string | null;
    projectPath?: string | null;
    onClosePanel?: () => void;
    sidebarSide?: "left" | "right";
}) {
    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <header className="chat-tab-bar flex h-[36px] shrink-0 items-center gap-1 bg-panel px-2">
                    <div className="relative min-w-0 flex-1">
                        <div className="chat-tab-scroll flex h-full min-w-0 items-center gap-1 overflow-x-auto no-scrollbar">
                            {tabs.map((tab) => {
                                const active = tab.id === activeTabId;
                                return (
                                    <div
                                        key={tab.id}
                                        className={cn(
                                            "group relative flex h-7 max-w-[200px] shrink-0 items-center gap-1 rounded-lg px-2.5 text-sm transition-colors",
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
                                        {tabs.length > 1 ? (
                                            <button
                                                type="button"
                                                className="invisible flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-muted hover:bg-panel-hover hover:text-text-primary group-hover:visible"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onCloseTab(tab.id);
                                                }}
                                                aria-label={`Close ${tab.title}`}
                                            >
                                                <Icon name="close" size={12} />
                                            </button>
                                        ) : null}
                                    </div>
                                );
                            })}
                            <div className="min-w-[8px] flex-1 shrink-0" />
                        </div>
                        <div
                            className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-10 bg-gradient-to-l from-panel to-transparent"
                            aria-hidden
                        />
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5 px-1">
                        <Tooltip content="Open Agent window">
                            <SidebarPanelActionButton
                                onClick={() => void openAgentWindow()}
                                className="h-6 w-6"
                            >
                                <Icon name="agents" size={14} />
                            </SidebarPanelActionButton>
                        </Tooltip>
                        <Tooltip content="New Chat">
                            <SidebarPanelActionButton onClick={onNewChat}>
                                <Icon name="add" size={14} />
                            </SidebarPanelActionButton>
                        </Tooltip>
                        <ChatHistoryMenu
                            activeConversationId={activeConversationId}
                            projectPath={projectPath}
                            onSelectConversation={(id) => onSelectConversation(id)}
                        />
                        <ChatMoreMenu />
                        {onClosePanel ? (
                            <Tooltip content="Close Chat">
                                <SidebarPanelActionButton onClick={onClosePanel}>
                                    <Icon name="close" size={14} />
                                </SidebarPanelActionButton>
                            </Tooltip>
                        ) : null}
                    </div>
                </header>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
                <SidebarSwitchPanelMenuItems currentSide={sidebarSide} currentPanelId="chat" />
            </ContextMenuContent>
        </ContextMenu>
    );
}
