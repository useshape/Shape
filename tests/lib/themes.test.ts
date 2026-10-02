import { describe, expect, it } from "vitest";
import { applyAppearanceSettings, DEFAULT_SETTINGS, type ShapeSettings } from "@/lib/settings";
import { COLOR_THEMES, isColorThemeId, normalizeColorTheme } from "@/lib/settings/themes";

function withColorTheme(colorTheme: unknown): ShapeSettings {
    return {
        ...DEFAULT_SETTINGS,
        appearance: { ...DEFAULT_SETTINGS.appearance, colorTheme } as ShapeSettings["appearance"],
    };
}

describe("theme registry", () => {
    it("registers auto, dark, and light", () => {
        expect(Object.keys(COLOR_THEMES)).toEqual(["auto", "dark", "light"]);
        expect(COLOR_THEMES.auto.label).toBe("Auto");
        expect(COLOR_THEMES.dark.label).toBe("Dark");
        expect(COLOR_THEMES.light.label).toBe("Light");
    });

    it("recognizes valid theme ids", () => {
        expect(isColorThemeId("auto")).toBe(true);
        expect(isColorThemeId("dark")).toBe(true);
        expect(isColorThemeId("light")).toBe(true);
        expect(isColorThemeId("graphite")).toBe(false);
    });

    it("keeps known themes and migrates unknown themes to auto", () => {
        expect(normalizeColorTheme("light")).toBe("light");
        expect(normalizeColorTheme("auto")).toBe("auto");
        expect(normalizeColorTheme("solarized")).toBe("auto");
        expect(normalizeColorTheme("nord")).toBe("auto");
        expect(normalizeColorTheme("graphite")).toBe("auto");
        expect(normalizeColorTheme(undefined)).toBe("auto");
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

    it("applies light when settings say light", () => {
        applyAppearanceSettings(withColorTheme("light"));
        expect(document.documentElement.dataset.theme).toBe("light");
        expect(document.documentElement.style.colorScheme).toBe("light");
        expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    it("migrates removed accent themes to auto (dark when the OS is not light)", () => {
        applyAppearanceSettings(withColorTheme("graphite"));
        expect(document.documentElement.dataset.theme).toBeUndefined();
        expect(document.documentElement.style.colorScheme).toBe("dark");
    });
});
