"use client";

import { cn } from "@/lib/utils";

/** Replaceable glyph from `/public/design-icons/{name}.svg`. Painted with currentColor so any fill/stroke works. */
export function DesignAssetIcon({
    name,
    size = 14,
    className,
}: {
    name: string;
    size?: number;
    className?: string;
}) {
    const mask = `url(/design-icons/${name}.svg)`;
    return (
        <span
            aria-hidden
            className={cn("inline-block shrink-0 bg-current pointer-events-none", className)}
            style={{
                width: size,
                height: size,
                maskImage: mask,
                WebkitMaskImage: mask,
                maskSize: "contain",
                WebkitMaskSize: "contain",
                maskMode: "alpha",
                maskPosition: "center",
                WebkitMaskPosition: "center",
            }}
        />
    );
}
