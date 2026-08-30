"use client";

import { cn } from "@/lib/utils";
import type { ColorThemeId } from "@/lib/themes";

/**
 * Minimal theme card mockup: outer window + sidebar strip + main pane.
 * Offset to the top-left — no fake text, no centered chrome.
 */
export function ThemeWorkbenchPreview({
    theme,
    className,
}: {
    theme: ColorThemeId;
    className?: string;
}) {
    const light = theme === "light";
    const windowBg = light ? "#f4f4f5" : "#1a1a1a";
    const sidebarBg = light ? "#e8e8ea" : "#141414";
    const mainBg = light ? "#ffffff" : "#222222";
    const border = light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";

    return (
        <div
            data-theme={theme}
            aria-hidden
            className={cn("relative h-[72px] w-full overflow-hidden rounded-xl", className)}
            style={{ background: light ? "#ececee" : "#0f0f0f" }}
        >
            {/* Offset window — top-left aligned, not centered */}
            <div
                className="absolute left-2.5 top-2.5 flex h-[78%] w-[78%] overflow-hidden rounded-lg"
                style={{ background: windowBg, boxShadow: `inset 0 0 0 1px ${border}` }}
            >
                <div className="h-full w-[22%] shrink-0" style={{ background: sidebarBg }} />
                <div className="h-full min-w-0 flex-1" style={{ background: mainBg }} />
            </div>
        </div>
    );
}
