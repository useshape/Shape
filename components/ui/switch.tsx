"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitives.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, checked, defaultChecked, onCheckedChange, onClick, ...props }, ref) => {
    const [init, setInit] = React.useState(false);
    const isControlled = checked !== undefined;
    const [uncontrolled, setUncontrolled] = React.useState(Boolean(defaultChecked));
    const on = isControlled ? Boolean(checked) : uncontrolled;

    return (
        <SwitchPrimitives.Root
            ref={ref}
            checked={checked}
            defaultChecked={defaultChecked}
            onCheckedChange={(next) => {
                if (!init) setInit(true);
                if (!isControlled) setUncontrolled(next);
                onCheckedChange?.(next);
            }}
            onClick={(e) => {
                if (!init) setInit(true);
                onClick?.(e);
            }}
            className={cn(
                "t-toggle peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "data-[state=checked]:bg-accent data-[state=unchecked]:bg-panel-hover",
                init && "is-init",
                className,
            )}
            data-on={on ? "true" : "false"}
            {...props}
        >
            <SwitchPrimitives.Thumb
                className={cn(
                    "t-toggle-thumb pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0",
                )}
            />
        </SwitchPrimitives.Root>
    );
});
Switch.displayName = SwitchPrimitives.Root.displayName;
