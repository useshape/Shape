import React from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { providerIcon } from "@/lib/ui/provider-icon";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { SidebarSwitchPanelMenuItems } from "@/features/panels";

export function ChatHeader({
    activeTitle,
    selectedModel,
    onNewChat,
    onClose,
    onViewHistory,
    sidebarSide = "right",
}: {
    activeTitle: string;
    selectedModel: string;
    onNewChat: () => void;
    onClose?: () => void;
    onViewHistory: () => void;
    sidebarSide?: "left" | "right";
}) {
    const handleExpand = () => {
        window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "secondary-sidebar", value: true } }));
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <header className="flex items-center justify-between px-3 py-1 shrink-0 z-10 bg-panel cursor-default">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 flex items-center">{providerIcon(selectedModel, 16)}</span>
                        <span className="text-sm font-medium text-text-primary truncate font-sans">
                            {activeTitle}
                        </span>
                    </div>
                    <div className="flex items-center gap-0.5 ml-auto">
                        <Tooltip content="New Chat">
                            <Button onClick={onNewChat} variant="ghost" size="icon" className="h-6 w-6">
                                <Icon name="add" />
                            </Button>
                        </Tooltip>
                        <Tooltip content="Expand Chat">
                            <Button onClick={handleExpand} variant="ghost" size="icon" className="h-6 w-6">
                                <Icon name="open_in_new" />
                            </Button>
                        </Tooltip>
                        <Tooltip content="Chat History">
                            <Button onClick={onViewHistory} variant="ghost" size="icon" className="h-6 w-6">
                                <Icon name="history" />
                            </Button>
                        </Tooltip>

                        {onClose && (
                            <Tooltip content="Close Chat">
                                <Button onClick={onClose} variant="ghost" size="icon" className="h-6 w-6">
                                    <Icon name="close" />
                                </Button>
                            </Tooltip>
                        )}
                    </div>
                </header>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
                <SidebarSwitchPanelMenuItems currentSide={sidebarSide} currentPanelId="chat" />
            </ContextMenuContent>
        </ContextMenu>
    );
}
