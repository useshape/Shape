"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./motion.css";

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
