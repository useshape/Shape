import { describe, expect, it } from "vitest";
import {
    cssColorToHex,
    colorParts,
    firstFontFamily,
    isFlexDisplay,
    isGradient,
    isTransparentColor,
    normalizeAlign,
    normalizeJustify,
    normalizeTextAlign,
    normalizeWeight,
    opacityPercent,
    parsePx,
    px,
    shadowPresetId,
    toCssColor,
} from "@/features/preview/design-mode/css";

describe("design mode css helpers", () => {
    it("parses px lengths including negatives and rem", () => {
        expect(parsePx("16px")).toBe(16);
        expect(parsePx("-8px")).toBe(-8);
        expect(parsePx("1rem")).toBe(16);
        expect(parsePx("auto")).toBeNull();
        expect(parsePx("normal")).toBeNull();
        expect(parsePx("100%")).toBeNull();
        expect(px(12)).toBe("12px");
    });

    it("extracts the first font family from a stack", () => {
        expect(firstFontFamily('"IBM Plex Mono", ui-monospace, monospace')).toBe("IBM Plex Mono");
        expect(firstFontFamily("Inter, ui-sans-serif, system-ui")).toBe("Inter");
    });

    it("normalizes layout and type tokens", () => {
        expect(normalizeJustify("start")).toBe("flex-start");
        expect(normalizeJustify("space-between")).toBe("space-between");
        expect(normalizeAlign("end")).toBe("flex-end");
        expect(normalizeTextAlign("start")).toBe("left");
        expect(normalizeWeight("bold")).toBe("700");
        expect(normalizeWeight("normal")).toBe("400");
        expect(isFlexDisplay("inline-flex")).toBe(true);
        expect(isFlexDisplay("block")).toBe(false);
    });

    it("converts colors and treats gradients as fills", () => {
        expect(isTransparentColor("rgba(0, 0, 0, 0)")).toBe(true);
        expect(isTransparentColor("transparent")).toBe(true);
        expect(isGradient("linear-gradient(red, blue)")).toBe(true);
        expect(isTransparentColor("linear-gradient(red, blue)")).toBe(false);
        expect(cssColorToHex("rgb(255, 0, 0)").toLowerCase()).toBe("#ff0000");
        expect(colorParts("rgba(255, 0, 0, 0.5)")).toEqual({ hex: "FF0000", alphaPct: 50 });
        expect(toCssColor("#0a0a0a")).toBe("#0a0a0a");
        expect(opacityPercent("0.5")).toBe(50);
        expect(shadowPresetId("none")).toBe("none");
        expect(shadowPresetId("0 4px 6px rgb(0 0 0 / 0.12)")).toBe("md");
    });
});
