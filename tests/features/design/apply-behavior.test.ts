import { describe, expect, it } from "vitest";
import { mergeClassTokens, stylesToClassTokens } from "@/features/preview/design/apply/class-tokens";
import {
    isCssInJsOwned,
    looksLikeCssInJsClass,
    splitVarAndPlain,
} from "@/features/preview/design/apply/commit-edits";
import type { DesignPendingEdit } from "@/features/preview/design/types";

describe("flex wrap / unwrap tokens", () => {
    it("adds flex tokens when wrapping", () => {
        expect(stylesToClassTokens({ display: "flex", flexDirection: "row" })).toEqual(["flex", "flex-row"]);
    });

    it("strips flex child tokens when unwrapping to block", () => {
        const next = mergeClassTokens(
            ["browse", "flex", "flex-row", "justify-center", "items-center", "gap-[178px]"],
            ["block"],
        );
        expect(next).toContain("browse");
        expect(next).toContain("block");
        expect(next).not.toContain("flex");
        expect(next).not.toContain("flex-row");
        expect(next).not.toContain("justify-center");
        expect(next).not.toContain("items-center");
        expect(next).not.toContain("gap-[178px]");
    });

    it("keeps flex-row when staying in flex", () => {
        const next = mergeClassTokens(["flex", "flex-row"], ["flex", "flex-col"]);
        expect(next).toContain("flex");
        expect(next).toContain("flex-col");
        expect(next).not.toContain("flex-row");
    });
});

describe("typography tokens (type settings)", () => {
    it("maps italic, case, decoration, and truncate", () => {
        expect(stylesToClassTokens({ fontStyle: "italic" })).toEqual(["italic"]);
        expect(stylesToClassTokens({ textTransform: "uppercase" })).toEqual(["uppercase"]);
        expect(stylesToClassTokens({ textDecoration: "underline" })).toEqual(["underline"]);
        expect(stylesToClassTokens({ textDecoration: "line-through" })).toEqual(["line-through"]);
        expect(
            stylesToClassTokens({ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }),
        ).toEqual(expect.arrayContaining(["overflow-hidden", "whitespace-nowrap", "truncate"]));
    });
});

describe("CSS variables vs a picked color", () => {
    const inspect = (authored: string, computed: string): DesignPendingEdit["inspect"] =>
        ({
            origins: {
                color: {
                    property: "color",
                    computed,
                    authored,
                    source: { kind: "variable", label: authored },
                    inherited: false,
                    overridden: false,
                    inactive: false,
                },
            },
        }) as DesignPendingEdit["inspect"];

    it("drops a leaked computed color that still matches the CSS variable", () => {
        const { plain, variables } = splitVarAndPlain({
            id: "x",
            label: "h2",
            tag: "h2",
            styles: { color: "rgb(8, 45, 87)" },
            inspect: inspect("var(--navy)", "rgb(8, 45, 87)"),
        });
        expect(plain.color).toBeUndefined();
        expect(variables).toHaveLength(0);
    });

    it("writes a newly picked hex instead of refusing the token", () => {
        const { plain, variables } = splitVarAndPlain({
            id: "x",
            label: "h2",
            tag: "h2",
            styles: { color: "#ff0000" },
            inspect: inspect("var(--navy)", "rgb(8, 45, 87)"),
        });
        expect(plain.color).toBe("#ff0000");
        expect(variables).toHaveLength(0);
    });
});

describe("CSS-in-JS ownership", () => {
    it("detects emotion / styled-components hashes", () => {
        expect(looksLikeCssInJsClass("css-1a2b3c4")).toBe(true);
        expect(looksLikeCssInJsClass("Button-css-abc")).toBe(true);
        expect(looksLikeCssInJsClass("sc-bdVaJa")).toBe(true);
        expect(looksLikeCssInJsClass("Title-sc-1xyz")).toBe(true);
        expect(looksLikeCssInJsClass("Hero_title__xK3p")).toBe(false);
        expect(looksLikeCssInJsClass("flex")).toBe(false);
    });

    it("fails closed when hashes own styles without a patchable origin", () => {
        expect(
            isCssInJsOwned(
                {
                    id: "x",
                    label: "div",
                    tag: "div",
                    className: "css-1abcde",
                    styles: { color: "#fff" },
                    inspect: {
                        origins: {
                            color: {
                                property: "color",
                                computed: "rgb(255, 255, 255)",
                                authored: "rgb(255, 255, 255)",
                                source: { kind: "computed", label: "computed" },
                                inherited: false,
                                overridden: false,
                                inactive: false,
                            },
                        },
                    } as DesignPendingEdit["inspect"],
                },
                ["color"],
            ),
        ).toBe(true);
    });

    it("does not treat token-backed or utility origins as CSS-in-JS", () => {
        expect(
            isCssInJsOwned(
                {
                    id: "x",
                    label: "div",
                    tag: "div",
                    className: "css-1abcde flex",
                    styles: { color: "#fff" },
                    inspect: {
                        origins: {
                            color: {
                                property: "color",
                                computed: "#fff",
                                authored: "var(--fg)",
                                source: { kind: "variable", label: "var(--fg)" },
                                inherited: false,
                                overridden: false,
                                inactive: false,
                            },
                        },
                    } as DesignPendingEdit["inspect"],
                },
                ["color"],
            ),
        ).toBe(false);
    });
});
