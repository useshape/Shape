"use client";

import { Icon } from "@/components/ui/icon";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuTrigger,
} from "@/components/ui/context";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { FadeTruncate } from "@/components/ui/fade-truncate";
import { SidebarSwitchPanelMenuItems } from "@/features/panels";
import { cn } from "@/lib/utils";
import { ChatMoreMenu } from "./more";
import type { ReactNode } from "react";

export type ChatTab = {
    id: string;
    title: string;
};

/** Draft / unsaved conversation sentinel — still used by the chat session store. */
export const NEW_CHAT_TAB_ID = "__new_chat__";

export function ChatTabBar({
    title,
    onNewChat,
    onClosePanel: _onClosePanel,
    sidebarSide = "right",
    embedWindowControls,
}: {
    title: string;
    onNewChat: () => void;
    /** @deprecated Multi-tab chrome removed; kept optional for call-site compatibility. */
    tabs?: ChatTab[];
    activeTabId?: string;
    onSelectTab?: (tabId: string) => void;
    onCloseTab?: (tabId: string) => void;
    onSelectConversation?: (id: string) => void;
    activeConversationId?: string | null;
    projectPath?: string | null;
    onClosePanel?: () => void;
    sidebarSide?: "left" | "right";
    embedWindowControls?: ReactNode;
}) {
    void _onClosePanel;
    const label = title.trim() || "New Chat";

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <header className="relative flex h-[36px] shrink-0 items-center bg-panel">
                    <div className="relative z-10 flex min-w-0 flex-1 items-center pl-3 pr-1">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className={cn(
                                        "flex min-w-0 max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left",
                                        "text-sm font-normal text-text-primary",
                                        "outline-none hover:bg-panel-hover",
                                        "focus-visible:ring-1 focus-visible:ring-border-focus",
                                    )}
                                    aria-label={`${label} menu`}
                                >
                                    <FadeTruncate
                                        title={label}
                                        className="min-w-0 truncate"
                                    >
                                        {label}
                                    </FadeTruncate>
                                    <Icon
                                        name="expand_more"
                                        size={14}
                                        className="shrink-0 text-text-muted"
                                    />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuItem
                                    className="gap-2.5"
                                    onClick={onNewChat}
                                >
                                    <Icon name="add" size={16} className="text-text-secondary" />
                                    New Chat
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
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
