"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared chat workflow row: action word + muted detail, no per-tool chrome. */
export function ActionLine({
    action,
    detail,
    extra,
    icon,
    onClick,
    className,
    title,
}: {
    action: string;
    detail?: ReactNode;
    extra?: ReactNode;
    icon?: ReactNode;
    onClick?: () => void;
    className?: string;
    title?: string;
}) {
    const interactive = Boolean(onClick);
    const Tag = interactive ? "button" : "div";
    return (
        <Tag
            type={interactive ? "button" : undefined}
            title={title}
            onClick={onClick}
            className={cn(
                "flex w-fit max-w-full items-center gap-1.5 py-0.5 text-left chat-text font-medium text-text-primary/80",
                interactive && "cursor-pointer hover:text-text-primary transition-colors",
                className,
            )}
        >
            {icon}
            <span className="min-w-0 truncate">
                {action}
                {detail ? (
                    <>
                        {" "}
                        <span className="text-text-secondary">{detail}</span>
                    </>
                ) : null}
            </span>
            {extra}
        </Tag>
    );
}
