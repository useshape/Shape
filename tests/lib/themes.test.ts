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
    it("registers dark only", () => {
        expect(Object.keys(COLOR_THEMES)).toEqual(["dark"]);
        expect(COLOR_THEMES.dark.label).toBe("Dark");
    });

    it("recognizes only dark", () => {
        expect(isColorThemeId("dark")).toBe(true);
        expect(isColorThemeId("auto")).toBe(false);
        expect(isColorThemeId("light")).toBe(false);
        expect(isColorThemeId("graphite")).toBe(false);
    });

    it("migrates every stored theme to dark", () => {
        expect(normalizeColorTheme("light")).toBe("dark");
        expect(normalizeColorTheme("auto")).toBe("dark");
        expect(normalizeColorTheme("solarized")).toBe("dark");
        expect(normalizeColorTheme(undefined)).toBe("dark");
        expect(normalizeColorTheme("dark")).toBe("dark");
    });
});

describe("applyAppearanceSettings", () => {
    it("always applies dark root theme", () => {
        applyAppearanceSettings(withColorTheme("light"));
        expect(document.documentElement.dataset.theme).toBeUndefined();
        expect(document.documentElement.style.colorScheme).toBe("dark");
        expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
});
