export const GRAPH_ROW_HEIGHT = 26;
export const GRAPH_FILE_ROW_HEIGHT = 22;
export const GRAPH_OVERSCAN_PX = 400;

/** Soft cap for streamed commits kept in memory / UI. Deep history stays on disk. */
export const GRAPH_LOG_SOFT_CAP = 8_000;

export type GraphRowMeta = { top: number; height: number };

export type GraphRowLayout =
    | { kind: "uniform"; count: number; rowHeight: number; totalHeight: number }
    | { kind: "variable"; metas: GraphRowMeta[]; totalHeight: number };

export function computeGraphRowLayout(
    logCount: number,
    expandedHashes: Set<string>,
    fileCounts: Record<string, number>,
    getHashAt: (index: number) => string,
): GraphRowLayout {
    // Fast path: almost always true while browsing — O(1) instead of O(n) allocations.
    if (expandedHashes.size === 0) {
        return {
            kind: "uniform",
            count: logCount,
            rowHeight: GRAPH_ROW_HEIGHT,
            totalHeight: logCount * GRAPH_ROW_HEIGHT,
        };
    }

    const metas: GraphRowMeta[] = [];
    let y = 0;
    for (let i = 0; i < logCount; i++) {
        const hash = getHashAt(i);
        const expanded = expandedHashes.has(hash);
        const fileCount = expanded ? Math.max(fileCounts[hash] ?? 1, 1) : 0;
        const rowH = GRAPH_ROW_HEIGHT + (expanded ? fileCount * GRAPH_FILE_ROW_HEIGHT : 0);
        metas.push({ top: y, height: rowH });
        y += rowH;
    }
    return {
        kind: "variable",
        metas,
        totalHeight: y,
    };
}

/** @deprecated Prefer computeGraphRowLayout — kept for any external callers. */
export function computeGraphRowMeta(
    logCount: number,
    expandedHashes: Set<string>,
    fileCounts: Record<string, number>,
    getHashAt: (index: number) => string,
): GraphRowMeta[] {
    const layout = computeGraphRowLayout(logCount, expandedHashes, fileCounts, getHashAt);
    if (layout.kind === "variable") return layout.metas;
    const metas: GraphRowMeta[] = new Array(layout.count);
    for (let i = 0; i < layout.count; i++) {
        metas[i] = { top: i * layout.rowHeight, height: layout.rowHeight };
    }
    return metas;
}

export function rowTop(layout: GraphRowLayout, index: number): number {
    if (layout.kind === "uniform") return index * layout.rowHeight;
    return layout.metas[index]?.top ?? 0;
}

export function rowHeight(layout: GraphRowLayout, index: number): number {
    if (layout.kind === "uniform") return layout.rowHeight;
    return layout.metas[index]?.height ?? GRAPH_ROW_HEIGHT;
}

export function computeVisibleRange(
    layout: GraphRowLayout | GraphRowMeta[],
    scrollTop: number,
    containerHeight: number,
    overscanPx = GRAPH_OVERSCAN_PX,
): { startIdx: number; endIdx: number } {
    // Back-compat: raw meta arrays from older call sites.
    if (Array.isArray(layout)) {
        return computeVisibleRangeVariable(layout, scrollTop, containerHeight, overscanPx);
    }
    if (layout.kind === "uniform") {
        if (layout.count === 0) return { startIdx: 0, endIdx: 0 };
        const h = layout.rowHeight;
        const viewTop = Math.max(0, scrollTop - overscanPx);
        const viewBottom = scrollTop + containerHeight + overscanPx;
        const startIdx = Math.max(0, Math.min(layout.count - 1, Math.floor(viewTop / h)));
        const endIdx = Math.max(
            startIdx,
            Math.min(layout.count - 1, Math.ceil(viewBottom / h)),
        );
        return { startIdx, endIdx };
    }
    return computeVisibleRangeVariable(layout.metas, scrollTop, containerHeight, overscanPx);
}

function computeVisibleRangeVariable(
    rowMeta: GraphRowMeta[],
    scrollTop: number,
    containerHeight: number,
    overscanPx: number,
): { startIdx: number; endIdx: number } {
    if (rowMeta.length === 0) return { startIdx: 0, endIdx: 0 };
    const viewTop = Math.max(0, scrollTop - overscanPx);
    const viewBottom = scrollTop + containerHeight + overscanPx;

    let lo = 0;
    let hi = rowMeta.length - 1;
    let startIdx = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const bottom = rowMeta[mid].top + rowMeta[mid].height;
        if (bottom < viewTop) {
            startIdx = mid + 1;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    lo = startIdx;
    hi = rowMeta.length - 1;
    let endIdx = rowMeta.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (rowMeta[mid].top > viewBottom) {
            endIdx = mid - 1;
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }

    return {
        startIdx: Math.max(0, Math.min(startIdx, rowMeta.length - 1)),
        endIdx: Math.max(0, Math.min(endIdx, rowMeta.length - 1)),
    };
}
