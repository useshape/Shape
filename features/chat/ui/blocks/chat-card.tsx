"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Collapse } from "./collapse";

/** Shared chat surface: muted fill, 2xl radius, expand happens inside. */
export function ChatCard({
    className,
    fit,
    children,
}: {
    className?: string;
    fit?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "my-1 overflow-hidden rounded-lg bg-surface-3",
                fit ? "w-fit max-w-full" : "w-full",
                className,
            )}
        >
            {children}
        </div>
    );
}

export function ChatCardHeader({
    className,
    children,
    onClick,
    disabled,
    fit,
}: {
    className?: string;
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    /** Shrink-wrap like MCP chips; omit on full-width plan/preview cards. */
    fit?: boolean;
}) {
    const clickable = Boolean(onClick) && !disabled;
    const Tag = clickable ? "button" : "div";
    return (
        <Tag
            {...(clickable ? { type: "button" as const } : {})}
            onClick={onClick}
            className={cn(
                "flex min-w-0 items-center gap-2 px-2.5 py-1 text-left",
                fit ? "w-max max-w-full" : "w-full",
                clickable && "hover:bg-panel-hover/60 cursor-pointer",
                className,
            )}
        >
            {children}
        </Tag>
    );
}

export function ChatCardBody({
    open,
    className,
    children,
}: {
    open: boolean;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <Collapse open={open}>
            <div className={cn("px-3 pb-3", className)}>{children}</div>
        </Collapse>
    );
}

export function ChatCardFooter({
    className,
    children,
}: {
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cn("flex items-center justify-end gap-1.5 px-2 pb-2", className)}>
            {children}
        </div>
    );
}

export function ActionPhrase({
    verb,
    detail,
}: {
    verb: React.ReactNode;
    detail?: React.ReactNode;
}) {
    return (
        <span className="min-w-0 truncate">
            <span className="text-text-primary">{verb}</span>
            {detail ? (
                <>
                    {" "}
                    <span className="text-text-muted">{detail}</span>
                </>
            ) : null}
        </span>
    );
}
