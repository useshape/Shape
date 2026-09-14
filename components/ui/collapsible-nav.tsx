"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared animated nav group used by Git Manager, Settings, and Stats sidebars. */
export function CollapsibleNavGroup({
    label,
    open,
    onToggle,
    children,
}: {
    label: string;
    open: boolean;
    onToggle: () => void;
    children: ReactNode;
}) {
    return (
        <div>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className="flex h-8 w-full items-center gap-3 rounded-md px-1.5 text-left text-sm font-medium text-text-muted hover:bg-panel-hover/40 hover:text-text-primary"
            >
                <span className="min-w-0 truncate">{label}</span>
            </button>
            <div
                className={cn(
                    "grid transition-[grid-template-rows,opacity] duration-200 ease-[var(--ease-out)]",
                    open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
            >
                <div className="min-h-0 overflow-hidden">
                    <div className="space-y-0.5 pb-0.5">{children}</div>
                </div>
            </div>
        </div>
    );
}

export function NavLeafButton({
    active,
    onClick,
    children,
    className,
    disabled,
}: {
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
}) {
    return (
        <Button
            variant="ghost"
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "h-8 w-full justify-start gap-3 px-1.5! font-normal",
                active
                    ? "bg-panel-hover text-text-primary"
                    : "text-text-secondary hover:bg-panel-hover/60 hover:text-text-primary",
                disabled && "pointer-events-none opacity-40",
                className,
            )}
        >
            {children}
        </Button>
    );
}
