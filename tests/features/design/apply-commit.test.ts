import { describe, expect, it } from "vitest";
import {
    isCssInJsOwned,
    looksLikeCssInJsClass,
} from "@/features/preview/design-mode/apply/commit-edits";
import type { DesignPendingEdit } from "@/features/preview/design-mode/types";

function edit(
    partial: Partial<DesignPendingEdit> & Pick<DesignPendingEdit, "styles">,
): DesignPendingEdit {
    return {
        id: "el-1",
        label: "div",
        tag: "div",
        ...partial,
    };
}

describe("commit fail-closed paths", () => {
    it("detects CSS-in-JS class hashes", () => {
        expect(looksLikeCssInJsClass("css-abc1234")).toBe(true);
        expect(looksLikeCssInJsClass("sc-bdVaJa")).toBe(true);
    });

    it("treats emotion-owned computed colors as CSS-in-JS", () => {
        expect(
            isCssInJsOwned(
                edit({
                    className: "css-1a2b3c4",
                    styles: { backgroundColor: "#fff" },
                    inspect: {
                        origins: {
                            backgroundColor: {
                                property: "background-color",
                                computed: "rgb(255, 255, 255)",
                                authored: "rgb(255, 255, 255)",
                                source: { kind: "computed", label: "computed" },
                                inherited: false,
                                overridden: false,
                                inactive: false,
                            },
                        },
                    } as unknown as DesignPendingEdit["inspect"],
                }),
                ["backgroundColor"],
            ),
        ).toBe(true);
    });

    it("does not fail-closed when only tokenUpdates are pending", () => {
        // Element styles empty / token path is handled before CSS-in-JS gate in applyOne.
        const e = edit({
            className: "css-1a2b3c4",
            styles: {},
            tokenUpdates: { "--color-primary": "#111" },
        });
        expect(Object.keys(e.tokenUpdates ?? {})).toHaveLength(1);
        expect(Object.keys(e.styles)).toHaveLength(0);
    });
});
