"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { getShortcutForLabel } from "@/lib/ui/shortcuts";

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
                top: 40,
                bottom: 31,
                left: 10,
                right: 10,
            }}
            className={cn(
                "shape-popover-content z-tooltip squircle-xl bg-sidebar border border-border p-1",
                "max-w-[min(260px,calc(100vw-20px))] whitespace-normal wrap-break-word text-pretty leading-snug",
                "text-xs font-normal text-text-primary",
                "filter-[drop-shadow(1px_0_0_var(--border-border))_drop-shadow(-1px_0_0_var(--border-border))_drop-shadow(0_1px_0_var(--border-border))_drop-shadow(0_-1px_0_var(--border-border))]",
                className,
            )}
            onPointerLeave={(e) => {
                if (e.buttons === 1) {
                    e.preventDefault();
                    const target = e.currentTarget;
                    const handlePointerUp = () => {
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
            <TooltipPrimitive.Arrow className="fill-border" />
        </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/** Simple one-liner usage: <Tooltip content={<>...</>}><child/></Tooltip> */
function Tooltip({
    children,
    content,
    shortcut,
    side = "top",
    delayDuration = 100,
    open,
    defaultOpen,
    onOpenChange,
    ...props
}: {
    children: React.ReactNode;
    content: React.ReactNode;
    /** Chord shown beside the label. A string label also picks up a matching keybinding. */
    shortcut?: string;
    side?: "top" | "right" | "bottom" | "left";
    delayDuration?: number;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
} & Omit<React.ComponentPropsWithoutRef<typeof TooltipContent>, "content" | "open" | "defaultOpen" | "onOpenChange">) {
    const chord =
        shortcut
        ?? (typeof content === "string" ? getShortcutForLabel(content) : undefined);
    return (
        <TooltipProvider delayDuration={delayDuration} skipDelayDuration={0}>
            <TooltipRoot open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
                <TooltipTrigger asChild>{children}</TooltipTrigger>
                <TooltipContent side={side} {...props}>
                    {chord ? (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span>{content}</span>
                            <kbd className="rounded-md bg-panel-active px-1 py-px text-[10px] leading-4 text-text-secondary">
                                {chord}
                            </kbd>
                        </span>
                    ) : (
                        content
                    )}
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
