"use client";

import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type MorphMenuVariant = "default" | "morph";

/**
 * Pill trigger → panel.
 *
 * - `variant="default"` — static pill + absolute popover (no size tween)
 * - `variant="morph"` — transitions.dev PlusMenu size/radius morph
 *
 * Same idea as `Button variant="ghost"`: opt in per instance.
 *
 * @example
 * <MorphMenu variant="morph" trigger={<>Changes</>}>
 *   …menu body…
 * </MorphMenu>
 */
export function MorphMenu({
    trigger,
    children,
    className,
    openWidth = 280,
    openHeight = 200,
    closedHeight = 32,
    align = "start",
    variant = "default",
    /** @deprecated use `variant="morph"` */
    morph = false,
    "aria-label": ariaLabel = "Open menu",
}: {
    trigger: ReactNode;
    children: ReactNode;
    className?: string;
    openWidth?: number;
    openHeight?: number;
    closedHeight?: number;
    align?: "start" | "end";
    variant?: MorphMenuVariant;
    /** @deprecated use `variant="morph"` */
    morph?: boolean;
    "aria-label"?: string;
}) {
    const useMorph = variant === "morph" || morph;
    const ref = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLSpanElement>(null);
    const [open, setOpen] = useState(false);
    const [closedW, setClosedW] = useState<number | null>(null);
    // Lock open size while open so content reflow doesn't jump mid-morph.
    const lockedOpen = useRef({ w: openWidth, h: openHeight });

    useLayoutEffect(() => {
        if (!useMorph || !measureRef.current) return;
        const el = measureRef.current;
        const measure = () => {
            const w = Math.ceil(el.getBoundingClientRect().width);
            if (w > 0) setClosedW((prev) => (prev === w ? prev : w));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [useMorph, trigger]);

    useEffect(() => {
        if (open) return;
        lockedOpen.current = { w: openWidth, h: openHeight };
    }, [open, openWidth, openHeight]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    if (!useMorph) {
        return (
            <div ref={ref} className={cn("relative", className)}>
                <button
                    type="button"
                    aria-expanded={open}
                    aria-label={ariaLabel}
                    onClick={() => setOpen((v) => !v)}
                    className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface-3 px-3 text-sm text-text-secondary",
                        "hover:bg-panel-hover hover:text-text-primary",
                        open && "bg-panel-active text-text-primary",
                    )}
                >
                    {trigger}
                </button>
                {open ? (
                    <div
                        className={cn(
                            "absolute bottom-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-border bg-surface-3 shadow-md",
                            align === "end" ? "right-0" : "left-0",
                        )}
                        style={{ width: openWidth, maxHeight: openHeight }}
                        role="menu"
                    >
                        <div className="custom-scrollbar max-h-full overflow-y-auto">{children}</div>
                    </div>
                ) : null}
            </div>
        );
    }

    const ready = closedW != null;
    const wClosed = closedW ?? 96;
    const wOpen = open ? lockedOpen.current.w : openWidth;
    const hOpen = open ? lockedOpen.current.h : openHeight;
    // Half of closed height = true pill. Never 9999px (browsers glitch interpolating it).
    const rClosed = closedHeight / 2;
    const rOpen = 16;

    return (
        <div className={cn("relative inline-flex items-end", className)}>
            {/* Natural-width sizer (not constrained by --morph-w-closed). */}
            <span
                ref={measureRef}
                aria-hidden
                className="pointer-events-none invisible absolute inline-flex h-8 items-center gap-1.5 whitespace-nowrap px-4 text-sm font-medium"
            >
                {trigger}
            </span>
            <div
                ref={ref}
                className="t-morph bg-surface-3"
                data-open={open ? "true" : "false"}
                data-align={align}
                data-ready={ready ? "true" : "false"}
                style={
                    {
                        "--morph-w-closed": `${wClosed}px`,
                        "--morph-h-closed": `${closedHeight}px`,
                        "--morph-w-open": `${wOpen}px`,
                        "--morph-h-open": `${hOpen}px`,
                        "--morph-r-closed": `${rClosed}px`,
                        "--morph-r-open": `${rOpen}px`,
                    } as CSSProperties
                }
            >
                <div className="t-morph-menu custom-scrollbar" role="menu">
                    {children}
                </div>
                <button
                    type="button"
                    className="t-morph-plus text-sm text-text-secondary"
                    aria-expanded={open}
                    aria-label={ariaLabel}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!open) lockedOpen.current = { w: openWidth, h: openHeight };
                        setOpen((v) => !v);
                    }}
                >
                    {trigger}
                </button>
            </div>
        </div>
    );
}
