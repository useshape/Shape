"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AGENT_SIDEBAR_BACK_SLOT } from "../chrome";

/** Back / close control — portals into the same row as the sidebar toggle. */
export function HostedSidebarBack({
    label,
    onBack,
    collapsed,
    closeIcon = false,
}: {
    label: string;
    onBack: () => void;
    collapsed?: boolean;
    closeIcon?: boolean;
}) {
    const [slot, setSlot] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const find = () => document.getElementById(AGENT_SIDEBAR_BACK_SLOT);
        const el = find();
        if (el) {
            setSlot(el);
            return;
        }
        let frames = 0;
        let raf = 0;
        const tick = () => {
            const next = find();
            if (next) {
                setSlot(next);
                return;
            }
            if (++frames < 90) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    if (collapsed) {
        const btn = (
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
        );
        return (
            <div className="flex h-10 shrink-0 flex-col items-center justify-center px-1.5">
                {btn}
            </div>
        );
    }

    const row = (
        <button
            type="button"
            onClick={onBack}
            aria-label={label}
            className={cn(
                "ml-auto flex size-8 shrink-0 items-center justify-center rounded-md text-text-secondary",
                "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                "hover:bg-panel-hover hover:text-text-primary",
            )}
        >
            <Icon name={closeIcon ? "close" : "arrow_back"} size={16} className="shrink-0" />
        </button>
    );

    if (slot) return createPortal(row, slot);
    return null;
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
