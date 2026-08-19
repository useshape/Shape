"use client";

import React from "react";
import { cn } from "@/lib/utils";

const EXIT_MS = 220;

/**
 * Height-animated expand/collapse wrapper for workflow dropdowns.
 * Children stay mounted during the closing transition, then unmount.
 */
export function Collapse({
    open,
    children,
    className,
}: {
    open: boolean;
    children: React.ReactNode;
    className?: string;
}) {
    const [mounted, setMounted] = React.useState(open);

    React.useEffect(() => {
        if (open) {
            setMounted(true);
            return;
        }
        const t = window.setTimeout(() => setMounted(false), EXIT_MS);
        return () => window.clearTimeout(t);
    }, [open]);

    if (!open && !mounted) return null;

    return (
        <div className="chat-collapse" data-open={open && mounted ? "true" : "false"}>
            <div className={cn("chat-collapse-inner", className)}>{children}</div>
        </div>
    );
}
