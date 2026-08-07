"use client";

import { cn } from "@/lib/utils";

/** Chrome-style browser mark for the activity bar / tabs. */
export function ChromeBrowserIcon({
    className,
    size = 16,
}: {
    className?: string;
    size?: number;
}) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            className={cn("shape-icon shrink-0 text-current", className)}
            aria-hidden
        >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
            <path
                d="M12 2a10 10 0 0 1 8.66 5H12V2Z"
                fill="currentColor"
                fillOpacity="0.22"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
            />
            <path
                d="M3.34 7A10 10 0 0 0 12 22V12H3.34Z"
                fill="currentColor"
                fillOpacity="0.12"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
            />
        </svg>
    );
}
