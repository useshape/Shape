"use client";

import { ChevronRight20Regular } from "@fluentui/react-icons/headless/svg/chevron-right";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { Favicon } from "@/components/ui/favicon";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { cn } from "@/lib/utils";
import { Collapse } from "./collapse";

const MARK_LIMIT = 4;

/** First word of a sentence is the action; the rest is muted detail. */
export function splitActionLabel(sentence: string): { action: string; detail?: string } {
    const text = sentence.trim();
    const split = text.indexOf(" ");
    if (split === -1) return { action: text };
    return { action: text.slice(0, split), detail: text.slice(split + 1) };
}

/**
 * One workflow row. The action word is the lighter lead; detail, counts,
 * site marks, and a collapse body are optional slots on that same line.
 */
export function ActionLine({
    action,
    detail,
    add = 0,
    del = 0,
    favicons,
    icon,
    extra,
    onClick,
    children,
    open,
    defaultOpen = false,
    onOpenChange,
    shimmer = false,
    className,
    title,
}: {
    action: string;
    detail?: ReactNode;
    add?: number;
    del?: number;
    favicons?: string[];
    icon?: ReactNode;
    extra?: ReactNode;
    onClick?: () => void;
    children?: ReactNode;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    shimmer?: boolean;
    className?: string;
    title?: string;
}) {
    const [uncontrolled, setUncontrolled] = useState(defaultOpen);
    const isOpen = open ?? uncontrolled;
    const collapsible = children != null && children !== false;
    const interactive = collapsible || Boolean(onClick);
    const marks = [...new Set((favicons ?? []).filter(Boolean))].slice(0, MARK_LIMIT);

    const toggle = () => {
        const next = !isOpen;
        onOpenChange?.(next);
        if (open === undefined) setUncontrolled(next);
    };

    const Tag = interactive ? "button" : "div";

    return (
        <div>
            <Tag
                type={interactive ? "button" : undefined}
                title={title}
                onClick={
                    interactive
                        ? () => {
                              if (collapsible) toggle();
                              else onClick?.();
                          }
                        : undefined
                }
                className={cn(
                    "group/line flex w-fit max-w-full items-center gap-1.5 py-0.5 text-left chat-text font-normal text-text-muted",
                    interactive && "cursor-pointer",
                    className,
                )}
            >
                {icon}
                <span className="min-w-0 truncate">
                    <span className={cn("text-text-secondary", interactive && "group-hover/line:text-text-primary")}>
                        {shimmer ? <ShimmerText>{action}</ShimmerText> : action}
                    </span>
                    {detail ? <span className="text-text-muted"> {detail}</span> : null}
                </span>
                {marks.length > 0 ? (
                    <span className="inline-flex shrink-0 items-center -space-x-1.5">
                        {marks.map((url) => (
                            <span
                                key={url}
                                className="inline-flex size-4 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-panel"
                            >
                                <Favicon url={url} size={12} />
                            </span>
                        ))}
                    </span>
                ) : null}
                {add > 0 || del > 0 ? (
                    <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                        {add > 0 ? <span className="text-success">+{add}</span> : null}
                        {del > 0 ? <span className="text-error">-{del}</span> : null}
                    </span>
                ) : null}
                {extra}
                {collapsible ? (
                    <Icon
                        icon={ChevronRight20Regular}
                        className={cn(
                            "shrink-0 text-text-muted opacity-50 transition-transform duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                            isOpen && "rotate-90",
                        )}
                    />
                ) : null}
            </Tag>
            {collapsible ? <Collapse open={isOpen}>{children}</Collapse> : null}
        </div>
    );
}
