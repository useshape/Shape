"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "ghost" | "outline" | "destructive";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
    default: "bg-accent text-accent-fg hover:bg-accent-hover disabled:bg-accent/50 disabled:text-accent-fg",
    secondary: "bg-button-secondary-bg text-button-secondary-fg hover:bg-button-secondary-hover",
    ghost: "bg-transparent text-text-secondary hover:bg-panel-hover hover:text-text-primary",
    outline: "border border-border-subtle bg-transparent text-text-primary hover:bg-panel-hover",
    destructive: "bg-error text-white hover:bg-error/90 disabled:bg-error/50 disabled:text-white",
};

const sizeClasses: Record<ButtonSize, string> = {
    xs: "h-6 px-sm text-xs",
    sm: "h-chrome px-md text-sm",
    md: "h-8 px-lg text-sm",
    lg: "h-10 px-xl text-base",
    icon: "h-chrome w-chrome p-0",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "md", type = "button", ...props }, ref) => {
        return (
            <button
                ref={ref}
                type={type}
                className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium outline-none",
                    "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                    "focus-visible:ring-1 focus-visible:ring-border-focus disabled:pointer-events-none",
                    "[&_svg.shape-icon]:pointer-events-none [&_svg.shape-icon]:shrink-0 [&_svg.shape-icon]:opacity-100",
                    variantClasses[variant],
                    sizeClasses[size],
                    className
                )}
                {...props}
            />
        );
    }
);

Button.displayName = "Button";
