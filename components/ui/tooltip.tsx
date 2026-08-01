"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
    React.ElementRef<typeof TooltipPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, children, ...props }, ref) => (
    <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            collisionPadding={{
                top: 40,    // Titlebar (35px) + small buffer
                bottom: 31, // Status bar (26px) + small buffer
                left: 10,
                right: 10
            }}
            className={cn(
                "shape-popover-content z-tooltip rounded-lg bg-panel px-2 py-1",
                "text-sm text-text-primary",
                "filter-[drop-shadow(1px_0_0_var(--border-subtle))_drop-shadow(-1px_0_0_var(--border-subtle))_drop-shadow(0_1px_0_var(--border-subtle))_drop-shadow(0_-1px_0_var(--border-subtle))]",
                className
            )}
            onPointerLeave={(e) => {
                // If primary mouse button is held down (e.g. dragging to select text), prevent closing!
                if (e.buttons === 1) {
                    e.preventDefault();
                    const target = e.currentTarget;
                    const handlePointerUp = () => {
                        // Resimulate pointer leave to let Radix naturally unmount now that dragging finished!
                        target.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
                        window.removeEventListener("pointerup", handlePointerUp);
                    };
                    window.addEventListener("pointerup", handlePointerUp);
                }
                props.onPointerLeave?.(e);
            }}
            {...props}
        >
            {children}
            <TooltipPrimitive.Arrow className="fill-panel" />
        </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/** Simple one-liner usage: <Tooltip content={<>...</>}><child/></Tooltip> */
function Tooltip({
    children,
    content,
    side = "top",
    delayDuration = 200,
    open,
    defaultOpen,
    onOpenChange,
    ...props
}: {
    children: React.ReactNode;
    content: React.ReactNode;
    side?: "top" | "right" | "bottom" | "left";
    delayDuration?: number;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
} & Omit<React.ComponentPropsWithoutRef<typeof TooltipContent>, "content" | "open" | "defaultOpen" | "onOpenChange">) {
    return (
        <TooltipProvider delayDuration={delayDuration} skipDelayDuration={0}>
            <TooltipRoot open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
                <TooltipTrigger asChild>{children}</TooltipTrigger>
                <TooltipContent side={side} {...props}>
                    {content}
                </TooltipContent>
            </TooltipRoot>
        </TooltipProvider>
    );
}

export {
    Tooltip,
    TooltipProvider,
    TooltipRoot,
    TooltipTrigger,
    TooltipContent,
};
