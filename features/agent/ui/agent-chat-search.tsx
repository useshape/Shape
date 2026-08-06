"use client";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * Agent chrome search — opens the shared command palette on Agents
 * (same system as the IDE omnibar). In-chat jump can still use Ctrl+F later.
 */
export function AgentChatSearch({ className }: { className?: string }) {
    return (
        <button
            type="button"
            onClick={() => {
                window.dispatchEvent(
                    new CustomEvent("shape-command-palette", {
                        detail: {
                            filter: "agents",
                            placeholder: "Search agents, files, actions…",
                        },
                    }),
                );
            }}
            className={cn(
                "command-center flex h-[26px] w-[min(220px,28vw)] min-w-0 items-center gap-2 rounded-md border border-border px-2.5",
                "bg-transparent text-left transition-colors hover:bg-panel-hover",
                className,
            )}
            aria-label="Search agents"
        >
            <Icon name="search" size={13} className="shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate text-xs leading-none text-text-muted">
                Search…
            </span>
        </button>
    );
}
