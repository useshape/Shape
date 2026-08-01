"use client";

import { cn } from "@/lib/utils";

export function UsageRing({
    percent,
    size = 20,
    className,
    title,
}: {
    percent: number;
    size?: number;
    className?: string;
    title?: string;
}) {
    const clamped = Math.max(0, Math.min(100, percent));
    const stroke = 1.75;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (clamped / 100) * circumference;

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className={cn("shrink-0 -rotate-90", className)}
            aria-hidden={title ? undefined : true}
            role={title ? "img" : undefined}
        >
            {title ? <title>{title}</title> : null}
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={stroke}
                className="text-border-secondary"
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className={cn(
                    "transition-[stroke-dashoffset] duration-300",
                    clamped >= 90 ? "text-warning" : "text-accent",
                )}
            />
        </svg>
    );
}
