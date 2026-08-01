"use client";

import * as React from "react";
import { Icon } from "./icon";

import { cn } from "@/lib/utils";

export interface CheckmarkProps {
    checked?: boolean | "indeterminate";
    onCheckedChange?: (checked: boolean | "indeterminate") => void;
    className?: string;
    disabled?: boolean;
}

export const Checkmark = React.forwardRef<HTMLDivElement, CheckmarkProps>(
    ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
        const toggle = () => {
            if (disabled) return;
            const nextChecked = checked === true ? false : true;
            onCheckedChange?.(nextChecked);
        };

        const handleClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            toggle();
        };

        return (
            <div
                ref={ref}
                role="checkbox"
                aria-checked={checked === "indeterminate" ? "mixed" : checked}
                tabIndex={disabled ? -1 : 0}
                onClick={handleClick}
                onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        toggle();
                    }
                }}
                className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-panel-hover cursor-pointer overflow-hidden",
                    "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus",
                    checked === true && "bg-accent border-accent text-accent-fg",
                    checked === "indeterminate" && "bg-accent border-accent text-accent-fg",
                    !checked && "hover:border-border hover:bg-panel-hover",
                    disabled && "cursor-not-allowed opacity-50",
                    className
                )}
                {...props}
            >
                {checked === true && (
                    <div className="flex items-center justify-center">
                        <Icon name="check" size={10}   />
                    </div>
                )}
                {checked === "indeterminate" && (
                    <div className="flex items-center justify-center">
                        <Icon name="remove" size={10}  />
                    </div>
                )}
            </div>
        );
    }
);

Checkmark.displayName = "Checkmark";
