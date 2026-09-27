"use client";

import React, { type ReactNode } from "react";
import { Arc } from "loading-dev";
import { cn } from "@/lib/utils";
import { ICON_SIZE_MD, ICON_SIZE_SM, SolarIcon } from "@/components/ui/icon";
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
                "my-1 overflow-hidden squircle-[20px] bg-surface-3",
                className,
            )}
        >
            <div className="flex items-center gap-2 px-3 py-2">
                {isProcessing ? (
                    <Arc size={12} className="shrink-0 text-text-muted" />
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
                        <SolarIcon name="arrow-to-down-left" size={ICON_SIZE_SM} />
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
            icon={<SolarIcon name="programming" size={ICON_SIZE_MD} className="text-text-muted" />}
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
