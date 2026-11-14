"use client";

import { ChevronRight20Regular } from "@fluentui/react-icons/headless/svg/chevron-right";

import { useState, type AnimationEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { Favicon } from "@/components/ui/favicon";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { cn } from "@/lib/utils";
import { hostnameOf } from "@/lib/ui/favicon";
import { Collapse } from "./collapse";
import { FadeTruncate } from "@/components/ui/fade-truncate";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown";

const MARK_LIMIT = 4;

function uniqueFaviconHosts(urls: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const url of urls) {
        const host = hostnameOf(url) || url.trim();
        if (!host || seen.has(host)) continue;
        seen.add(host);
        out.push(url);
    }
    return out;
}

/** Fade and sheen a label the first time its row mounts, same motion as a new chat tab. */
export function ArriveLabel({ text, className, children }: { text: string; className?: string; children: ReactNode }) {
    const [shown, setShown] = useState(text);
    const [epoch, setEpoch] = useState(0);
    const [done, setDone] = useState(false);
    if (text !== shown) {
        // A label that only grows ("Reading ap" → "Reading app.tsx") should not
        // restart the sheen on every token. A new verb ("Reading" → "Generating") should.
        const grew = shown.length > 0 && text.startsWith(shown) && text.length - shown.length < 32;
        setShown(text);
        if (!grew) {
            setEpoch((n) => n + 1);
            setDone(false);
        }
    }
    const finish = (event: AnimationEvent<HTMLSpanElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.animationName !== "chat-name-sheen" && event.animationName !== "chat-name-reveal") return;
        setDone(true);
    };
    return (
        <span
            key={epoch}
            data-shine={done ? undefined : text}
            className={cn("inline-block max-w-full", className, !done && "chat-name-reveal relative")}
            onAnimationEnd={finish}
        >
            {children}
        </span>
    );
}

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
    menu,
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
    /** Real menu for this whole row. The row is the trigger. */
    menu?: ReactNode;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    shimmer?: boolean;
    className?: string;
    title?: string;
}) {
    const [uncontrolled, setUncontrolled] = useState(defaultOpen);
    const [hovered, setHovered] = useState(false);
    const isOpen = open ?? uncontrolled;
    const hasMenu = menu != null;
    const collapsible = !hasMenu && children != null && children !== false;
    const interactive = collapsible || Boolean(onClick) || hasMenu;
    const marks = uniqueFaviconHosts(favicons ?? []).slice(0, MARK_LIMIT);

    const toggle = () => {
        const next = !isOpen;
        onOpenChange?.(next);
        if (open === undefined) setUncontrolled(next);
    };

    const Tag = interactive ? "button" : "div";
    const rowClass = cn(
        "group/line flex w-fit max-w-full items-center gap-1.5 py-0.5 text-left chat-text font-normal text-text-muted",
        interactive && "cursor-pointer",
        shimmer && "tool-arrive",
        className,
    );
    const row = (
            <Tag
                type={interactive ? "button" : undefined}
                title={title}
                onClick={
                    hasMenu
                        ? undefined
                        : interactive
                          ? () => {
                                if (collapsible) toggle();
                                else onClick?.();
                            }
                          : undefined
                }
                className={rowClass}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                {icon}
                <FadeTruncate expanded={hovered} className="min-w-0 max-w-full">
                    <ArriveLabel
                        text={typeof detail === "string" && detail ? `${action} ${detail}` : action}
                        className={cn("text-text-secondary", interactive && "group-hover/line:text-text-primary")}
                    >
                        {shimmer ? <ShimmerText>{action}</ShimmerText> : action}
                        {detail ? <span className="text-text-muted"> {detail}</span> : null}
                    </ArriveLabel>
                </FadeTruncate>
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
                            "shrink-0 text-text-muted icon-sm transition-transform duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                            isOpen && "rotate-90",
                        )}
                    />
                ) : null}
            </Tag>
    );

    return (
        <div className="w-full min-w-0">
            {hasMenu ? (
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>{row}</DropdownMenuTrigger>
                    {menu}
                </DropdownMenu>
            ) : (
                row
            )}
            {collapsible ? <Collapse open={isOpen}>{children}</Collapse> : null}
        </div>
    );
}
