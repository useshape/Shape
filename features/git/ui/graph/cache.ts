import { GitFileParams, GitLogEntry, GitActivityPoint } from "@/lib/backend";

export type GraphCacheEntry = {
    logs: GitLogEntry[];
    expanded: Set<string>;
    filesCache: Record<string, GitFileParams[]>;
    scrollTop: number;
    activityPoints?: GitActivityPoint[];
    activityKey?: string;
};

// Global cache to prevent re-fetching on tab switch
export const graphCache: Record<string, GraphCacheEntry> = {};

export function activityCacheKey(
    repo: string,
    branchFilter: string,
    authorFilter: string,
): string {
    return `${repo}::${branchFilter}::${authorFilter}`;
}
