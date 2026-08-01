import { describe, expect, it } from "vitest";
import { isGradient, parseGradient, stringifyGradient } from "@/features/editor/ui/color-picker/ui/gradient-utils";

describe("gradient-utils", () => {
    it("detects gradients", () => {
        expect(isGradient("linear-gradient(90deg, red, blue)")).toBe(true);
        expect(isGradient("#ff0000")).toBe(false);
    });

    it("parses linear gradient", () => {
        const parsed = parseGradient("linear-gradient(90deg, red 0%, blue 100%)");
        expect(parsed?.type).toBe("linear");
        expect(parsed?.direction).toBe("90deg");
        expect(parsed?.stops).toHaveLength(2);
    });

    it("parses repeating radial gradient", () => {
        const parsed = parseGradient("repeating-radial-gradient(circle, red, blue)");
        expect(parsed?.type).toBe("radial");
        expect(parsed?.repeating).toBe(true);
    });

    it("returns null for invalid gradient", () => {
        expect(parseGradient("not-a-gradient")).toBeNull();
    });

    it("round-trips stringify", () => {
        const input = "linear-gradient(180deg, #000 0%, #fff 100%)";
        const parsed = parseGradient(input);
        expect(parsed).not.toBeNull();
        const output = stringifyGradient(parsed!);
        expect(output).toContain("linear-gradient");
        expect(output).toContain("#000");
    });
});
