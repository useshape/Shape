import { GraphNode } from "@/lib/backend";

/** Grid / stroke — tuned toward vscode-git-graph proportions. */
export const LANE_WIDTH = 16;
export const ROW_HEIGHT = 26;
export const DOT_RADIUS = 3.5;
export const MERGE_DOT_RADIUS = 5.5;
export const STROKE = 2;
/** Background outline under lines (vscode-git-graph `path.shadow`). */
export const SHADOW_STROKE = 4;
export const SHADOW_OPACITY = 0.55;

export const EMPTY_ARRAY: never[] = [];
export const EMPTY_NODE: GraphNode = { lane: 0, color: "var(--color-accent)", paths: [], isMerge: false };

/** True when this commit is checked out (HEAD tip). */
export function commitIsHead(refs: string[] | null | undefined): boolean {
    if (!refs?.length) return false;
    return refs.some((r) => {
        const lower = r.toLowerCase();
        return lower === "head" || lower.startsWith("head ->") || lower.includes("head ->");
    });
}
