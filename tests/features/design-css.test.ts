import { describe, expect, it } from "vitest";
import {
    cssColorToHex,
    parseBoxShadow,
    parseCssFunctions,
    serializeBoxShadow,
    serializeCssFunctions,
} from "@/features/preview/design/css";

describe("parseBoxShadow", () => {
    it("parses color-first computed shadows", () => {
        const shadow = parseBoxShadow("rgba(0, 0, 0, 0.2) 0px 2px 3px 0px");
        expect(shadow).toMatchObject({
            x: "0px",
            y: "2px",
            blur: "3px",
            spread: "0px",
            color: "rgba(0, 0, 0, 0.2)",
        });
    });

    it("parses named color after lengths", () => {
        const shadow = parseBoxShadow("2px 4px 8px red");
        expect(shadow).toMatchObject({ x: "2px", y: "4px", blur: "8px", color: "red" });
    });

    it("returns null for none", () => {
        expect(parseBoxShadow("none")).toBeNull();
        expect(parseBoxShadow(undefined)).toBeNull();
    });
});

describe("cssColorToHex", () => {
    it("reads hex and rgb colors", () => {
        expect(cssColorToHex("#abc")).toEqual({ hex: "AABBCC", alpha: 100 });
        expect(cssColorToHex("#00000033")).toEqual({ hex: "000000", alpha: 20 });
        expect(cssColorToHex("rgb(255, 0, 0)")).toEqual({ hex: "FF0000", alpha: 100 });
        expect(cssColorToHex("rgba(0, 0, 0, 0.2)")).toEqual({ hex: "000000", alpha: 20 });
    });
});

describe("css filters", () => {
    it("round-trips filter functions", () => {
        const items = parseCssFunctions("blur(4px) brightness(80%)");
        expect(items).toEqual([
            { type: "blur", amount: "4px" },
            { type: "brightness", amount: "80%" },
        ]);
        expect(serializeCssFunctions(items)).toBe("blur(4px) brightness(80%)");
    });
});

describe("serializeBoxShadow", () => {
    it("updates one part without dropping color", () => {
        const shadow = parseBoxShadow("0px 2px 3px 0px #00000033");
        expect(shadow).not.toBeNull();
        expect(serializeBoxShadow(shadow!, "y", "8px")).toBe("0px 8px 3px 0px #00000033");
    });
});
