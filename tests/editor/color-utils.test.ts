import { describe, expect, it } from "vitest";
import { parseToRgba, rgbaToHex, rgbaToHsva, hsvaToRgba } from "@/features/editor/ui/color-picker/ui/color-utils";

describe("color-utils", () => {
    it("parses hex colors", () => {
        expect(parseToRgba("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it("parses short hex", () => {
        expect(parseToRgba("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it("parses rgb()", () => {
        expect(parseToRgba("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    });

    it("parses rgba() with alpha", () => {
        expect(parseToRgba("rgba(10, 20, 30, 0.5)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    });

    it("returns null for invalid input", () => {
        expect(parseToRgba("not-a-color")).toBeNull();
    });

    it("parses hsl() with decimals and deg units", () => {
        expect(parseToRgba("hsl(0deg 100% 50%)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
        expect(parseToRgba("hsl(219.5, 84.2%, 60.1%)")).not.toBeNull();
    });

    it("parses space-separated rgb with slash alpha", () => {
        expect(parseToRgba("rgb(10 20 30 / 0.5)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    });

    it("parses percentage rgb channels", () => {
        expect(parseToRgba("rgb(100% 0% 0%)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it("parses oklch with percent lightness", () => {
        const parsed = parseToRgba("oklch(62.8% 0.258 29.2)");
        expect(parsed).not.toBeNull();
        expect(parsed!.r).toBeGreaterThan(200);
    });

    it("parses oklch with unitless lightness and alpha", () => {
        const parsed = parseToRgba("oklch(0.628 0.258 29.2 / 50%)");
        expect(parsed).not.toBeNull();
        expect(parsed!.a).toBeCloseTo(0.5);
    });

    it("converts rgba to hex", () => {
        expect(rgbaToHex({ r: 255, g: 0, b: 0, a: 1 })).toBe("#ff0000");
    });

    it("round-trips hsva", () => {
        const rgba = { r: 100, g: 150, b: 200, a: 1 };
        const hsva = rgbaToHsva(rgba.r, rgba.g, rgba.b, rgba.a);
        const back = hsvaToRgba(hsva.h, hsva.s, hsva.v, hsva.a);
        expect(back.r).toBeCloseTo(rgba.r, 0);
        expect(back.g).toBeCloseTo(rgba.g, 0);
        expect(back.b).toBeCloseTo(rgba.b, 0);
    });
});
