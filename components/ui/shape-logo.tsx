"use client";

import { cn } from "@/lib/utils";

const LOGO_ASPECT_RATIO = 56 / 46;

export function ShapeLogo({
    size = 32,
    className,
}: {
    size?: number;
    className?: string;
}) {
    const height = Math.round(size * LOGO_ASPECT_RATIO);
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src="/logos/logo.svg"
            alt="Shape"
            width={size}
            height={height}
            style={{
                width: size,
                height: "auto",
                minWidth: size,
                minHeight: height,
                maxWidth: size,
                maxHeight: height,
            }}
            className={cn("logo-invert shrink-0", className)}
            draggable={false}
        />
    );
}
