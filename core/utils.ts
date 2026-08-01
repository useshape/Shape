import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function getGitStatusColor(status: string): string {
    if (status === "M") return "var(--git-modified)";
    if (status === "A" || status === "U") return "var(--git-added)";
    if (status === "D") return "var(--git-deleted)";
    return "var(--git-added)";
}
