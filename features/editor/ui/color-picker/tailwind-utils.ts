"use client";

import { tailwindColors } from "./tailwind-colors";
export { tailwindColors };

// Matches all Tailwind utility prefixes that have dash-based variants.
// Ordered longest-first where prefixes share a common start (e.g. backdrop-blur before backdrop).
export const TAILWIND_COLOR_REGEX_STRING = `(?<!-)\\b(?:bg|text|border|caret|fill|stroke|outline|ring|shadow|divide|accent|placeholder|decoration)-[a-zA-Z0-9_/-]+\\b`;

// Broader pattern that also captures non-color utilities such as spacing, sizing, typography, etc.
const TAILWIND_ALL_PREFIXES = [
    // Colors
    "bg","text","border","ring","divide","outline","fill","stroke","accent","caret","decoration","placeholder","shadow",
    // Spacing
    "px","py","pt","pr","pb","pl","p",
    "mx","my","mt","mr","mb","ml","m",
    "space-x","space-y","space",
    "gap-x","gap-y","gap",
    "indent",
    // Sizing
    "min-w","max-w","min-h","max-h","size","basis","w","h",
    // Typography
    "font","leading","tracking","line-clamp","prose",
    // Flexbox
    "flex","grow","shrink","order",
    "justify-items","justify-self","justify",
    "items","self","content",
    // Grid
    "grid-cols","grid-rows","col-span","col-start","col-end","col",
    "row-span","row-start","row-end","row","grid-flow","auto-cols","auto-rows","grid",
    // Position & spacing
    "inset-x","inset-y","inset","top","right","bottom","left","z",
    // Display (static utilities handled in STATIC set below)
    // Overflow
    "overflow-x","overflow-y","overflow","overscroll-x","overscroll-y","overscroll",
    // Opacity
    "opacity",
    // Effects
    "backdrop-blur","backdrop-brightness","backdrop-contrast","backdrop-grayscale",
    "backdrop-hue-rotate","backdrop-invert","backdrop-opacity","backdrop-saturate","backdrop-sepia","backdrop",
    "blur","brightness","contrast","grayscale","hue-rotate","invert","saturate","sepia",
    "drop-shadow",
    // Transform
    "scale-x","scale-y","scale","rotate","translate-x","translate-y","translate","skew-x","skew-y","skew","origin",
    // Transition & animation
    "transition","duration","ease","delay","animate",
    // Borders
    "rounded-tl","rounded-tr","rounded-bl","rounded-br","rounded-t","rounded-r","rounded-b","rounded-l","rounded",
    "border-t","border-r","border-b","border-l","border-x","border-y",
    // Ring
    "ring-offset","ring-opacity","ring",
    // Outline
    "outline-offset",
    // Gradient
    "from","via","to","bg-gradient",
    // Object
    "object",
    // Cursor
    "cursor",
    // User select
    "select",
    // Aspect ratio
    "aspect",
    // Columns & layout
    "columns","break-before","break-after","break-inside","box-decoration","box",
    "float","clear","mix-blend","bg-blend","isolation",
    // Typography details
    "list","list-image",
    // White space
    "whitespace",
    // Will change
    "will","touch",
    // Misc
    "sr","not-sr","pointer-events","visibility","table","caption","align",
].join("|");

export const TAILWIND_ALL_REGEX_STRING = `(?<!-)\\b(?:${TAILWIND_ALL_PREFIXES})-[a-zA-Z0-9_/.-]+\\b`;

export const GRADIENT_REGEX_STRING = `(?:repeating-)?(?:linear|radial|conic)-gradient\\([^()]*(?:\\([^()]*\\)[^()]*)*\\)`;

export const COLOR_REGEX = new RegExp(
    `${GRADIENT_REGEX_STRING}|#(?:[0-9a-fA-F]{3}){1,2}\\b|#(?:[0-9a-fA-F]{8})\\b|rgba?\\([^)]+\\)|hsla?\\([^)]+\\)|oklch\\([^)]+\\)|transparent|${TAILWIND_COLOR_REGEX_STRING}`,
    "gi"
);

export function parseTailwindToken(token: string): { family: string; shade: string | null; alpha: number | null; prefix: string; rawHexOrOklch: string | null } | null {
    const parts = token.split('/');
    const main = parts[0];
    let alpha = null;
    if (parts.length > 1) {
        const parsed = parseFloat(parts[1]);
        if (!isNaN(parsed)) alpha = parsed / 100;
    }

    const prefixMatch = main.match(/^(bg|text|border|caret|fill|stroke|outline|ring|shadow|divide|accent|placeholder|decoration)-/i);
    if (!prefixMatch) return null;

    const prefix = prefixMatch[1].toLowerCase();
    let rest = main.substring(prefix.length + 1);

    let shade = null;
    const shadeMatch = rest.match(/-(50|100|200|300|400|500|600|700|800|900|950)$/);
    if (shadeMatch) {
        shade = shadeMatch[1];
        rest = rest.substring(0, rest.length - shadeMatch[0].length);
    }
    const family = rest.toLowerCase();

    let rawStr = null;
    const twColors = tailwindColors as Record<string, string | Record<string, string>>;
    if (twColors[family]) {
        if (shade) rawStr = (twColors[family] as Record<string, string>)[shade] || null;
        else rawStr = twColors[family] as string || null;
        if (typeof rawStr === 'object') rawStr = null;
    }

    if (!rawStr && typeof window !== 'undefined') {
        const rootStyles = window.getComputedStyle(document.documentElement);
        const vars = [
            `--${family}${shade ? `-${shade}` : ''}`,
            `--color-${family}${shade ? `-${shade}` : ''}`,
            `--${prefix}-${family}${shade ? `-${shade}` : ''}`
        ];
        for (const v of vars) {
            const val = rootStyles.getPropertyValue(v).trim();
            if (val) {
                rawStr = val;
                break;
            }
        }
    }

    return { prefix, family, shade, alpha, rawHexOrOklch: rawStr };
}

const TAILWIND_DOC_SLUGS: Record<string, string> = {
    // Colors
    bg: "background-color",
    text: "text-color",
    border: "border-color",
    ring: "box-shadow",
    "ring-offset": "box-shadow",
    "ring-opacity": "box-shadow",
    divide: "divide-color",
    outline: "outline-color",
    "outline-offset": "outline-offset",
    fill: "fill",
    stroke: "stroke",
    accent: "accent-color",
    caret: "caret-color",
    decoration: "text-decoration-color",
    placeholder: "placeholder-color",
    shadow: "box-shadow",
    "drop-shadow": "drop-shadow",
    // Spacing
    p: "padding", px: "padding", py: "padding", pt: "padding", pr: "padding", pb: "padding", pl: "padding",
    m: "margin", mx: "margin", my: "margin", mt: "margin", mr: "margin", mb: "margin", ml: "margin",
    space: "space", "space-x": "space", "space-y": "space",
    gap: "gap", "gap-x": "gap", "gap-y": "gap",
    indent: "text-indent",
    // Sizing
    w: "width", h: "height", size: "size",
    "min-w": "min-width", "max-w": "max-width",
    "min-h": "min-height", "max-h": "max-height",
    basis: "flex-basis",
    // Typography
    font: "font-family", leading: "line-height", tracking: "letter-spacing",
    "line-clamp": "line-clamp", prose: "typography",
    list: "list-style-type", "list-image": "list-style-image",
    whitespace: "whitespace",
    // Flexbox
    flex: "flex", grow: "flex-grow", shrink: "flex-shrink", order: "order",
    justify: "justify-content", "justify-items": "justify-items", "justify-self": "justify-self",
    items: "align-items", self: "align-self", content: "align-content",
    // Grid
    grid: "grid-template-columns", "grid-cols": "grid-template-columns", "grid-rows": "grid-template-rows",
    "grid-flow": "grid-auto-flow", "auto-cols": "grid-auto-columns", "auto-rows": "grid-auto-rows",
    col: "grid-column", "col-span": "grid-column", "col-start": "grid-column", "col-end": "grid-column",
    row: "grid-row", "row-span": "grid-row", "row-start": "grid-row", "row-end": "grid-row",
    // Position
    inset: "top-right-bottom-left", "inset-x": "top-right-bottom-left", "inset-y": "top-right-bottom-left",
    top: "top", right: "right", bottom: "bottom", left: "left", z: "z-index",
    // Overflow
    overflow: "overflow", "overflow-x": "overflow", "overflow-y": "overflow",
    overscroll: "overscroll-behavior", "overscroll-x": "overscroll-behavior", "overscroll-y": "overscroll-behavior",
    // Opacity
    opacity: "opacity",
    // Transforms
    scale: "scale", "scale-x": "scale", "scale-y": "scale",
    rotate: "rotate",
    translate: "translate", "translate-x": "translate", "translate-y": "translate",
    skew: "skew", "skew-x": "skew", "skew-y": "skew",
    origin: "transform-origin",
    // Transitions / animation
    transition: "transition-property", duration: "transition-duration",
    ease: "transition-timing-function", delay: "transition-delay",
    animate: "animation",
    // Borders
    rounded: "border-radius",
    "rounded-t": "border-radius", "rounded-r": "border-radius", "rounded-b": "border-radius", "rounded-l": "border-radius",
    "rounded-tl": "border-radius", "rounded-tr": "border-radius", "rounded-bl": "border-radius", "rounded-br": "border-radius",
    "border-t": "border-width", "border-r": "border-width", "border-b": "border-width", "border-l": "border-width",
    "border-x": "border-width", "border-y": "border-width",
    // Effects / filters
    blur: "blur", brightness: "brightness", contrast: "contrast",
    grayscale: "grayscale", "hue-rotate": "hue-rotate", invert: "invert", saturate: "saturate", sepia: "sepia",
    backdrop: "backdrop-blur",
    "backdrop-blur": "backdrop-blur", "backdrop-brightness": "backdrop-brightness",
    "backdrop-contrast": "backdrop-contrast", "backdrop-grayscale": "backdrop-grayscale",
    "backdrop-hue-rotate": "backdrop-hue-rotate", "backdrop-invert": "backdrop-invert",
    "backdrop-opacity": "backdrop-opacity", "backdrop-saturate": "backdrop-saturate",
    "backdrop-sepia": "backdrop-sepia",
    // Gradient
    from: "gradient-color-stops", via: "gradient-color-stops", to: "gradient-color-stops",
    "bg-gradient": "background-image",
    // Layout
    object: "object-fit", aspect: "aspect-ratio",
    columns: "columns",
    "break-before": "break-before", "break-after": "break-after", "break-inside": "break-inside",
    "box-decoration": "box-decoration-break", box: "box-sizing",
    float: "float", clear: "clear",
    "mix-blend": "mix-blend-mode", "bg-blend": "background-blend-mode",
    isolation: "isolation",
    // Interactivity
    cursor: "cursor", select: "user-select", "pointer-events": "pointer-events",
    touch: "touch-action", will: "will-change",
    appearance: "appearance",
    // Typography misc
    sr: "screen-readers",
    // Table
    table: "table-layout", caption: "caption-side", align: "vertical-align",
    visibility: "visibility",
};

export function resolveColorForSwatch(token: string): string {
    const tw = parseTailwindToken(token);
    if (tw?.rawHexOrOklch) return tw.rawHexOrOklch;
    if (/^#|^(?:rgb|hsl|oklch)/i.test(token) || token.includes("gradient")) return token;
    if (token === "transparent") return "transparent";
    return "var(--border-subtle)";
}

export function getTailwindDocsUrl(token: string): string | null {
    // Try full token via color-focused parser first
    const tw = parseTailwindToken(token);
    if (tw) {
        const slug = TAILWIND_DOC_SLUGS[tw.prefix] ?? "utilities";
        return `https://tailwindcss.com/docs/${slug}`;
    }
    // Fall back: match the prefix directly from the token string
    const prefixMatch = token.match(/^([\w-]+)-/);
    if (!prefixMatch) return null;
    const prefix = prefixMatch[1];
    const slug = TAILWIND_DOC_SLUGS[prefix];
    if (!slug) return null;
    return `https://tailwindcss.com/docs/${slug}`;
}

const TAILWIND_TOKEN_REGEX = new RegExp(TAILWIND_COLOR_REGEX_STRING, "gi");
const TAILWIND_ALL_REGEX = new RegExp(TAILWIND_ALL_REGEX_STRING, "gi");

/** Find a Tailwind utility token (color OR any category) at a 1-based column. */
export function findTailwindTokenAtColumn(line: string, column: number): string | null {
    const col = column - 1;
    // Try the broader all-utilities regex first
    TAILWIND_ALL_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TAILWIND_ALL_REGEX.exec(line)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (col >= start && col < end) return match[0];
    }
    // Fall back to color-only regex
    TAILWIND_TOKEN_REGEX.lastIndex = 0;
    while ((match = TAILWIND_TOKEN_REGEX.exec(line)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (col >= start && col < end) return match[0];
    }
    return null;
}

/**
 * True only for tokens that are real color values / color utilities.
 * Rejects CSS property names (border-radius), size utilities (text-sm), etc.
 */
export function isDecoratableColorToken(
    token: string,
    line?: string,
    matchStart?: number,
): boolean {
    const t = token.trim();
    if (!t) return false;

    // Property name followed by `:` is never a color value (e.g. border-radius: 8px).
    if (line != null && matchStart != null) {
        const after = line.slice(matchStart + t.length);
        if (/^\s*:/.test(after)) return false;
    }

    if (/(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i.test(t)) return true;
    if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/.test(t)) return true;
    if (/^(?:rgba?|hsla?|oklch)\(/i.test(t)) return true;
    if (/^transparent$/i.test(t)) return true;

    const parsed = parseTailwindToken(t);
    if (!parsed) return false;

    const { prefix, family, shade, rawHexOrOklch } = parsed;

    if (prefix === "text" && NON_COLOR_TEXT_FAMILIES.has(family)) return false;
    if (prefix === "border") {
        if (NON_COLOR_BORDER_FAMILIES.has(family)) return false;
        if (/^\d+$/.test(family) && !shade) return false;
        if (family === "radius" || family.startsWith("radius-")) return false;
        if (family === "width" || family === "style" || family === "collapse" || family === "spacing") {
            return false;
        }
    }
    if (prefix === "outline") {
        if (NON_COLOR_OUTLINE_FAMILIES.has(family)) return false;
        if (/^\d+$/.test(family) && !shade) return false;
        if (family === "offset") return false;
    }
    if (prefix === "shadow" && NON_COLOR_SHADOW_FAMILIES.has(family)) return false;
    if (prefix === "ring" && (/^\d+$/.test(family) || family.startsWith("offset")) && !shade) return false;
    if (prefix === "stroke" && /^\d+$/.test(family) && !shade) return false;
    if (prefix === "decoration" && NON_COLOR_DECORATION_FAMILIES.has(family)) return false;
    if (prefix === "bg" && NON_COLOR_BG_FAMILIES.has(family)) return false;

    if (/^\[(?:#|rgba?\(|hsla?\(|oklch\(|var\(--)/i.test(family)) return true;
    if (rawHexOrOklch) return true;

    const twColors = tailwindColors as Record<string, string | Record<string, string>>;
    if (shade && twColors[family] && typeof twColors[family] === "object") return true;
    if (!shade && typeof twColors[family] === "string") return true;

    // Theme / project color utilities (bg-panel, text-accent) — allow picking even before var resolve.
    if (
        /^(panel|surface|accent|muted|primary|secondary|foreground|background|destructive|warning|success|info|card|popover|sidebar)(?:-|$)/i.test(family)
        || /(?:^|-)(?:border|text|bg|ring|color)(?:-|$)/i.test(family)
    ) {
        return true;
    }

    return false;
}

/** Find any color token (hex, rgb, tailwind, etc.) at a 1-based column. */
export function findColorTokenAtColumn(line: string, column: number): { token: string; start: number; end: number } | null {
    const col = column - 1;
    COLOR_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = COLOR_REGEX.exec(line)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (col >= start && col < end) {
            const token = match[0];
            if (!isDecoratableColorToken(token, line, start)) return null;
            return { token, start, end };
        }
    }
    return null;
}

export function getTailwindDocsUrlAtPosition(line: string, column: number): string | null {
    const token = findTailwindTokenAtColumn(line, column);
    return token ? getTailwindDocsUrl(token) : null;
}

export type TailwindColorKind = "default-scale" | "project-semantic" | "not-color";

const NON_COLOR_TEXT_FAMILIES = new Set([
    "xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl",
    "left", "center", "right", "justify", "start", "end",
    "ellipsis", "clip", "wrap", "nowrap", "balance", "pretty",
]);
const NON_COLOR_BORDER_FAMILIES = new Set([
    "solid", "dashed", "dotted", "double", "none", "hidden",
    "collapse", "separate", "spacing",
]);
const NON_COLOR_OUTLINE_FAMILIES = new Set([
    "none", "dashed", "dotted", "double", "solid", "hidden",
]);
const NON_COLOR_SHADOW_FAMILIES = new Set([
    "sm", "md", "lg", "xl", "2xl", "inner", "none",
]);
const NON_COLOR_DECORATION_FAMILIES = new Set([
    "solid", "double", "dotted", "dashed", "wavy", "auto", "from-font",
]);
const NON_COLOR_BG_FAMILIES = new Set([
    "cover", "contain", "auto", "fixed", "local", "scroll",
    "clip", "origin", "no-repeat", "repeat", "repeat-x", "repeat-y",
    "center", "top", "bottom", "left", "right",
]);

/** Distinguish default Tailwind palette tokens (e.g. ring-100) from project semantics (ring-border-focus). */
export function classifyTailwindColorToken(token: string): TailwindColorKind {
    const parsed = parseTailwindToken(token);
    if (!parsed) return "not-color";

    const { family, shade } = parsed;
    const twColors = tailwindColors as Record<string, string | Record<string, string>>;

    if (shade && twColors[family] && typeof twColors[family] === "object") {
        return "default-scale";
    }
    if (!shade && typeof twColors[family] === "string") {
        return "default-scale";
    }

    if (family.includes("-") || family.includes("border") || family.includes("text") || family.includes("surface")) {
        return "project-semantic";
    }

    if (shade && !twColors[family]) {
        return "project-semantic";
    }

    return twColors[family] ? "default-scale" : "project-semantic";
}
