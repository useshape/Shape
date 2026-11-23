import { describe, expect, it } from "vitest";
import { PROJECT_CATEGORIES, PROJECT_PRESETS } from "@/features/chat/ui/shell/project-catalog";

describe("project create catalog", () => {
    it("groups starters into categories with docs presets", () => {
        expect(PROJECT_CATEGORIES.map((category) => category.id)).toEqual([
            "web",
            "server",
            "docs",
            "desktop",
            "mobile",
            "library",
        ]);
        const docs = PROJECT_CATEGORIES.find((category) => category.id === "docs");
        expect(docs?.presets.map((preset) => preset.id)).toEqual([
            "fumadocs",
            "starlight",
            "docusaurus",
            "vitepress",
        ]);
        expect(PROJECT_CATEGORIES.every((category) => category.presets.length > 0)).toBe(true);
        expect(PROJECT_CATEGORIES.every((category) => category.icon.slug.length > 0)).toBe(true);
    });

    it("keeps preset ids unique", () => {
        const ids = PROJECT_PRESETS.map((preset) => preset.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain("next");
        expect(ids).toContain("vite");
        expect(ids).toContain("astro");
        expect(ids).toContain("remix");
    });
});
