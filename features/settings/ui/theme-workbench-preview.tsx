"use client";

import { cn } from "@/lib/utils";
import type { ColorThemeId } from "@/lib/themes";

/**
 * Compact theme preview: sidebar + editor only.
 * Text skeletons use one muted color so the card reads as a layout, not fake syntax.
 */
export function ThemeWorkbenchPreview({
    theme,
    className,
}: {
    theme: ColorThemeId;
    className?: string;
}) {
    return (
        <div
            data-theme={theme === "dark" ? undefined : theme}
            aria-hidden
            className={cn(
                "relative h-20 w-full overflow-hidden rounded-lg border border-border-subtle bg-background",
                className,
            )}
        >
            <div className="flex h-full w-full">
                <div className="flex min-w-0 flex-1 flex-col bg-editor">
                    <div className="h-3.5 shrink-0 border-b border-border-subtle bg-panel" />
                    <div className="flex flex-col gap-1.5 px-2.5 py-2.5">
                        <div className="h-1 w-[42%] rounded-sm bg-text-muted/20" />
                        <div className="h-1 w-[48%] rounded-sm bg-text-muted/20" />
                        <div className="h-1 w-[22%] rounded-sm bg-text-muted/20" />
                        <div className="h-1 w-[34%] rounded-sm bg-text-muted/20" />
                        <div className="h-1 w-[46%] rounded-sm bg-text-muted/20" />
                    </div>
                </div>
            </div>
        </div>
    );
}
