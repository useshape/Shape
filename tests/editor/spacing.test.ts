import { describe, expect, it } from "vitest";
import {
    buildDirectionEdit,
    buildGapEdit,
    buildPaddingEdit,
    getGapValues,
    getLayoutDirection,
    getPaddingValues,
    pxToSpacingToken,
    spacingSuffixToPx,
} from "@/features/editor/ui/tailwind-controls/lib/spacing";

describe("spacingSuffixToPx", () => {
    it("converts scale values", () => {
        expect(spacingSuffixToPx("4")).toBe(16);
        expect(spacingSuffixToPx("1.5")).toBe(6);
        expect(spacingSuffixToPx("0")).toBe(0);
    });

    it("converts px keyword and arbitrary values", () => {
        expect(spacingSuffixToPx("px")).toBe(1);
        expect(spacingSuffixToPx("[24px]")).toBe(24);
        expect(spacingSuffixToPx("[1.5rem]")).toBe(24);
    });

    it("returns null for unknown values", () => {
        expect(spacingSuffixToPx("[50%]")).toBeNull();
    });
});

describe("pxToSpacingToken", () => {
    it("uses the scale when divisible", () => {
        expect(pxToSpacingToken("p", 16)).toBe("p-4");
        expect(pxToSpacingToken("gap", 6)).toBe("gap-1.5");
        expect(pxToSpacingToken("p", 1)).toBe("p-px");
    });

    it("falls back to arbitrary px", () => {
        expect(pxToSpacingToken("p", 25)).toBe("p-[25px]");
    });
});

describe("getGapValues / getPaddingValues", () => {
    it("reads unified gap", () => {
        expect(getGapValues(["flex", "gap-4"])).toEqual({ x: 16, y: 16 });
    });

    it("reads axis gaps", () => {
        expect(getGapValues(["gap-x-2", "gap-y-6"])).toEqual({ x: 8, y: 24 });
    });

    it("reads shorthand and side padding with side precedence", () => {
        expect(getPaddingValues(["p-4"])).toEqual({ left: 16, top: 16, right: 16, bottom: 16 });
        expect(getPaddingValues(["pl-6", "p-4"])).toEqual({ left: 24, top: 16, right: 16, bottom: 16 });
        expect(getPaddingValues(["px-2", "py-8"])).toEqual({ left: 8, top: 32, right: 8, bottom: 32 });
    });
});

describe("buildGapEdit", () => {
    it("splits a unified gap when one axis changes", () => {
        const edit = buildGapEdit(["flex", "gap-4"], "x", 8);
        expect(edit.remove).toContain("gap-4");
        expect(edit.add).toEqual(expect.arrayContaining(["gap-x-2", "gap-y-4"]));
    });

    it("collapses to unified gap when axes match", () => {
        const edit = buildGapEdit(["gap-x-2", "gap-y-4"], "x", 16);
        expect(edit.add).toEqual(["gap-4"]);
        expect(edit.remove).toEqual(expect.arrayContaining(["gap-x-2", "gap-y-4"]));
    });
});

describe("buildPaddingEdit", () => {
    it("expands shorthand when one side changes", () => {
        const edit = buildPaddingEdit(["p-4"], "left", 24);
        expect(edit.remove).toContain("p-4");
        expect(edit.add).toEqual(expect.arrayContaining(["pl-6", "pt-4", "pr-4", "pb-4"]));
    });

    it("collapses to p-N when all sides match", () => {
        const edit = buildPaddingEdit(["pl-2", "pt-4", "pr-4", "pb-4"], "left", 16);
        expect(edit.add).toEqual(["p-4"]);
        expect(edit.remove).toEqual(expect.arrayContaining(["pl-2", "pt-4", "pr-4", "pb-4"]));
    });

    it("collapses to axis tokens when pairs match", () => {
        const edit = buildPaddingEdit(["pl-2", "pt-4", "pr-4", "pb-4"], "left", 16);
        expect(edit.add).toEqual(["p-4"]);
    });
});

describe("direction", () => {
    it("detects direction", () => {
        expect(getLayoutDirection(["flex", "flex-col"])).toBe("flex-col");
        expect(getLayoutDirection(["flex"])).toBe("flex-row");
        expect(getLayoutDirection(["grid", "gap-2"])).toBe("grid");
        expect(getLayoutDirection(["block"])).toBeNull();
    });

    it("switches flex to grid", () => {
        const edit = buildDirectionEdit(["flex", "flex-col", "gap-2"], "grid");
        expect(edit.add).toEqual(["grid"]);
        expect(edit.remove).toEqual(expect.arrayContaining(["flex", "flex-col"]));
    });

    it("switches grid to flex column", () => {
        const edit = buildDirectionEdit(["grid", "gap-2"], "flex-col");
        expect(edit.add).toEqual(expect.arrayContaining(["flex", "flex-col"]));
        expect(edit.remove).toEqual(["grid"]);
    });
});
