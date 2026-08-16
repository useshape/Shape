"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

type TabsListVariant = "pill" | "line";

const TabsListVariantContext = React.createContext<TabsListVariant>("pill");

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
    HTMLDivElement,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsListVariant }
>(({ className, children, variant = "pill", ...props }, ref) => {
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
            left: activeRect.left - listRect.left - list.clientLeft + list.scrollLeft,
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
        list.addEventListener("scroll", onChange);
        window.addEventListener("resize", onChange);
        return () => {
            mo.disconnect();
            ro.disconnect();
            list.removeEventListener("scroll", onChange);
            window.removeEventListener("resize", onChange);
        };
    }, [updateIndicator]);

    return (
        <TabsListVariantContext.Provider value={variant}>
            <TabsPrimitive.List
                ref={setRefs}
                className={cn(
                    variant === "line"
                        ? "relative flex h-chrome w-full items-center overflow-x-auto no-scrollbar border-b border-border-subtle px-sm"
                        : "relative inline-flex h-7 items-center rounded-lg bg-panel-secondary p-0.5",
                    className,
                )}
                {...props}
            >
                <span
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute transition-[transform,width,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                        variant === "line"
                            ? "bottom-0 h-px bg-text-primary"
                            : "top-0.5 bottom-0.5 rounded-md bg-panel-active",
                        indicator.ready ? "opacity-100" : "opacity-0",
                    )}
                    style={{
                        width: indicator.width,
                        transform: `translateX(${indicator.left}px)`,
                    }}
                />
                {children}
            </TabsPrimitive.List>
        </TabsListVariantContext.Provider>
    );
});
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
    const variant = React.useContext(TabsListVariantContext);
    return (
        <TabsPrimitive.Trigger
            ref={ref}
            className={cn(
                "relative z-10 inline-flex shrink-0 items-center justify-center whitespace-nowrap text-sm font-normal",
                "transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                "data-[state=active]:text-text-primary data-[state=active]:bg-transparent",
                "text-text-secondary hover:text-text-primary",
                variant === "line" ? "h-chrome px-sm" : "rounded-md px-2 py-1",
                className,
            )}
            {...props}
        />
    );
});
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
