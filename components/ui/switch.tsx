"use client";

import * as React from "react";
import { RiLoader4Line } from "@remixicon/react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { Icon, ICON_SIZE_XS } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitives.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
        loading?: boolean;
    }
>(({ className, checked, defaultChecked, onCheckedChange, onClick, loading, disabled, ...props }, ref) => {
    const [init, setInit] = React.useState(false);
    const isControlled = checked !== undefined;
    const [uncontrolled, setUncontrolled] = React.useState(Boolean(defaultChecked));
    const on = isControlled ? Boolean(checked) : uncontrolled;
    const inactive = Boolean(disabled) || loading;

    return (
        <SwitchPrimitives.Root
            ref={ref}
            checked={checked}
            defaultChecked={defaultChecked}
            disabled={inactive}
            onCheckedChange={(next) => {
                if (inactive) return;
                if (!init) setInit(true);
                if (!isControlled) setUncontrolled(next);
                onCheckedChange?.(next);
            }}
            onClick={(e) => {
                if (inactive) {
                    e.preventDefault();
                    return;
                }
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
                    "t-toggle-thumb pointer-events-none flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm ring-0",
                )}
            >
                {loading ? (
                    <Icon icon={RiLoader4Line} size={ICON_SIZE_XS} className="animate-spin text-text-muted" />
                ) : null}
            </SwitchPrimitives.Thumb>
        </SwitchPrimitives.Root>
    );
});
Switch.displayName = SwitchPrimitives.Root.displayName;

export function Toggle({
    checked,
    defaultChecked,
    onCheckedChange,
    disabled,
    loading,
    label,
    description,
    help,
    labelPosition = "top",
    id,
    name,
}: {
    checked?: boolean;
    defaultChecked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    loading?: boolean;
    label: string;
    description?: string;
    help?: string;
    labelPosition?: "top" | "left" | "hidden";
    id?: string;
    name?: string;
}) {
    const uid = React.useId();
    const labelId = id ?? uid;
    const descId = description ? `${labelId}-desc` : undefined;
    const helpId = help ? `${labelId}-help` : undefined;

    const control = (
        <Switch
            id={labelId}
            name={name}
            checked={checked}
            defaultChecked={defaultChecked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            loading={loading}
            aria-describedby={[descId, helpId].filter(Boolean).join(" ") || undefined}
        />
    );

    if (labelPosition === "hidden") {
        return (
            <div className="inline-flex items-center">
                <label htmlFor={labelId} className="sr-only">
                    {label}
                </label>
                {control}
            </div>
        );
    }

    if (labelPosition === "left") {
        return (
            <label htmlFor={labelId} className="inline-flex items-center gap-2.5">
                <span className="text-sm font-medium text-text-primary">{label}</span>
                {control}
            </label>
        );
    }

    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={labelId} className="text-sm font-medium text-text-primary">
                {label}
            </label>
            {description ? (
                <p id={descId} className="text-sm text-text-muted">
                    {description}
                </p>
            ) : null}
            {control}
            {help ? (
                <p id={helpId} className="text-xs text-text-muted">
                    {help}
                </p>
            ) : null}
        </div>
    );
}
