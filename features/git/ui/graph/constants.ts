import { GraphNode } from "@/lib/backend";

// ── SVG GRAPH COLUMN ──
export const LANE_WIDTH = 16;
export const ROW_HEIGHT = 26;
export const DOT_RADIUS = 3.5;
export const MERGE_DOT_RADIUS = 5.5;
export const STROKE = 1.75;

export const EMPTY_ARRAY: never[] = [];
export const EMPTY_NODE: GraphNode = { lane: 0, color: 'var(--color-accent)', paths: [], isMerge: false };
