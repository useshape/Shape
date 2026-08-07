import { describe, expect, it } from "vitest";
import { applyAppearanceSettings, DEFAULT_SETTINGS, type ShapeSettings } from "@/lib/settings";
import { COLOR_THEMES, isColorThemeId, normalizeColorTheme } from "@/lib/themes";

function withColorTheme(colorTheme: unknown): ShapeSettings {
    return {
        ...DEFAULT_SETTINGS,
        appearance: { ...DEFAULT_SETTINGS.appearance, colorTheme } as ShapeSettings["appearance"],
    };
}

describe("theme registry", () => {
    it("registers dark, graphite, one, and purple (Umber)", () => {
        expect(Object.keys(COLOR_THEMES).sort()).toEqual([
            "dark",
            "graphite",
            "one",
            "purple",
        ]);
        expect(COLOR_THEMES.purple.label).toBe("Umber");
    });

    it("recognizes valid theme ids", () => {
        expect(isColorThemeId("graphite")).toBe(true);
        expect(isColorThemeId("one")).toBe(true);
        expect(isColorThemeId("light")).toBe(false);
        expect(isColorThemeId("nonexistent")).toBe(false);
    });

    it("migrates unknown themes to dark", () => {
        expect(normalizeColorTheme("solarized")).toBe("dark");
        expect(normalizeColorTheme("nord")).toBe("dark");
        expect(normalizeColorTheme("ember")).toBe("dark");
        expect(normalizeColorTheme("light")).toBe("dark");
        expect(normalizeColorTheme(undefined)).toBe("dark");
    });

    it("keeps known themes unchanged", () => {
        expect(normalizeColorTheme("purple")).toBe("purple");
        expect(normalizeColorTheme("graphite")).toBe("graphite");
        expect(normalizeColorTheme("one")).toBe("one");
    });
});

describe("applyAppearanceSettings", () => {
    it("clears data-theme for the default dark theme", () => {
        applyAppearanceSettings(withColorTheme("dark"));
        expect(document.documentElement.dataset.theme).toBeUndefined();
    });

    it("migrates removed light theme to dark", () => {
        applyAppearanceSettings(withColorTheme("light"));
        expect(document.documentElement.dataset.theme).toBeUndefined();
    });

    it("sets data-theme for graphite", () => {
        applyAppearanceSettings(withColorTheme("graphite"));
        expect(document.documentElement.dataset.theme).toBe("graphite");
    });

    it("sets data-theme for one", () => {
        applyAppearanceSettings(withColorTheme("one"));
        expect(document.documentElement.dataset.theme).toBe("one");
    });

    it("sets data-theme for purple", () => {
        applyAppearanceSettings(withColorTheme("purple"));
        expect(document.documentElement.dataset.theme).toBe("purple");
    });
});
