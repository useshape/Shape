"use client";

import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useProjectState } from "@/lib/backend";
import { titlebarIconButtonClass } from "./layout-controls";

/**
 * Titlebar search — icon button that opens the command palette.
 * When a file is active, opens with an in-file search bias (Current file section).
 */
export function CommandOmnibar({ className }: { className?: string }) {
    const { active_file } = useProjectState();

    return (
        <Tooltip content="Search" side="bottom">
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
                className={cn("command-center", titlebarIconButtonClass, className)}
                aria-label="Open command palette"
            >
                <Icon name="search" size={16} />
            </button>
        </Tooltip>
    );
}

/** @deprecated Use CommandOmnibar — kept as alias for any residual imports. */
export const CommandCenterSearch = CommandOmnibar;
