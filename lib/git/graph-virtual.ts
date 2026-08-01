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
    let startIdx = 0;
    let endIdx = rowMeta.length - 1;
    for (let i = 0; i < rowMeta.length; i++) {
        if (rowMeta[i].top + rowMeta[i].height < viewTop) {
            startIdx = i + 1;
        } else {
            break;
        }
    }
    for (let i = rowMeta.length - 1; i >= 0; i--) {
        if (rowMeta[i].top > viewBottom) {
            endIdx = i - 1;
        } else {
            break;
        }
    }
    return {
        startIdx: Math.max(0, startIdx),
        endIdx: Math.min(rowMeta.length - 1, Math.max(0, endIdx)),
    };
}
