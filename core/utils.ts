import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Shape defines custom size utilities (`h-chrome`, `px-sm`, …) outside Tailwind's
 * default scale. Without registering them here, `cn("h-chrome", "h-6")` keeps
 * BOTH classes and whichever rule wins in CSS is non-deterministic — which is
 * why design-panel fields kept the 30px chrome height under a 24px label slot.
 */
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            h: ["h-chrome", "h-titlebar", "h-statusbar"],
            w: ["w-chrome"],
            "min-h": ["min-h-chrome"],
            "min-w": ["min-w-chrome"],
            p: ["p-sm", "p-md", "p-lg"],
            px: ["px-sm", "px-md", "px-lg"],
            py: ["py-xs", "py-sm", "py-md"],
            pl: ["pl-sm", "pl-md"],
            pr: ["pr-sm", "pr-md"],
            pt: ["pt-sm", "pt-md"],
            pb: ["pb-sm", "pb-md"],
            gap: ["gap-sm", "gap-md"],
        },
        conflictingClassGroups: {
            // `size-*` sets both axes; a later `h-*` / `w-*` must replace it.
            size: ["h", "w", "min-h", "min-w"],
            h: ["size"],
            w: ["size"],
            "min-h": ["size"],
            "min-w": ["size"],
            // Custom `px-sm` must yield to explicit `pl-*` / `pr-*`.
            px: ["p", "pl", "pr"],
            pl: ["p", "px"],
            pr: ["p", "px"],
            py: ["p", "pt", "pb"],
            pt: ["p", "py"],
            pb: ["p", "py"],
        },
    },
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function getGitStatusColor(status: string): string {
    if (status === "M") return "var(--git-modified)";
    if (status === "A" || status === "U") return "var(--git-added)";
    if (status === "D") return "var(--git-deleted)";
    return "var(--git-added)";
}
