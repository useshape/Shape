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
    it("registers dark only", () => {
        expect(Object.keys(COLOR_THEMES)).toEqual(["dark"]);
        expect(COLOR_THEMES.dark.label).toBe("Dark");
    });

    it("recognizes valid theme ids", () => {
        expect(isColorThemeId("dark")).toBe(true);
        expect(isColorThemeId("light")).toBe(false);
        expect(isColorThemeId("graphite")).toBe(false);
    });

    it("migrates unknown, light, and removed themes to dark", () => {
        expect(normalizeColorTheme("light")).toBe("dark");
        expect(normalizeColorTheme("solarized")).toBe("dark");
        expect(normalizeColorTheme("nord")).toBe("dark");
        expect(normalizeColorTheme("graphite")).toBe("dark");
        expect(normalizeColorTheme(undefined)).toBe("dark");
        expect(normalizeColorTheme("dark")).toBe("dark");
    });
});

describe("applyAppearanceSettings", () => {
    it("always applies dark root theme", () => {
        applyAppearanceSettings(withColorTheme("dark"));
        expect(document.documentElement.dataset.theme).toBeUndefined();
        expect(document.documentElement.style.colorScheme).toBe("dark");
        expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("forces dark even when settings still say light", () => {
        applyAppearanceSettings(withColorTheme("light"));
        expect(document.documentElement.dataset.theme).toBeUndefined();
        expect(document.documentElement.style.colorScheme).toBe("dark");
        expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("migrates removed accent themes to dark", () => {
        applyAppearanceSettings(withColorTheme("graphite"));
        expect(document.documentElement.dataset.theme).toBeUndefined();
        expect(document.documentElement.style.colorScheme).toBe("dark");
    });
});
