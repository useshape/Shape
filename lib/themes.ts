/**
 * Color theme registry. Shape is a dark-only product — every theme here is a
 * dark theme, differentiated by surface tone and accent. No light mode.
 *
 * Theme ids are stable for settings migration; labels/styles may evolve.
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
        description: "Deeper charcoal with calm neutral selection.",
        swatch: { background: "#0e0e0e", surface: "#161616", accent: "#a8a8a8" },
    },
    one: {
        id: "one",
        label: "One",
        description: "Soft slate surfaces, muted teal accent.",
        swatch: { background: "#1c1f24", surface: "#23272e", accent: "#7aa2a8" },
    },
    purple: {
        id: "purple",
        label: "Umber",
        description: "Warm brownish-red charcoal, soft clay accent.",
        swatch: { background: "#1a1514", surface: "#221c1a", accent: "#c4a484" },
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
