/**
 * Color theme registry. Shape ships Dark only — tokens live on `:root`.
 * Theme ids stay for settings migration; unknown values normalize to dark.
 */

export type ColorThemeId = "dark";

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
};

export const COLOR_THEME_ORDER: ColorThemeId[] = ["dark"];

export function isColorThemeId(value: unknown): value is ColorThemeId {
    return typeof value === "string" && value in COLOR_THEMES;
}

/** True for themes that use a dark color scheme (editor chrome + Monaco). */
export function isDarkColorTheme(_theme: ColorThemeId): boolean {
    return true;
}

/**
 * Migrate unknown/removed values (light, graphite, one, purple/Umber, etc.) to dark.
 */
export function normalizeColorTheme(_value: unknown): ColorThemeId {
    return "dark";
}
