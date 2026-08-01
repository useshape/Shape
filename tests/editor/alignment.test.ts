import { describe, expect, it } from "vitest";
import {
    FLEX_DIRECTION,
    getAlignmentTokens,
    isFlexRow,
    pickInGroup,
    toggleReverse,
} from "@/features/editor/ui/tailwind-controls/lib/alignment";

describe("pickInGroup", () => {
    it("replaces justify without touching flex-1", () => {
        const tokens = ["flex-1", "justify-start", "items-center"];
        const { add, remove } = pickInGroup(tokens, ["justify-start", "justify-center", "justify-between"], "justify-between");
        expect(remove).toEqual(["justify-start"]);
        expect(add).toEqual(["justify-between"]);
    });

    it("does not add duplicate if already active", () => {
        const tokens = ["flex-1", "justify-between"];
        const { add, remove } = pickInGroup(tokens, ["justify-between"], "justify-between");
        expect(add).toEqual([]);
        expect(remove).toEqual([]);
    });
});

describe("getAlignmentTokens", () => {
    it("extracts alignment utilities only", () => {
        const tokens = ["flex-1", "justify-between", "text-sm", "items-center"];
        expect(getAlignmentTokens(tokens)).toEqual(["justify-between", "items-center"]);
    });

    it("does not treat flex-1 as flex direction", () => {
        const tokens = ["flex-1", "gap-2"];
        expect(getAlignmentTokens(tokens)).toEqual([]);
    });
});

describe("isFlexRow", () => {
    it("defaults to row when no direction set", () => {
        expect(isFlexRow(["flex-1"])).toBe(true);
    });

    it("detects column", () => {
        expect(isFlexRow(["flex-col", "gap-2"])).toBe(false);
    });
});

describe("toggleReverse", () => {
    it("toggles flex-row to flex-row-reverse", () => {
        const { add, remove } = toggleReverse(["flex-row", "gap-2"]);
        expect(remove).toContain("flex-row");
        expect(add).toContain("flex-row-reverse");
    });
});

describe("FLEX_DIRECTION groups", () => {
    it("switching direction removes previous direction class", () => {
        const tokens = ["flex-row", "flex-1"];
        const { add, remove } = pickInGroup(tokens, FLEX_DIRECTION, "flex-col");
        expect(remove).toContain("flex-row");
        expect(add).toContain("flex-col");
    });
});
