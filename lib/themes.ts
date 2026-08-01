/**
 * Color theme registry. Shape is a dark-only product - every theme here is a
 * dark theme, differentiated by surface tone and accent color. No light mode.
 */

export type ColorThemeId = "dark" | "graphite" | "one" | "purple";

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
    graphite: {
        id: "graphite",
        label: "Graphite",
        description: "Zed-style charcoal with a cool blue accent.",
        swatch: { background: "#111111", surface: "#191919", accent: "#4d80f7" },
    },
    one: {
        id: "one",
        label: "One",
        description: "One Dark - the Atom classic.",
        swatch: { background: "#282c34", surface: "#21252b", accent: "#61afef" },
    },
    purple: {
        id: "purple",
        label: "Purple",
        description: "Deep purple surfaces, violet accent.",
        swatch: { background: "#16121c", surface: "#1e1828", accent: "#a78bfa" },
    },
};

export const COLOR_THEME_ORDER: ColorThemeId[] = [
    "dark",
    "graphite",
    "one",
    "purple",
];

export function isColorThemeId(value: unknown): value is ColorThemeId {
    return typeof value === "string" && value in COLOR_THEMES;
}

/** Migrate unknown/removed values (e.g. the old "light" theme) to dark. */
export function normalizeColorTheme(value: unknown): ColorThemeId {
    return isColorThemeId(value) ? value : "dark";
}
