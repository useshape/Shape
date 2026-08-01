"use client";

import { cn } from "@/lib/utils";
import { openSettingsWindow } from "@/lib/open-settings";
import { ChatHistoryMenu } from "@/features/chat/ui/shell/history";

const linkClass =
    "flex cursor-default select-none items-center rounded-md px-sm py-xs text-sm font-normal outline-none transition-colors hover:bg-panel-hover hover:text-text-primary focus:bg-panel-hover focus:text-text-primary";

export function AgentTitlebarNav() {
    return (
        <nav className="flex items-center" aria-label="Agent">
            <button
                type="button"
                className={cn(linkClass)}
                onClick={() => window.dispatchEvent(new Event("shape-agent-new-chat"))}
            >
                New chat
            </button>
            <ChatHistoryMenu
                variant="text"
                align="start"
                tooltip="Chat history"
                triggerClassName={linkClass}
            />
            <button
                type="button"
                className={cn(linkClass)}
                onClick={() => void openSettingsWindow({ category: "account" })}
            >
                Settings
            </button>
        </nav>
    );
}
