"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
    trackClassName?: string;
}

export const Slider = React.forwardRef<
    React.ElementRef<typeof SliderPrimitive.Root>,
    SliderProps
>(({ className, trackClassName, ...props }, ref) => (
    <SliderPrimitive.Root
        ref={ref}
        className={cn("relative flex w-full touch-none select-none items-center", className)}
        {...props}
    >
        <SliderPrimitive.Track
            className={cn(
                "relative h-1.5 w-full grow overflow-hidden rounded-sm bg-border-subtle",
                trackClassName,
            )}
        >
            <SliderPrimitive.Range
                className={cn(
                    "absolute h-full rounded-full",
                    trackClassName?.includes("gradient") ? "bg-transparent" : "bg-accent",
                )}
            />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-3.5 w-3.5 rounded-full border-2 border-background bg-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus disabled:pointer-events-none disabled:opacity-50" />
    </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export interface LabeledSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
    trackClassName?: string;
    formatValue?: (value: number) => string;
    onChange: (value: number) => void;
    onCommit?: (value: number) => void;
    className?: string;
}

export function LabeledSlider({
    label,
    value,
    min,
    max,
    step = 1,
    disabled,
    trackClassName,
    formatValue = (v) => v.toFixed(2),
    onChange,
    onCommit,
    className,
}: LabeledSliderProps) {
    return (
        <div className={cn("space-y-1.5", disabled && "opacity-50 pointer-events-none", className)}>
            <div className="flex items-center justify-between text-sm">
                <span className="text-text-primary">{label}</span>
                <span className="tabular-nums text-text-primary">{formatValue(value)}</span>
            </div>
            <Slider
                min={min}
                max={max}
                step={step}
                value={[value]}
                disabled={disabled}
                trackClassName={trackClassName}
                onValueChange={(v) => onChange(v[0] ?? value)}
                onValueCommit={(v) => onCommit?.(v[0] ?? value)}
            />
        </div>
    );
}
