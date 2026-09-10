"use client";

import type { CSSProperties } from "react";
import type { RemixiconComponentType } from "@remixicon/react";
import { cn } from "@/lib/utils";

/** Matches `--icon-md`. Call sites should omit `size` unless they must scale (avatar, favicon). */
export const ICON_SIZE_MD = 17;
export const ICON_SIZE_SM = 14;
export const ICON_SIZE_XS = 12;

/** Smaller glyphs need a heavier stroke so they stay readable. */
function strokeForSize(size: number) {
    if (size <= 12) return 0.7;
    if (size <= 14) return 0.5;
    if (size <= 16) return 0.3;
    if (size <= 20) return 0.3;
    return 1.25;
}

/**
 * App chrome around a Remix glyph. Pass the real component from `@remixicon/react`
 * (`RiCloseLine`, `RiSideBarLine`, …) — not a website slug or string name.
 */
export function Icon({
    icon: Glyph,
    className,
    size = ICON_SIZE_MD,
    style,
}: {
    icon: RemixiconComponentType;
    className?: string;
    size?: number;
    style?: CSSProperties;
}) {
    return (
        <Glyph
            size={size}
            strokeWidth={strokeForSize(size)}
            className={cn("shape-icon shrink-0 rounded-xl", className)}
            style={{ ...style, ["--icon-size" as string]: `${size}px` }}
            aria-hidden
        />
    );
}
