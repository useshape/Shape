"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ShapeLogo } from "@/components/ui/shape-logo";
import { cn } from "@/lib/utils";
import { GitMarkdown, type GitMarkdownCtx } from "@/features/git/ui/github/markdown";

/** In-pane AI result card. Errors are notified only — never rendered here. */
export function GitAiInsight({
    title,
    content,
    onDismiss,
    className,
    mdCtx,
}: {
    title: string;
    content?: string | null;
    onDismiss?: () => void;
    className?: string;
    mdCtx?: GitMarkdownCtx;
}) {
    if (!content?.trim()) return null;

    return (
        <div
            className={cn(
                "overflow-hidden rounded-xl border border-border-subtle bg-panel/40",
                className,
            )}
        >
            <div className="flex items-center gap-2 px-2 py-1">
                <ShapeLogo size={14} className="shrink-0" />
                <span className="text-sm font-medium text-text-primary">{title}</span>
                {onDismiss ? (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto text-text-muted"
                        onClick={onDismiss}
                        aria-label="Dismiss"
                    >
                        <Icon name="close" size={14} />
                    </Button>
                ) : null}
            </div>
            <div className="min-w-0 overflow-x-auto px-3 py-3">
                <GitMarkdown content={content} ctx={mdCtx} />
            </div>
        </div>
    );
}
