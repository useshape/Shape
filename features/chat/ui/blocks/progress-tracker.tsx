"use client";

import { cn } from "@/lib/utils";

export type ProgressStep = {
    id: string;
    label: string;
    done?: boolean;
    active?: boolean;
};

/** Task rows. Steps follow the plan; they do not tick themselves. */
export function ProgressTracker({ steps }: { steps: ProgressStep[] }) {
    if (steps.length === 0) return null;

    return (
        <ul className="flex flex-col">
            {steps.map((step) => (
                <li key={step.id} className="flex items-center gap-2.5 py-1 -mx-3">
                    <span
                        aria-hidden
                        className={cn(
                            "grid size-4 shrink-0 place-items-center squircle-lg border",
                            step.done
                                ? "border-accent bg-accent text-white"
                                : step.active
                                  ? "border-accent-text"
                                  : "border-white/25",
                        )}
                    >
                        {step.done ? (
                            <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6.5 12.5l3.5 3.5 7.5-8" />
                            </svg>
                        ) : null}
                    </span>
                    <span className={cn("min-w-0 truncate text-sm font-regular leading-5", step.done ? "text-text-muted" : "text-text-primary")}>
                        {step.label}
                    </span>
                </li>
            ))}
        </ul>
    );
}
