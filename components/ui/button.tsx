"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "ghost" | "outline" | "destructive";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";
export type ButtonStatus = "idle" | "loading" | "waiting" | "error";

const variantClasses: Record<ButtonVariant, string> = {
    default: "bg-accent text-accent-fg hover:bg-accent-hover disabled:bg-accent/50 disabled:text-accent-fg",
    secondary: "bg-surface-3 text-text-secondary hover:bg-surface-4",
    ghost: "bg-transparent text-text-secondary hover:bg-panel-hover hover:text-text-primary",
    outline: "border border-border bg-transparent text-text-primary hover:bg-panel-hover",
    destructive: "bg-error text-white hover:bg-error/90 disabled:bg-error/50 disabled:text-white",
};

const sizeClasses: Record<ButtonSize, string> = {
    xs: "h-7 px-2.5 text-xs rounded-md",
    sm: "h-7.5 px-3 text-sm rounded-md",
    md: "h-8 px-lg text-sm",
    lg: "h-10 px-xl text-base",
    icon: "size-6 shrink-0 overflow-visible p-4",
};

const spinnerClass: Record<ButtonSize, string> = {
    xs: "imsg-typing imsg-typing-sm",
    sm: "imsg-typing imsg-typing-sm",
    md: "imsg-typing imsg-typing-sm",
    lg: "imsg-typing",
    icon: "imsg-typing imsg-typing-sm",
};

/** Same three-dot indicator as an AI message while generating. */
export function ButtonSpinner({
    className,
    size = "md",
}: {
    className?: string;
    size?: ButtonSize;
}) {
    return (
        <span
            className={cn(spinnerClass[size], "[&_span]:bg-current", className)}
            role="status"
            aria-label="Loading"
        >
            <span />
            <span />
            <span />
        </span>
    );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Visual / busy state. `loading` and `waiting` show the AI-message typing dots. */
    status?: ButtonStatus;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant = "default",
            size = "md",
            status = "idle",
            type = "button",
            disabled,
            children,
            ...props
        },
        ref,
    ) => {
        const busy = status === "loading" || status === "waiting";
        const resolvedVariant = status === "error" ? "destructive" : variant;

        return (
            <button
                ref={ref}
                type={type}
                disabled={disabled || busy}
                aria-busy={busy || undefined}
                className={cn(
                    "relative inline-flex items-center justify-center gap-1.5 rounded-lg font-medium outline-none",
                    "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                    "focus-visible:ring-1 focus-visible:ring-border-focus disabled:pointer-events-none",
                    "[&_svg.shape-icon]:pointer-events-none [&_svg.shape-icon]:shrink-0 [&_svg.shape-icon]:opacity-100",
                    variantClasses[resolvedVariant],
                    sizeClasses[size],
                    className,
                )}
                {...props}
            >
                {busy ? (
                    <>
                        <span className="invisible inline-flex items-center justify-center gap-1.5">
                            {children}
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center">
                            <ButtonSpinner size={size} />
                        </span>
                    </>
                ) : (
                    children
                )}
            </button>
        );
    },
);

Button.displayName = "Button";
