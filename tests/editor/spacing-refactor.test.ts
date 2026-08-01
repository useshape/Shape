import { describe, expect, it } from "vitest";
import {
    applySpacingScaleRefactor,
    planSpacingScaleRefactor,
} from "@/features/editor/lib/spacing-refactor";

describe("spacing scale refactor", () => {
    it("plans surgical replacements for a scale value", () => {
        const src = `className="flex gap-4 p-4 m-2"`;
        const matches = planSpacingScaleRefactor(src, "4", "8");
        expect(matches).toHaveLength(2);
        expect(matches.every((m) => m.from === "4" && m.to === "8")).toBe(true);
    });

    it("applies from end so offsets stay valid", () => {
        const src = `className="gap-4 p-4"`;
        const matches = planSpacingScaleRefactor(src, "4", "2");
        const next = applySpacingScaleRefactor(src, matches);
        expect(next).toBe(`className="gap-2 p-2"`);
    });

    it("leaves non-matching scales alone", () => {
        const src = `className="gap-4 p-[4px]"`;
        const matches = planSpacingScaleRefactor(src, "4", "8");
        // p-[4px] is spacing-px, not spacing-scale
        expect(matches).toHaveLength(1);
        expect(applySpacingScaleRefactor(src, matches)).toBe(`className="gap-8 p-[4px]"`);
    });
});
