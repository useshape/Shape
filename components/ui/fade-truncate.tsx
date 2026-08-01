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
}: {
    children: React.ReactNode;
    className?: string;
    title?: string;
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
            title={title}
            className={cn(
                "block min-w-0 overflow-hidden whitespace-nowrap",
                overflowing &&
                    "[mask-image:linear-gradient(to_right,black_0%,black_calc(100%-1.25rem),transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,black_0%,black_calc(100%-1.25rem),transparent_100%)] rtl:[mask-image:linear-gradient(to_left,black_0%,black_calc(100%-1.25rem),transparent_100%)] rtl:[-webkit-mask-image:linear-gradient(to_left,black_0%,black_calc(100%-1.25rem),transparent_100%)]",
                className,
            )}
        >
            {children}
        </span>
    );
}
