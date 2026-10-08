/**
 * Color theme registry. The product is dark-only.
 */

export type ColorThemeId = "dark";

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
    dark: {
        id: "dark",
        label: "Dark",
        description: "Neutral charcoal.",
        swatch: { background: "#141414", surface: "#1a1a1a", accent: "#3946ff" },
    },
};

export const COLOR_THEME_ORDER: ColorThemeId[] = ["dark"];

export function isColorThemeId(value: unknown): value is ColorThemeId {
    return value === "dark";
}

export function resolveColorTheme(_theme?: ColorThemeId): "dark" {
    return "dark";
}

export function isDarkColorTheme(_theme?: ColorThemeId): boolean {
    return true;
}

/** Migrate auto/light/unknown values to dark. */
export function normalizeColorTheme(_value: unknown): ColorThemeId {
    return "dark";
}
