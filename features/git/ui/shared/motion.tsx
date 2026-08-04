"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./motion.css";

/** Section body enter (Source → PRs → Graph, etc.). */
export function GitPaneEnter({
    children,
    className,
    animKey,
}: {
    children: ReactNode;
    className?: string;
    /** Change this to replay the enter animation (usually the section id). */
    animKey: string | number;
}) {
    return (
        <div key={animKey} className={cn("git-pane-enter h-full min-h-0 min-w-0", className)}>
            {children}
        </div>
    );
}

/** List → detail overlay enter (Issues/PRs/Branches/Actions). */
export function GitOverlayEnter({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return <div className={cn("git-overlay-enter h-full min-h-0 min-w-0", className)}>{children}</div>;
}
