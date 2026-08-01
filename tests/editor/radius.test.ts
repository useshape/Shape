import { describe, expect, it } from "vitest";
import {
    buildRadiusStops,
    findStopByClass,
    findStopIndexByClass,
    previewRadiusPx,
    snapToNearestStopIndex,
    TAILWIND_RADIUS_SCALE,
} from "@/features/editor/ui/tailwind-controls/lib/radius";

describe("buildRadiusStops", () => {
    it("returns default Tailwind scale with no project vars", () => {
        const stops = buildRadiusStops([]);
        expect(stops).toHaveLength(TAILWIND_RADIUS_SCALE.length);
        expect(stops.find((s) => s.label === "md")?.px).toBe(6);
    });

    it("overrides md stop when --radius-md is defined in project", () => {
        const stops = buildRadiusStops([
            { name: "--radius-md", value: "10px", line: 1, kind: "size", section: "size" },
        ]);
        expect(stops.find((s) => s.label === "md")?.px).toBe(10);
        expect(stops.find((s) => s.label === "md")?.cls).toBe("rounded-md");
    });

    it("overrides DEFAULT when --radius is defined", () => {
        const stops = buildRadiusStops([
            { name: "--radius", value: "0.5rem", line: 1, kind: "size", section: "size" },
        ]);
        expect(stops.find((s) => s.label === "DEFAULT")?.px).toBe(8);
    });
});

describe("snapToNearestStopIndex", () => {
    it("snaps to nearest px stop", () => {
        const stops = buildRadiusStops([]);
        expect(snapToNearestStopIndex(7, stops)).toBe(findStopIndexByClass("rounded-lg", stops));
        expect(snapToNearestStopIndex(0, stops)).toBe(0);
    });
});

describe("previewRadiusPx", () => {
    it("caps full at 16 for swatch", () => {
        expect(previewRadiusPx("rounded-full")).toBe(16);
    });

    it("returns sm preview", () => {
        expect(previewRadiusPx("rounded-sm")).toBe(2);
    });

    it("uses project override for preview", () => {
        const stops = buildRadiusStops([
            { name: "--radius-lg", value: "20px", line: 1, kind: "size", section: "size" },
        ]);
        expect(previewRadiusPx("rounded-lg", stops)).toBe(16);
    });
});

describe("findStopByClass", () => {
    it("maps rounded to DEFAULT", () => {
        expect(findStopByClass("rounded", TAILWIND_RADIUS_SCALE)?.label).toBe("DEFAULT");
    });
});
