export const GRAPH_ROW_HEIGHT = 26;
export const GRAPH_FILE_ROW_HEIGHT = 22;
export const GRAPH_OVERSCAN_PX = 400;

export type GraphRowMeta = { top: number; height: number };

export function computeGraphRowMeta(
    logCount: number,
    expandedHashes: Set<string>,
    fileCounts: Record<string, number>,
    getHashAt: (index: number) => string,
): GraphRowMeta[] {
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
    return metas;
}

export function computeVisibleRange(
    rowMeta: GraphRowMeta[],
    scrollTop: number,
    containerHeight: number,
    overscanPx = GRAPH_OVERSCAN_PX,
): { startIdx: number; endIdx: number } {
    if (rowMeta.length === 0) return { startIdx: 0, endIdx: 0 };
    const viewTop = Math.max(0, scrollTop - overscanPx);
    const viewBottom = scrollTop + containerHeight + overscanPx;

    // Binary search first row whose bottom is past viewTop.
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
