"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const activityBarClassName =
    "flex flex-col items-stretch w-[36px] h-full shrink-0 overflow-y-auto no-scrollbar";

const itemClassName =
    "group relative flex items-center justify-center w-full h-9 shrink-0 border-none bg-transparent p-0 outline-none cursor-pointer text-white/52 hover:text-white transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]";

const iconClassName =
    "flex items-center justify-center size-7 rounded-sm transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] group-hover:bg-white/10 group-[.is-active]:bg-white/10";

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
                className={cn(itemClassName, active && "is-active text-white")}
            >
                <span className={iconClassName}>{children}</span>
                {badge}
            </button>
        </Tooltip>
    );
}
