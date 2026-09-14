"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, ...props }, ref) => (
        <input
            ref={ref}
            className={cn(
                "h-chrome w-full rounded-md border border-input-border bg-input-bg px-sm text-sm text-text-primary",
                "placeholder:text-input-placeholder outline-none",
                "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                "focus-visible:border-border-focus focus-visible:ring-1 focus-visible:ring-border-focus",
                "disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
            {...props}
        />
    ),
);

Input.displayName = "Input";
