"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, ...props }, ref) => (
        <input
            ref={ref}
            className={cn(
                "w-full h-chrome rounded-lg bg-input-bg px-sm text-sm text-text-primary",
                "placeholder:text-input-placeholder outline-none ring-0 focus:ring-0 focus:border-border-focus",
                "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                className
            )}
            {...props}
        />
    )
);

Input.displayName = "Input";
