"use client";

import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Back / close control for settings, git, and files hosted in the agent sidebar. */
export function HostedSidebarBack({
    label,
    onBack,
    collapsed,
    closeIcon = false,
}: {
    label: string;
    onBack: () => void;
    collapsed?: boolean;
    /** Use close icon instead of back arrow (e.g. Git). */
    closeIcon?: boolean;
}) {
    if (collapsed) {
        return (
            <div className="flex shrink-0 flex-col items-center gap-1 px-1.5 pt-3">
                <Tooltip content={label} side="right" delayDuration={80}>
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label={label}
                        className="flex size-9 items-center justify-center rounded-md text-text-secondary transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon name={closeIcon ? "close" : "arrow_back"} size={18} />
                    </button>
                </Tooltip>
            </div>
        );
    }

    return (
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
            <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-text-secondary transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
            >
                <Icon name={closeIcon ? "close" : "arrow_back"} size={16} />
                <span>{label}</span>
            </button>
        </div>
    );
}

export function HostedSidebarShell({
    collapsed,
    children,
    className,
}: {
    collapsed?: boolean;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex h-full min-h-0 w-full flex-col overflow-hidden",
                collapsed && "items-center",
                className,
            )}
        >
            {children}
        </div>
    );
}
