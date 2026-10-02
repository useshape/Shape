/**
 * Color theme registry. Auto follows the OS; Dark is the fallback.
 */

export type ColorThemeId = "auto" | "dark" | "light";

export interface ColorThemeDefinition {
    id: ColorThemeId;
    label: string;
    description: string;
    swatch: {
        background: string;
        surface: string;
        accent: string;
    };
}

export const COLOR_THEMES: Record<ColorThemeId, ColorThemeDefinition> = {
    auto: {
        id: "auto",
        label: "Auto",
        description: "Match the system.",
        swatch: { background: "#141414", surface: "#1a1a1a", accent: "#3946ff" },
    },
    dark: {
        id: "dark",
        label: "Dark",
        description: "Neutral charcoal.",
        swatch: { background: "#141414", surface: "#1a1a1a", accent: "#3946ff" },
    },
    light: {
        id: "light",
        label: "Light",
        description: "Soft light chrome.",
        swatch: { background: "#f4f4f5", surface: "#ffffff", accent: "#3946ff" },
    },
};

export const COLOR_THEME_ORDER: ColorThemeId[] = ["auto", "dark", "light"];

export function isColorThemeId(value: unknown): value is ColorThemeId {
    return typeof value === "string" && value in COLOR_THEMES;
}

export function resolveColorTheme(theme: ColorThemeId): "dark" | "light" {
    if (theme === "light") return "light";
    if (theme === "dark") return "dark";
    if (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
        return "light";
    }
    return "dark";
}

export function isDarkColorTheme(theme: ColorThemeId): boolean {
    return resolveColorTheme(theme) !== "light";
}

export function normalizeColorTheme(value: unknown): ColorThemeId {
    if (isColorThemeId(value)) return value;
    return "auto";
}
