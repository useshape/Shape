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
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src="/logos/logo.svg"
            alt="Shape"
            width={size}
            height={Math.round(size * LOGO_ASPECT_RATIO)}
            style={{ width: size, height: "auto" }}
            className={cn("shrink-0", className)}
            draggable={false}
        />
    );
}
