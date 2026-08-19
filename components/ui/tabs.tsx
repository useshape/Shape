"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
    HTMLDivElement,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
    const listRef = React.useRef<HTMLDivElement | null>(null);
    const [indicator, setIndicator] = React.useState({ left: 0, width: 0, ready: false });

    const setRefs = React.useCallback(
        (node: HTMLDivElement | null) => {
            listRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
        },
        [ref],
    );

    const updateIndicator = React.useCallback(() => {
        const list = listRef.current;
        if (!list) return;
        const active = list.querySelector<HTMLElement>('[data-state="active"]');
        if (!active) {
            setIndicator((prev) => ({ ...prev, ready: false }));
            return;
        }
        const listRect = list.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        setIndicator({
            left: activeRect.left - listRect.left - list.clientLeft,
            width: activeRect.width,
            ready: true,
        });
    }, []);

    React.useLayoutEffect(() => {
        updateIndicator();
    }, [updateIndicator, children]);

    React.useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const onChange = () => updateIndicator();
        const mo = new MutationObserver(onChange);
        mo.observe(list, {
            attributes: true,
            subtree: true,
            attributeFilter: ["data-state"],
        });
        const ro = new ResizeObserver(onChange);
        ro.observe(list);
        window.addEventListener("resize", onChange);
        return () => {
            mo.disconnect();
            ro.disconnect();
            window.removeEventListener("resize", onChange);
        };
    }, [updateIndicator]);

    return (
        <TabsPrimitive.List
            ref={setRefs}
            className={cn(
                "relative inline-flex h-7 items-center rounded-lg bg-panel-secondary p-0.5",
                className,
            )}
            {...props}
        >
            <span
                aria-hidden
                className={cn(
                    "pointer-events-none absolute top-0.5 bottom-0.5 rounded-md bg-panel-active",
                    "transition-[transform,width,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    indicator.ready ? "opacity-100" : "opacity-0",
                )}
                style={{
                    width: indicator.width,
                    transform: `translateX(${indicator.left}px)`,
                }}
            />
            {children}
        </TabsPrimitive.List>
    );
});
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
    <TabsPrimitive.Trigger
        ref={ref}
        className={cn(
            "relative z-10 inline-flex items-center justify-center whitespace-nowrap rounded-md px-2 py-1 text-sm font-normal",
            "transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "data-[state=active]:text-text-primary data-[state=active]:bg-transparent",
            "text-text-secondary hover:text-text-primary",
            className,
        )}
        {...props}
    />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
    <TabsPrimitive.Content
        ref={ref}
        className={cn(
            "outline-none",
            "data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-1",
            "data-[state=active]:duration-200",
            className,
        )}
        {...props}
    />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
