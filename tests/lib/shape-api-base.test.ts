import { describe, expect, it } from "vitest";
import { resolveShapeApiBase, SHAPE_PRODUCTION_ORIGIN } from "@/lib/shape-auth/api";

describe("resolveShapeApiBase", () => {
    it("pins production builds to www.useshape.org", () => {
        expect(resolveShapeApiBase("production", "http://localhost:3000")).toBe(
            SHAPE_PRODUCTION_ORIGIN,
        );
        expect(resolveShapeApiBase("production", undefined)).toBe(SHAPE_PRODUCTION_ORIGIN);
        expect(SHAPE_PRODUCTION_ORIGIN).toBe("https://www.useshape.org");
    });

    it("uses env override in development", () => {
        expect(resolveShapeApiBase("development", "https://useshape.org")).toBe(
            "https://useshape.org",
        );
        expect(resolveShapeApiBase("development", "http://localhost:3000/")).toBe(
            "http://localhost:3000",
        );
    });

    it("falls back to localhost in development", () => {
        expect(resolveShapeApiBase("development", undefined)).toBe("http://localhost:3000");
        expect(resolveShapeApiBase("development", "   ")).toBe("http://localhost:3000");
    });
});
