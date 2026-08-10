"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

function modKeyLabel(): string {
    if (typeof navigator === "undefined") return "Ctrl";
    return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}

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

export type ApprovalBarProps = {
    label: string;
    subject: string;
    acceptLabel?: string;
    rejectLabel?: string;
    isProcessing?: boolean;
    onAccept: () => void;
    onReject: () => void;
    className?: string;
};

/** Inline chat approval bar for pending terminal commands. */
export function ApprovalBar({
    label,
    subject,
    acceptLabel = "Run",
    rejectLabel = "Reject",
    isProcessing = false,
    onAccept,
    onReject,
    className,
}: ApprovalBarProps) {
    const mod = modKeyLabel();

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (isProcessing) return;
            const t = e.target as HTMLElement | null;
            if (t?.closest("textarea, input, [contenteditable='true']")) return;

            const isMod = e.metaKey || e.ctrlKey;
            if (isMod && e.key === "Enter" && !e.shiftKey) {
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
                "my-1 overflow-hidden rounded-xl border border-border bg-transparent",
                className,
            )}
        >
            <div className="flex items-center gap-2 px-3 py-2">
                {isProcessing ? (
                    <div className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-text-muted border-t-transparent" />
                ) : (
                    <Icon name="terminal" size={13} className="shrink-0 text-text-muted" />
                )}
                <span className="shrink-0 text-xs text-text-muted">{label}</span>
            </div>
            <div className="border-t border-border px-3 py-2">
                <Tooltip content={subject} side="top">
                    <span className="block truncate font-mono text-sm text-text-primary">
                        <span className="select-none text-text-disabled">$ </span>
                        {subject}
                    </span>
                </Tooltip>
            </div>
            <div className="flex items-center justify-end gap-1.5 px-2 py-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={isProcessing}
                    onClick={onReject}
                >
                    {rejectLabel}
                </Button>
                <Button
                    type="button"
                    variant="default"
                    size="xs"
                    disabled={isProcessing}
                    onClick={onAccept}
                >
                    {acceptLabel}
                    <ShortcutKeys keys={[mod, "↵"]} />
                </Button>
            </div>
        </div>
    );
}
