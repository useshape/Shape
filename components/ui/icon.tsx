"use client";

import "@fluentui/react-icons/headless/styles.css";

import type { CSSProperties, ComponentType } from "react";
import { cn } from "@/lib/utils";

export type IconGlyph = ComponentType<{
    className?: string;
    style?: CSSProperties;
    "aria-hidden"?: boolean | "true" | "false";
}>;

/** Fluent glyph. Size follows `--icon-size`. */
export function Icon({
    icon: Glyph,
    className,
    style,
}: {
    icon: IconGlyph;
    className?: string;
    style?: CSSProperties;
}) {
    return (
        <Glyph
            className={cn("shape-icon shrink-0", className)}
            style={{
                width: "var(--icon-size)",
                height: "var(--icon-size)",
                ...style,
            }}
            aria-hidden
        />
    );
}
