import { describe, expect, it } from "vitest";
import { parseBezier, stringifyBezier } from "@/features/editor/ui/bezier-picker/ui/bezier-utils";

describe("bezier-utils", () => {
    it("parses preset names", () => {
        const parsed = parseBezier("ease-in-out");
        expect(parsed?.format).toBe("preset");
        expect(parsed?.presetName).toBe("ease-in-out");
    });

    it("parses cubic-bezier()", () => {
        const parsed = parseBezier("cubic-bezier(0.1, 0.2, 0.3, 0.4)");
        expect(parsed?.format).toBe("cubic-bezier");
        expect(parsed?.points).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it("parses array syntax", () => {
        const parsed = parseBezier("[0, 0, 1, 1]");
        expect(parsed?.format).toBe("array");
        expect(parsed?.points).toEqual([0, 0, 1, 1]);
    });

    it("returns null for invalid input", () => {
        expect(parseBezier("not-a-bezier-curve")).toBeNull();
    });

    it("stringifies cubic-bezier format", () => {
        expect(stringifyBezier([0.25, 0.1, 0.25, 1], "cubic-bezier")).toBe(
            "cubic-bezier(0.25, 0.1, 0.25, 1)",
        );
    });
});
