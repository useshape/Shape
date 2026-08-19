"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const activityBarClassName =
    "flex flex-col items-stretch w-[36px] h-full shrink-0 overflow-y-auto no-scrollbar";

const itemClassName =
    "group relative flex w-full h-9 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-text-muted outline-none transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:text-text-primary";

const iconClassName =
    "flex size-7 items-center justify-center rounded-sm transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] group-hover:bg-panel-hover group-[.is-active]:bg-panel-hover";

export function ActivityBarItem({
    label,
    active,
    onClick,
    children,
    badge,
    tooltipSide = "right",
}: {
    label: string;
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    badge?: React.ReactNode;
    tooltipSide?: "left" | "right";
}) {
    return (
        <Tooltip content={label} side={tooltipSide}>
            <button
                type="button"
                role="tab"
                aria-label={label}
                aria-selected={active}
                onClick={onClick}
                className={cn(itemClassName, active && "is-active text-text-primary")}
            >
                <span className={iconClassName}>{children}</span>
                {badge}
            </button>
        </Tooltip>
    );
}
