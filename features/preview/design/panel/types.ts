export type Styles = Record<string, string>;

export type ThemeToken = { name: string; value: string };

export function css(style: Styles, property: string, fallback = "") {
    const value = style[property];
    return typeof value === "string" && value.length > 0 ? value : fallback;
}
