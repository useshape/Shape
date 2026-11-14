"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Single-line label that fades at the trailing edge when content overflows.
 * Short labels stay fully opaque; long ones, resize, zoom, and RTL are handled.
 */
export function FadeTruncate({
    children,
    className,
    title,
    expanded = false,
}: {
    children: React.ReactNode;
    className?: string;
    title?: string;
    /** Drop the fade and show the full text, used while the row is hovered. */
    expanded?: boolean;
}) {
    const ref = useRef<HTMLSpanElement>(null);
    const [overflowing, setOverflowing] = useState(false);

    const measure = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        // 1px slack avoids flicker from subpixel rounding
        setOverflowing(el.scrollWidth > el.clientWidth + 1);
    }, []);

    useLayoutEffect(() => {
        measure();
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => measure());
        ro.observe(el);
        if (el.parentElement) ro.observe(el.parentElement);
        return () => ro.disconnect();
    }, [measure, children, title]);

    return (
        <span
            ref={ref}
            className={cn(
                "block min-w-0",
                expanded ? "whitespace-normal" : "overflow-hidden whitespace-nowrap",
                overflowing &&
                    !expanded &&
                    "[mask-image:linear-gradient(to_right,black_0%,black_calc(100%-1.25rem),transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,black_0%,black_calc(100%-1.25rem),transparent_100%)] rtl:[mask-image:linear-gradient(to_left,black_0%,black_calc(100%-1.25rem),transparent_100%)] rtl:[-webkit-mask-image:linear-gradient(to_left,black_0%,black_calc(100%-1.25rem),transparent_100%)]",
                className,
            )}
        >
            {children}
        </span>
    );
}
