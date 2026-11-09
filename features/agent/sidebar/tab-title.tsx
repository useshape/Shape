"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Temporary title fades out left-to-right as the generated name fades in with a shimmer. */
export function TabTitleFade({
    title,
    working = false,
}: {
    title: string;
    working?: boolean;
}) {
    const [shown, setShown] = useState(title);
    const [incoming, setIncoming] = useState<string | null>(null);
    const shownRef = useRef(shown);
    shownRef.current = shown;

    useEffect(() => {
        if (title === shownRef.current) return;
        setIncoming(title);
        const reduce =
            typeof window !== "undefined"
            && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduce) {
            setShown(title);
            setIncoming(null);
            return;
        }
        const timer = window.setTimeout(() => {
            setShown(title);
            setIncoming(null);
        }, 420);
        return () => window.clearTimeout(timer);
    }, [title]);

    return (
        <span className="relative block min-w-0 flex-1 overflow-hidden">
            <span
                className={cn(
                    "block truncate text-sm",
                    incoming && "tab-title-out",
                    working && !incoming && "agent-progress-loading-text",
                )}
            >
                {shown}
            </span>
            {incoming ? (
                <span className="tab-title-in agent-progress-loading-text absolute inset-0 truncate text-sm">
                    {incoming}
                </span>
            ) : null}
        </span>
    );
}
