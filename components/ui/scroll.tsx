"use client";

import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";

type ScrollAreaProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    /** Soft top/bottom fade when content overflows (default true). */
    fadeEdges?: boolean;
    /** Tailwind `from-*` class for fade color. Default matches editor surface. */
    fadeFrom?: string;
};

export const ScrollArea = React.forwardRef<
    React.ElementRef<typeof ScrollAreaPrimitive.Root>,
    ScrollAreaProps
>(({ className, type = "hover", fadeEdges = true, fadeFrom = "from-editor", children, ...props }, ref) => {
    const viewportRef = React.useRef<HTMLDivElement>(null);
    const [showTop, setShowTop] = React.useState(false);
    const [showBottom, setShowBottom] = React.useState(false);

    const updateFades = React.useCallback(() => {
        const el = viewportRef.current;
        if (!el || !fadeEdges) {
            setShowTop(false);
            setShowBottom(false);
            return;
        }
        const { scrollTop, scrollHeight, clientHeight } = el;
        const overflow = scrollHeight > clientHeight + 2;
        setShowTop(overflow && scrollTop > 4);
        setShowBottom(overflow && scrollTop + clientHeight < scrollHeight - 4);
    }, [fadeEdges]);

    React.useEffect(() => {
        const el = viewportRef.current;
        if (!el || !fadeEdges) return;
        updateFades();
        el.addEventListener("scroll", updateFades, { passive: true });
        const ro = new ResizeObserver(() => updateFades());
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        return () => {
            el.removeEventListener("scroll", updateFades);
            ro.disconnect();
        };
    }, [fadeEdges, updateFades, children]);

    return (
        <ScrollAreaPrimitive.Root
            ref={ref}
            type={type}
            className={cn("relative overflow-hidden", className)}
            {...props}
        >
            {/* Radix sets an inner wrapper to display:table which breaks flex width — force block. */}
            <ScrollAreaPrimitive.Viewport
                ref={viewportRef}
                className="h-full min-h-0 w-full rounded-[inherit] [&>div]:block! [&>div]:min-w-0! [&>div]:w-full!"
            >
                {children}
            </ScrollAreaPrimitive.Viewport>
            {fadeEdges ? (
                <>
                    <div
                        aria-hidden
                        className={cn(
                            "pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-linear-to-b to-transparent transition-opacity duration-150",
                            fadeFrom,
                            showTop ? "opacity-100" : "opacity-0",
                        )}
                    />
                    <div
                        aria-hidden
                        className={cn(
                            "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-linear-to-t to-transparent transition-opacity duration-150",
                            fadeFrom,
                            showBottom ? "opacity-100" : "opacity-0",
                        )}
                    />
                </>
            ) : null}
            <ScrollBar />
            <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>
    );
});

ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
    React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
    React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
        ref={ref}
        orientation={orientation}
        className={cn(
            "flex touch-none select-none transition-colors",
            orientation === "vertical" && "h-full w-1.5 border-l border-l-transparent p-px",
            orientation === "horizontal" && "h-1.5 flex-col border-t border-t-transparent p-px",
            className,
        )}
        {...props}
    >
        <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-scrollbar hover:bg-scrollbar-hover" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
));

ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;
