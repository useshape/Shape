"use client";

import { ArrowEnter20Filled } from "@fluentui/react-icons/headless/svg/arrow-enter";
import { WindowConsole20Regular } from "@fluentui/react-icons/headless/svg/window-console";



import React, { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";


import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

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
                "my-1 overflow-hidden squircle-2xl border border-border",
                className,
            )}
        >
            <div className="flex items-center gap-2 px-3 py-2">
                {isProcessing ? (
                    <span className="imsg-typing imsg-typing-sm shrink-0" aria-hidden>
                        <span />
                        <span />
                        <span />
                    </span>
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
                    <Button type="button" variant="ghost" size="sm" disabled={isProcessing} onClick={onSkip}>
                        {skipLabel}
                    </Button>
                    <Button type="button" variant="default" size="sm" disabled={isProcessing} onClick={onAccept}>
                        {acceptLabel}
                        <Icon icon={ArrowEnter20Filled} />
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

/** Square command/code well inside an approval card — not clipped to the card squircle. */
export function ApprovalCode({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-none bg-panel px-3 py-2 font-mono text-sm leading-5 text-text-primary whitespace-pre-wrap break-words custom-scrollbar",
                className,
            )}
        >
            {children}
        </div>
    );
}

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
            icon={<Icon icon={WindowConsole20Regular} className="text-text-muted" />}
            title={label}
            isProcessing={isProcessing}
            onSkip={onReject}
            onAccept={onAccept}
            skipLabel={rejectLabel}
            acceptLabel={acceptLabel}
            className={className}
        >
            <ApprovalCode className="max-h-[96px] overflow-y-auto">
                <Tooltip content={subject} side="top">
                    <span className="block truncate">
                        {promptPrefix ? (
                            <span className="select-none text-text-disabled">{promptPrefix}</span>
                        ) : null}
                        {subject}
                    </span>
                </Tooltip>
            </ApprovalCode>
        </ApprovalCard>
    );
}
