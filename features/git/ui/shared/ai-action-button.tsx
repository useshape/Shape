"use client";

import React, { type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { ShapeLogo } from "@/components/ui/shape-logo";
import "./ai-action-button.css";

/**
 * Shape AI action button — same size/chrome as outline buttons, plus effects.
 * Idle: Magic UI shimmer. Loading: Magic UI rainbow border.
 * Styles live in ./ai-action-button.css (not globals).
 */
export function AiActionButton({
    loading,
    children,
    className,
    disabled,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
}) {
    if (loading) {
        return (
            <button
                type="button"
                disabled
                className={cn(
                    "ai-action-btn ai-action-btn--rainbow relative inline-flex h-7 shrink-0 cursor-wait items-center justify-center gap-1.5 overflow-hidden rounded-lg px-2.5 text-xs font-medium text-text-primary",
                    "disabled:opacity-100",
                    className,
                )}
                {...props}
            >
                <span className="relative z-10 inline-flex items-center gap-1.5">
                    <ShapeLogo size={12} className="opacity-90" />
                    {children}
                </span>
            </button>
        );
    }

    return (
        <button
            type="button"
            disabled={disabled}
            style={
                {
                    "--spread": "90deg",
                    "--shimmer-color": "color-mix(in oklab, var(--accent) 80%, white)",
                    "--radius": "0.5rem",
                    "--speed": "2.8s",
                    "--cut": "1px",
                    "--bg": "var(--panel)",
                } as CSSProperties
            }
            className={cn(
                "ai-action-btn group relative z-0 inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden [border-radius:var(--radius)] border border-border-subtle px-2.5 text-xs font-medium whitespace-nowrap text-text-primary [background:var(--bg)]",
                "transform-gpu transition-transform duration-200 ease-[var(--ease-out)] active:translate-y-px",
                "disabled:pointer-events-none disabled:opacity-50",
                className,
            )}
            {...props}
        >
            <div className="-z-30 absolute inset-0 overflow-visible blur-[1.5px] @container-[size]">
                <div className="ai-action-btn__shimmer-slide absolute inset-0 aspect-square h-[100cqh] [mask:none]">
                    <div
                        className="ai-action-btn__spin-around absolute -inset-full w-auto rotate-0"
                        style={{
                            background:
                                "conic-gradient(from calc(270deg - (var(--spread) * 0.5)), transparent 0, var(--shimmer-color) var(--spread), transparent var(--spread))",
                        }}
                    />
                </div>
            </div>
            <span className="relative z-10 inline-flex items-center gap-1.5">
                <ShapeLogo size={12} />
                {children}
            </span>
            <div
                className={cn(
                    "absolute inset-0 size-full rounded-lg",
                    "shadow-[inset_0_-6px_8px_#ffffff14]",
                    "transform-gpu transition-all duration-200 ease-[var(--ease-out)]",
                    "group-hover:shadow-[inset_0_-5px_8px_#ffffff22]",
                    "group-active:shadow-[inset_0_-8px_10px_#ffffff18]",
                )}
            />
            <div className="absolute inset-(--cut) -z-20 [border-radius:var(--radius)] [background:var(--bg)]" />
        </button>
    );
}
