"use client";

import { RiTerminalBoxLine } from "@remixicon/react";
import React, { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

function ShortcutKeys({ keys }: { keys: string[] }) {
    return (
        <span className="ml-1.5 inline-flex items-center gap-0.5">
            {keys.map((key) => (
                <kbd
                    key={key}
                    className="inline-flex min-w-[1.1rem] items-center justify-center rounded px-1.5 py-px text-xs font-sans leading-none text-text-foreground"
                >
                    {key}
                </kbd>
            ))}
        </span>
    );
}

/** Shared chrome for edit / command / plugin approval cards. */
export function ApprovalCard({
    icon,
    title,
    trailing,
    children,
    footerLeft,
    skipLabel = "Skip",
    acceptLabel = "Allow",
    isProcessing,
    onSkip,
    onAccept,
    className,
}: {
    icon?: ReactNode;
    title: ReactNode;
    trailing?: ReactNode;
    children?: ReactNode;
    footerLeft?: ReactNode;
    skipLabel?: string;
    acceptLabel?: string;
    isProcessing?: boolean;
    onSkip: () => void;
    onAccept: () => void;
    className?: string;
}) {
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (isProcessing) return;
            const t = e.target as HTMLElement | null;
            if (t?.closest("textarea, input, [contenteditable='true']")) return;
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                onAccept();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [isProcessing, onAccept]);

    return (
        <div
            className={cn(
                "my-1 overflow-hidden rounded-xl border border-border-subtle bg-surface-3",
                className,
            )}
        >
            <div className="flex items-center gap-2 px-3 py-2">
                {isProcessing ? (
                    <div className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-text-muted border-t-transparent" />
                ) : (
                    icon
                )}
                <div className="min-w-0 flex-1">{title}</div>
                {trailing}
            </div>
            {children}
            <div className="flex items-center justify-between gap-2 px-2 py-2">
                <div className="min-w-0">{footerLeft}</div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <Button type="button" variant="ghost" size="xs" disabled={isProcessing} onClick={onSkip}>
                        {skipLabel}
                    </Button>
                    <Button type="button" variant="default" size="xs" disabled={isProcessing} onClick={onAccept}>
                        {acceptLabel}
                        <ShortcutKeys keys={["↵"]} />
                    </Button>
                </div>
            </div>
        </div>
    );
}

export type ApprovalBarProps = {
    label: string;
    subject: string;
    acceptLabel?: string;
    rejectLabel?: string;
    isProcessing?: boolean;
    onAccept: () => void;
    onReject: () => void;
    className?: string;
    /** Shown before the subject. Pass empty string to hide (plugin actions). */
    promptPrefix?: string;
};

/** Inline chat approval bar for pending terminal commands. */
export function ApprovalBar({
    label,
    subject,
    acceptLabel = "Run",
    rejectLabel = "Skip",
    isProcessing = false,
    onAccept,
    onReject,
    className,
    promptPrefix = "$ ",
}: ApprovalBarProps) {
    return (
        <ApprovalCard
            icon={<Icon icon={RiTerminalBoxLine} className="shrink-0 text-text-muted" />}
            title={label}
            isProcessing={isProcessing}
            onSkip={onReject}
            onAccept={onAccept}
            skipLabel={rejectLabel}
            acceptLabel={acceptLabel}
            className={className}
        >
            <div className="px-3 pb-2">
                <Tooltip content={subject} side="top">
                    <span className="block truncate font-mono text-sm text-text-primary">
                        {promptPrefix ? (
                            <span className="select-none text-text-disabled">{promptPrefix}</span>
                        ) : null}
                        {subject}
                    </span>
                </Tooltip>
            </div>
        </ApprovalCard>
    );
}
