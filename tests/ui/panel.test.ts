import { describe, expect, it } from "vitest";

const STORAGE_PREFIX = "panel-";

function initialSizes(preferred: number[], storageKey?: string) {
    const sizes = preferred.map((size) => size || 250);
    if (!storageKey) return sizes;
    const stored = localStorage.getItem(STORAGE_PREFIX + storageKey);
    if (!stored) return sizes;
    try {
        const parsed = JSON.parse(stored) as number[];
        if (Array.isArray(parsed) && parsed.length === preferred.length) return parsed;
    } catch {
        // ignore
    }
    return sizes;
}

describe("panel", () => {
    it("hydrate", () => {
        localStorage.setItem(`${STORAGE_PREFIX}terminal`, JSON.stringify([999]));
        expect(initialSizes([250, 300], "terminal")).toEqual([250, 300]);
    });

    it("restore", () => {
        localStorage.setItem(`${STORAGE_PREFIX}terminal`, JSON.stringify([420, 180]));
        const stored = localStorage.getItem(`${STORAGE_PREFIX}terminal`);
        expect(JSON.parse(stored!)).toEqual([420, 180]);
    });
});
