"use client";

import { cn } from "@/lib/utils";

export function SonarLogo({ className = "w-4 h-4" }: { className?: string }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src="/logos/logo.svg"
            alt="Shape"
            className={cn("logo-invert w-full h-full object-contain", className)}
            draggable={false}
        />
    );
}
