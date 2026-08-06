"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * Titlebar omnibar — opens the command palette.
 * Hides when its parent slot is too narrow. Find-in-file stays on Ctrl+F.
 */
export function CommandOmnibar({ className }: { className?: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const measure = () => {
            // Hide under ~720px window width so menubar + controls don't collide.
            setVisible(window.innerWidth >= 860);
        };

        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, []);

    if (!visible) {
        return <div ref={containerRef} className="h-0 w-0 overflow-hidden" aria-hidden />;
    }

    return (
        <div ref={containerRef} className={cn("relative w-full min-w-0", className)}>
            <button
                type="button"
                onClick={() => {
                    window.dispatchEvent(
                        new CustomEvent("shape-command-palette", {
                            detail: { filter: "all", placeholder: "Search agents, files, actions..." },
                        }),
                    );
                }}
                className={cn(
                    "command-center flex h-[26px] w-full min-w-0 items-center gap-2 rounded-md border border-border px-2.5",
                    "bg-transparent text-left transition-colors hover:bg-panel-hover",
                )}
                aria-label="Search agents, files, actions"
            >
                <Icon name="search" size={13} className="shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate text-xs leading-none text-text-muted">
                    Search agents, files, actions...
                </span>
            </button>
        </div>
    );
}

/** @deprecated Use CommandOmnibar — kept as alias for any residual imports. */
export const CommandCenterSearch = CommandOmnibar;
