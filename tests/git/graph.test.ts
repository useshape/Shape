import { describe, expect, it } from "vitest";
import {
    computeGraphRowLayout,
    computeGraphRowMeta,
    computeVisibleRange,
    GRAPH_ROW_HEIGHT,
} from "@/lib/git/graph-virtual";

describe("graph", () => {
    it("rows", () => {
        const expanded = new Set(["abc"]);
        const meta = computeGraphRowMeta(2, expanded, { abc: 3 }, (i) => (i === 0 ? "abc" : "def"));
        expect(meta[0].height).toBe(26 + 3 * 22);
        expect(meta[1].top).toBe(meta[0].top + meta[0].height);
    });

    it("range", () => {
        const meta = computeGraphRowMeta(100, new Set(), {}, () => "hash");
        const { startIdx, endIdx } = computeVisibleRange(meta, 1200, 600, 400);
        expect(startIdx).toBeGreaterThan(0);
        expect(endIdx - startIdx).toBeLessThan(100);
    });

    it("empty", () => {
        const { startIdx, endIdx } = computeVisibleRange([], 0, 600);
        expect(startIdx).toBe(0);
        expect(endIdx).toBe(0);
    });

    it("single row visible range", () => {
        const meta = computeGraphRowMeta(1, new Set(), {}, () => "hash");
        const { startIdx, endIdx } = computeVisibleRange(meta, 0, 600, 400);
        expect(startIdx).toBe(0);
        expect(endIdx).toBe(0);
    });

    it("collapsed rows use base height", () => {
        const meta = computeGraphRowMeta(3, new Set(), {}, () => "hash");
        expect(meta.every((row) => row.height === 26)).toBe(true);
    });

    it("uniform layout avoids O(n) meta when nothing is expanded", () => {
        const layout = computeGraphRowLayout(8_000, new Set(), {}, () => "hash");
        expect(layout.kind).toBe("uniform");
        if (layout.kind !== "uniform") return;
        expect(layout.totalHeight).toBe(8_000 * GRAPH_ROW_HEIGHT);
        const { startIdx, endIdx } = computeVisibleRange(layout, 1200, 600, 400);
        expect(startIdx).toBeGreaterThan(0);
        expect(endIdx - startIdx).toBeLessThan(100);
    });
});
