"use client";

import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function ToolBtn({
    label,
    onClick,
    disabled,
    active,
    children,
}: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    active?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded text-text-muted",
                "hover:bg-panel-hover hover:text-text-primary",
                "disabled:pointer-events-none disabled:opacity-30",
                active && "text-text-primary",
            )}
        >
            {children}
        </button>
    );
}

export function WsIcon({ name }: { name: string }) {
    return <Icon name={name} size={ICON_SIZE_SM} />;
}
