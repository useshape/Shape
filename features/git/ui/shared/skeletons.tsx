"use client";

import { cn } from "@/lib/utils";

/** Simple pulse block used for Git Manager loading placeholders. */
export function Skeleton({ className }: { className?: string }) {
    return (
        <div
            className={cn(
                "animate-pulse rounded-md bg-panel-hover/80",
                className,
            )}
            aria-hidden
        />
    );
}

/** Matches GitHub list rows (title + subtitle + meta). */
export function GitListSkeleton({ rows = 8 }: { rows?: number }) {
    return (
        <ul className="flex flex-col gap-0.5 p-1" aria-busy aria-label="Loading">
            {Array.from({ length: rows }, (_, i) => (
                <li key={i} className="flex flex-col gap-1.5 rounded-lg px-2 py-2">
                    <div className="flex items-start justify-between gap-2">
                        <Skeleton className="h-4 w-[70%]" />
                        <Skeleton className="h-3 w-10 shrink-0" />
                    </div>
                    <Skeleton className="ml-6 h-3 w-[45%]" />
                </li>
            ))}
        </ul>
    );
}

/** Matches PR/issue detail header + conversation cards. */
export function GitDetailSkeleton() {
    return (
        <div className="flex h-full min-h-0 flex-col gap-3 p-3" aria-busy aria-label="Loading details">
            <div className="flex items-start gap-2">
                <Skeleton className="mt-0.5 h-7 w-7 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-5 w-[75%]" />
                    <Skeleton className="h-3 w-[50%]" />
                </div>
                <Skeleton className="h-7 w-24 shrink-0 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-64 rounded-lg" />
            <div className="flex gap-3 pt-2">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2 rounded-xl border border-border-subtle p-3">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-[90%]" />
                    <Skeleton className="h-3 w-[60%]" />
                </div>
            </div>
            <div className="flex gap-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2 rounded-xl border border-border-subtle p-3">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-[80%]" />
                </div>
            </div>
        </div>
    );
}

/** Full Git Manager shell placeholder while repos resolve. */
export function GitManagerShellSkeleton() {
    return (
        <div className="flex h-full w-full min-w-0 overflow-hidden bg-editor" aria-busy aria-label="Loading Git Manager">
            <aside className="flex w-64 shrink-0 flex-col p-2">
                <Skeleton className="mb-2 h-9 w-full rounded-lg" />
                <div className="space-y-3 px-1 pt-2">
                    {Array.from({ length: 4 }, (_, g) => (
                        <div key={g} className="space-y-1.5">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-7 w-full rounded-lg" />
                            <Skeleton className="h-7 w-full rounded-lg" />
                            <Skeleton className="h-7 w-[85%] rounded-lg" />
                        </div>
                    ))}
                </div>
            </aside>
            <section className="min-h-0 min-w-0 flex-1 border-l border-border-subtle/40 p-3">
                <Skeleton className="mb-3 h-9 w-48" />
                <GitListSkeleton rows={10} />
            </section>
        </div>
    );
}
