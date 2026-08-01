import { describe, expect, it } from "vitest";
import {
    classifyTailwindColorToken,
    findColorTokenAtColumn,
    findTailwindTokenAtColumn,
    getTailwindDocsUrl,
    isDecoratableColorToken,
    parseTailwindToken,
} from "@/features/editor/ui/color-picker/tailwind-utils";

describe("tailwind-utils", () => {
    it("parses tailwind color token", () => {
        const parsed = parseTailwindToken("bg-red-500");
        expect(parsed).toMatchObject({
            prefix: "bg",
            family: "red",
            shade: "500",
        });
    });

    it("parses token with opacity modifier", () => {
        const parsed = parseTailwindToken("text-blue-500/50");
        expect(parsed?.alpha).toBe(0.5);
    });

    it("returns null for invalid token", () => {
        expect(parseTailwindToken("not-tailwind")).toBeNull();
    });

    it("finds token at column", () => {
        const line = 'className="bg-red-500 text-white"';
        const col = line.indexOf("bg-red-500") + 3;
        expect(findTailwindTokenAtColumn(line, col)).toBe("bg-red-500");
    });

    it("finds color token at column", () => {
        const line = "color: #ff0000;";
        const col = line.indexOf("#") + 2;
        const found = findColorTokenAtColumn(line, col);
        expect(found?.token).toBe("#ff0000");
    });

    it("builds docs url for color family", () => {
        expect(getTailwindDocsUrl("bg-red-500")).toContain("background-color");
    });

    it("classifies default tailwind scale vs project semantic tokens", () => {
        expect(classifyTailwindColorToken("ring-blue-100")).toBe("default-scale");
        expect(classifyTailwindColorToken("ring-border-focus")).toBe("project-semantic");
    });

    it("rejects non-color tokens that share color prefixes", () => {
        expect(isDecoratableColorToken("text-sm")).toBe(false);
        expect(isDecoratableColorToken("border-2")).toBe(false);
        expect(isDecoratableColorToken("shadow-md")).toBe(false);
        expect(isDecoratableColorToken("border-radius", "  border-radius: 8px;", 2)).toBe(false);
        expect(findColorTokenAtColumn("  border-radius: 8px;", 5)).toBeNull();
        expect(findColorTokenAtColumn("  color: #ff0000;", 12)?.token).toBe("#ff0000");
        expect(isDecoratableColorToken("bg-red-500")).toBe(true);
        expect(isDecoratableColorToken("linear-gradient(90deg, #000 0%, #fff 100%)")).toBe(true);
    });
});
