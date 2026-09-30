import { describe, expect, it } from "vitest";
import { getIconPath } from "@/lib/ui/icons/files";

describe("getIconPath", () => {
    it("maps tsx to the react TypeScript icon", () => {
        const tsx = getIconPath("Button.tsx");
        const ts = getIconPath("Button.ts");
        const unknown = getIconPath("Button.zzz");
        expect(tsx.startsWith("data:image/svg+xml")).toBe(true);
        expect(tsx).not.toBe(ts);
        expect(tsx).not.toBe(unknown);
    });

    it("maps Cargo.toml to the cargo icon", () => {
        const cargo = getIconPath("Cargo.toml");
        const plainToml = getIconPath("config.toml");
        expect(cargo).not.toBe(getIconPath("readme.zzz"));
        expect(cargo).not.toBe(plainToml);
    });

    it("falls back to the default file icon", () => {
        const fallback = getIconPath("notes.zzz");
        const other = getIconPath("other.qqq");
        expect(fallback).toBe(other);
        expect(fallback.startsWith("data:image/svg+xml")).toBe(true);
    });
});
