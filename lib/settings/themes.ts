/**
 * Color theme registry. Dark is default; Light is a soft chrome option.
 */

export type ColorThemeId = "dark" | "light";

export interface ColorThemeDefinition {
    id: ColorThemeId;
    label: string;
    /** One line, shown under the theme name in pickers. */
    description: string;
    /** Flat swatch colors used for small, non-live previews. */
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
        description: "Neutral charcoal. The default.",
        swatch: { background: "#141414", surface: "#1a1a1a", accent: "#3946ff" },
    },
    light: {
        id: "light",
        label: "Light",
        description: "Soft light chrome.",
        swatch: { background: "#f4f4f5", surface: "#ffffff", accent: "#3946ff" },
    },
};

export const COLOR_THEME_ORDER: ColorThemeId[] = ["dark", "light"];

export function isColorThemeId(value: unknown): value is ColorThemeId {
    return typeof value === "string" && value in COLOR_THEMES;
}

/** True for themes that use a dark color scheme. */
export function isDarkColorTheme(theme: ColorThemeId): boolean {
    return theme !== "light";
}

/**
 * Migrate unknown/removed values to dark; keep light when valid.
 */
export function normalizeColorTheme(value: unknown): ColorThemeId {
    if (isColorThemeId(value)) return value;
    return "dark";
}
