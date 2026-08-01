"use client";

import { cn } from "@/lib/utils";
import { closeAgentWindow, openAgentWindow } from "@/lib/open-agent-window";

export type WorkbenchMode = "editor" | "agent";

export function TitlebarModeSwitch({ activeMode }: { activeMode: WorkbenchMode }) {
    const selectEditor = () => {
        if (activeMode === "editor") return;
        void closeAgentWindow();
    };

    const selectAgent = () => {
        if (activeMode === "agent") return;
        void openAgentWindow();
    };

    return (
        <div className="flex h-7 shrink-0 items-center rounded-lg bg-panel p-0.5">
            <button
                type="button"
                onClick={selectAgent}
                className={cn(
                    "h-6 rounded-md px-3 text-xs font-medium transition-colors",
                    activeMode === "agent"
                        ? "bg-panel-hover text-text-primary"
                        : "text-text-muted hover:text-text-secondary",
                )}
            >
                Agent
            </button>
            <button
                type="button"
                onClick={selectEditor}
                className={cn(
                    "h-6 rounded-md px-3 text-xs font-medium transition-colors",
                    activeMode === "editor"
                        ? "bg-panel-hover text-text-primary"
                        : "text-text-muted hover:text-text-secondary",
                )}
            >
                Editor
            </button>
        </div>
    );
}
