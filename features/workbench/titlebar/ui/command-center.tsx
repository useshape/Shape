"use client";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useProjectState } from "@/lib/backend";

/**
 * Titlebar omnibar — opens the command palette.
 * When a file is active, opens with an in-file search bias (Current file section).
 * Width/visibility is owned by the parent chrome (shrink → hide).
 */
export function CommandOmnibar({ className }: { className?: string }) {
    const { active_file } = useProjectState();

    return (
        <div className={cn("relative w-full min-w-0", className)}>
            <button
                type="button"
                onClick={() => {
                    window.dispatchEvent(
                        new CustomEvent("shape-command-palette", {
                            detail: {
                                filter: "all",
                                activeFile: active_file || undefined,
                                placeholder: active_file
                                    ? "Search in file, agents, actions…"
                                    : "Search agents, files, actions…",
                            },
                        }),
                    );
                }}
                className={cn(
                    "command-center flex h-[26px] w-full min-w-0 items-center gap-2 rounded-md border border-border px-2.5",
                    "bg-transparent text-left transition-colors hover:bg-panel-hover",
                )}
                aria-label="Open command palette"
            >
                <Icon name="search" size={13} className="shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate text-xs leading-none text-text-muted">
                    {active_file
                        ? `Search ${active_file.split(/[\\/]/).pop()}…`
                        : "Search agents, files, actions…"}
                </span>
            </button>
        </div>
    );
}

/** @deprecated Use CommandOmnibar — kept as alias for any residual imports. */
export const CommandCenterSearch = CommandOmnibar;
