"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const titlebarIconButtonClass =
    "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-text-secondary transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)] hover:bg-panel-hover hover:text-text-primary";

function TitlebarLayoutButton({
    label,
    active,
    onClick,
    children,
}: {
    label: string;
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <Tooltip content={label} side="bottom">
            <button
                type="button"
                data-no-drag
                aria-label={label}
                aria-pressed={active}
                onClick={onClick}
                className={cn(titlebarIconButtonClass, active && "text-text-primary")}
            >
                {children}
            </button>
        </Tooltip>
    );
}

export { titlebarIconButtonClass, TitlebarLayoutButton };
