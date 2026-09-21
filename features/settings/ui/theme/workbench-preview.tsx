"use client";

import { cn } from "@/lib/utils";
import type { ColorThemeId } from "@/lib/settings/themes";

/**
 * Theme card mockup: canvas to a window with sidebar and main panes,
 * shifted so it clips slightly outside the card.
 */
export function ThemeWorkbenchPreview({
    theme,
    className,
}: {
    theme: ColorThemeId;
    className?: string;
}) {
    const light = theme === "light";
    const canvas = light ? "#FFFFFF" : "#050505";
    const windowBg = light ? "#E6E6E6" : "#141414";
    const pane = light ? "#FFFFFF" : "#2e2e2e";

    return (
        <div
            data-theme={theme}
            aria-hidden
            className={cn("relative h-[100px] w-[200px] overflow-hidden", className)}
            style={{ background: canvas }}
        >
            {/* Shifted down + oversized so bottom and sides clip out of view */}
            <div
                className="absolute left-[15%] top-[20%] flex h-[100%] w-[92%] flex-col rounded-lg p-[3%]"
                style={{ background: windowBg }}
            >
                <div className="flex min-h-0 flex-1 gap-[2%]">
                    <div className="h-full w-[28%] shrink-0 rounded-md" style={{ background: pane }} />
                    <div className="h-full min-w-0 flex-1 rounded-md" style={{ background: pane }} />
                </div>
            </div>
        </div>
    );
}
