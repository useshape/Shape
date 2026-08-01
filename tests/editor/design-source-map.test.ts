import { describe, expect, it } from "vitest";
import {
    findDesignPropertyAtOffset,
    findAllDesignProperties,
    formatScrubbedNumber,
    scrubValueFromDelta,
    controlKindAtOffset,
} from "@/features/editor/lib/design-source-map";

describe("design source map", () => {
    it("maps Tailwind scale numbers to exact ranges", () => {
        const src = `className="flex gap-4 p-2"`;
        const gapHit = findDesignPropertyAtOffset(src, src.indexOf("4"));
        expect(gapHit).toMatchObject({ kind: "spacing-scale", value: 4, unit: "" });
        expect(src.slice(gapHit!.start, gapHit!.end)).toBe("4");
        expect(gapHit!.controlKind).toBe("gap");
    });

    it("maps arbitrary px values surgically", () => {
        const src = `className="p-[24px]"`;
        const hit = findDesignPropertyAtOffset(src, src.indexOf("24"));
        expect(hit).toMatchObject({ kind: "spacing-px", value: 24, unit: "px" });
        expect(src.slice(hit!.start, hit!.end)).toBe("24");
    });

    it("maps CSS length declarations", () => {
        const src = `.card {\n  padding: 16px;\n}`;
        const hit = findDesignPropertyAtOffset(src, src.indexOf("16"));
        expect(hit).toMatchObject({ kind: "css-length", value: 16, unit: "px" });
        const next = formatScrubbedNumber(hit!, 20);
        expect(next).toBe("20");
        const rebuilt =
            src.slice(0, hit!.start) + next + src.slice(hit!.end);
        expect(rebuilt).toContain("padding: 20px");
        expect(rebuilt).toContain(".card");
    });

    it("scrubs with mouse delta without rewriting the whole file", () => {
        const hit = {
            start: 0,
            end: 1,
            kind: "spacing-scale" as const,
            value: 4,
            unit: "",
        };
        // 16px ≈ 2 scale steps: 4 → 5 → 6
        expect(scrubValueFromDelta(hit, 16)).toBe("6");
        // -8px ≈ 1 step back: 4 → 3.5
        expect(scrubValueFromDelta(hit, -8)).toBe("3.5");
    });

    it("scrubs with wheel ticks one scale stop at a time", () => {
        const hit = {
            start: 0,
            end: 1,
            kind: "spacing-scale" as const,
            value: 4,
            unit: "",
        };
        expect(scrubValueFromDelta(hit, 1, { wheel: true })).toBe("5");
        expect(scrubValueFromDelta(hit, -1, { wheel: true })).toBe("3.5");
    });

    it("lists scrubbable hits for decorations", () => {
        const src = `cn("gap-2", "p-[8px]")`;
        const hits = findAllDesignProperties(src);
        expect(hits.length).toBeGreaterThanOrEqual(2);
    });

    it("resolves control kind under cursor", () => {
        const src = `className="flex items-center gap-3"`;
        expect(controlKindAtOffset(src, src.indexOf("flex") + 1)).toBe("flex");
        expect(controlKindAtOffset(src, src.indexOf("gap") + 1)).toBe("gap");
    });

    it("scrubs named radius tokens", () => {
        const src = `className="rounded-lg p-2"`;
        const hit = findDesignPropertyAtOffset(src, src.indexOf("rounded-lg") + 2);
        expect(hit?.kind).toBe("named-radius");
        expect(scrubValueFromDelta(hit!, 1, { wheel: true })).toBe("rounded-xl");
        expect(scrubValueFromDelta(hit!, -1, { wheel: true })).toBe("rounded-md");
    });

    it("maps px-1 scale numbers (not confused with p-)", () => {
        const src = `className="px-1 py-2"`;
        const hit = findDesignPropertyAtOffset(src, src.indexOf("1"));
        expect(hit).toMatchObject({ kind: "spacing-scale", value: 1 });
        expect(src.slice(hit!.start, hit!.end)).toBe("1");
    });
});
