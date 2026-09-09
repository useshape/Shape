"use client";

import { RiArrowLeftLine, RiCloseLine } from "@remixicon/react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Back control at the top of hosted sidebar nav (settings / git). */
export function HostedSidebarBack({
    label = "Back to app",
    onBack,
    collapsed,
    closeIcon = false,
}: {
    label?: string;
    onBack: () => void;
    collapsed?: boolean;
    closeIcon?: boolean;
}) {
    if (collapsed) {
        return (
            <div className="flex h-10 shrink-0 items-center justify-center px-1.5">
                <Tooltip content={label} side="right" delayDuration={80}>
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label={label}
                        className="flex size-9 items-center justify-center rounded-md text-text-secondary transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary"
                    >
                        <Icon icon={closeIcon ? RiCloseLine : RiArrowLeftLine} />
                    </button>
                </Tooltip>
            </div>
        );
    }

    return (
        <div className="flex h-10 shrink-0 items-center px-2">
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onBack}
                aria-label={label}
                className="h-8 w-full justify-start gap-2 px-1.5! text-left"
            >
                <Icon icon={closeIcon ? RiCloseLine : RiArrowLeftLine} className="shrink-0" />
                <span className="min-w-0 truncate">{label}</span>
            </Button>
        </div>
    );
}

export function HostedSidebarShell({
    collapsed,
    children,
    className,
}: {
    collapsed?: boolean;
    children: ReactNode;
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
