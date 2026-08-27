"use client";

import React, { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Collapse } from "./collapse";
import { ActionPhrase } from "./chat-card";

/**
 * Compact left-aligned service chip used by MCP, git, and terminal rows.
 * Header is shrink-wrapped; details expand inside the same surface.
 */
export function ServiceChip({
    leading,
    title,
    detail,
    trailing,
    expandable,
    defaultOpen = false,
    onClick,
    children,
    footer,
    className,
}: {
    leading?: React.ReactNode;
    title: React.ReactNode;
    detail?: React.ReactNode;
    trailing?: React.ReactNode;
    expandable?: boolean;
    defaultOpen?: boolean;
    onClick?: () => void;
    children?: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const canExpand = Boolean(expandable && (children || footer));
    const clickable = canExpand || Boolean(onClick);

    return (
        <div className={cn("my-1 w-max max-w-full overflow-hidden rounded-lg bg-surface-3", className)}>
            <button
                type="button"
                disabled={!clickable}
                onClick={() => {
                    if (canExpand) setOpen((v) => !v);
                    else onClick?.();
                }}
                className={cn(
                    "inline-flex max-w-full items-center gap-2 px-2 py-1 text-left",
                    clickable && "hover:bg-panel-hover/60 cursor-pointer",
                    !clickable && "cursor-default",
                )}
            >
                {leading ? (
                    <span className="flex size-4 shrink-0 items-center justify-center">{leading}</span>
                ) : null}
                <span className="min-w-0 truncate text-sm">
                    {typeof title === "string" || detail !== undefined ? (
                        <ActionPhrase verb={title} detail={detail} />
                    ) : (
                        title
                    )}
                </span>
                {trailing}
                {canExpand ? (
                    <Icon
                        name="expand_more"
                        size={14}
                        className={cn(
                            "shrink-0 text-text-muted transition-transform duration-[var(--chat-motion-duration,180ms)]",
                            open && "rotate-180",
                        )}
                    />
                ) : null}
            </button>
            {canExpand ? (
                <Collapse open={open}>
                    {children ? (
                        <div className="max-w-[min(100vw-4rem,28rem)] px-2.5 pb-2">{children}</div>
                    ) : null}
                    {footer ? <div className="px-2 pb-2">{footer}</div> : null}
                </Collapse>
            ) : null}
        </div>
    );
}
