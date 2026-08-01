import { GitFileParams, GitLogEntry } from "@/lib/backend";

export type GraphCacheEntry = {
    logs: GitLogEntry[];
    expanded: Set<string>;
    filesCache: Record<string, GitFileParams[]>;
    scrollTop: number;
};

// Global cache to prevent re-fetching on tab switch
export const graphCache: Record<string, GraphCacheEntry> = {};
