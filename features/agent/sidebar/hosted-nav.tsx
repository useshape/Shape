"use client";

import { RiArrowLeftLine, RiCloseLine } from "@remixicon/react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, ICON_SIZE_MD } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AGENT_SIDEBAR_BACK_SLOT } from "../chrome";

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
    const [slot, setSlot] = useState<HTMLElement | null>(() => {
        if (typeof document === "undefined") return null;
        const el = document.getElementById(AGENT_SIDEBAR_BACK_SLOT);
        return el && el.isConnected ? el : null;
    });

    useEffect(() => {
        const find = () => {
            const el = document.getElementById(AGENT_SIDEBAR_BACK_SLOT);
            setSlot(el && el.isConnected ? el : null);
        };
        find();
        const timer = window.setInterval(find, 80);
        const stop = window.setTimeout(() => window.clearInterval(timer), 2000);
        return () => {
            window.clearInterval(timer);
            window.clearTimeout(stop);
        };
    }, [collapsed]);

    const icon = closeIcon ? RiCloseLine : RiArrowLeftLine;

    if (slot && !collapsed) {
        return createPortal(
            <Tooltip content={label} side="bottom" delayDuration={80}>
                <button
                    type="button"
                    onClick={onBack}
                    aria-label={label}
                    className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
                >
                    <Icon icon={icon} />
                </button>
            </Tooltip>,
            slot,
        );
    }

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
                        <Icon icon={icon} />
                    </button>
                </Tooltip>
            </div>
        );
    }

    return (
        <div className="flex h-8 shrink-0 items-center px-2 mt-1.5 mb-2">
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onBack}
                aria-label={label}
                className="gap-2 px-1.5!"
            >
                <Icon icon={icon} size={ICON_SIZE_MD} />
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
