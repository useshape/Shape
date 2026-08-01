"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function StatusItem({
    label,
    children,
    onClick,
    className,
}: {
    label: string;
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
}) {
    return (
        <Tooltip content={label}>
            <button
                type="button"
                disabled={!onClick}
                onClick={onClick}
                className={cn(
                    "h-full px-2 text-xs font-normal text-text-primary hover:bg-panel-hover transition-colors",
                    !onClick && "cursor-default hover:bg-transparent",
                    className,
                )}
            >
                {children}
            </button>
        </Tooltip>
    );
}
