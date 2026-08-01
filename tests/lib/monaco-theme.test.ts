import { describe, expect, it } from "vitest";
import {
    toMonacoColor,
    toMonacoOpaqueColor,
    toMonacoTokenForeground,
} from "@/lib/ui/monaco-color";

describe("toMonacoColor", () => {
    it("expands 3-digit hex (CSS minifier / #111 Graphite failure)", () => {
        expect(toMonacoColor("#111", "#141414")).toBe("#111111");
        expect(toMonacoColor("#abc", "#141414")).toBe("#aabbcc");
    });

    it("keeps 6 and 8 digit hex", () => {
        expect(toMonacoColor("#111111", "#141414")).toBe("#111111");
        expect(toMonacoColor("#ffffff0b", "#141414")).toBe("#ffffff0b");
        expect(toMonacoColor("ededee", "#141414")).toBe("#ededee");
    });

    it("converts rgb and rgba", () => {
        expect(toMonacoColor("rgb(17, 17, 17)", "#141414")).toBe("#111111");
        expect(toMonacoColor("rgba(255, 255, 255, 0.5)", "#141414")).toBe("#ffffff80");
    });

    it("falls back on invalid values", () => {
        expect(toMonacoColor("oklch(0.5 0.1 100)", "#141414")).toBe("#141414");
        expect(toMonacoColor("", "#abcdef")).toBe("#abcdef");
    });

    it("opaque colors drop alpha for ColorMap", () => {
        expect(toMonacoOpaqueColor("#111", "#141414")).toBe("#111111");
        expect(toMonacoOpaqueColor("#ffffff0b", "#141414")).toBe("#ffffff");
        expect(toMonacoOpaqueColor("rgba(17,17,17,0.5)", "#141414")).toBe("#111111");
    });

    it("token foregrounds omit #", () => {
        expect(toMonacoTokenForeground("#111", "ededee")).toBe("111111");
        expect(toMonacoTokenForeground("#ededee", "000000")).toBe("ededee");
    });
});
