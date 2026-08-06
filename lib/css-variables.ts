export type CssVariableKind = "color" | "font" | "size" | "motion" | "other";

export type CssVariableSection =
    | "background"
    | "text"
    | "border"
    | "accent"
    | "font"
    | "size"
    | "motion"
    | "effects"
    | "git"
    | "other";

export interface CssVariable {
    name: string;
    value: string;
    line: number;
    kind: CssVariableKind;
    section: CssVariableSection;
}

export const CSS_VARIABLE_SECTION_ORDER: CssVariableSection[] = [
    "background",
    "text",
    "border",
    "accent",
    "font",
    "size",
    "motion",
    "effects",
    "git",
    "other",
];

export const CSS_VARIABLE_SECTION_LABELS: Record<CssVariableSection, string> = {
    background: "Background",
    text: "Text",
    border: "Border",
    accent: "Accent & Status",
    font: "Typography",
    size: "Size & Spacing",
    motion: "Motion",
    effects: "Effects",
    git: "Git",
    other: "Other",
};

export function formatVariableDisplayName(name: string): string {
    return name.replace(/^--/, "");
}

export function normalizeVariableName(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return "";
    return trimmed.startsWith("--") ? trimmed : `--${trimmed}`;
}

const GLOBAL_CSS_NAMES = new Set([
    "globals.css",
    "global.css",
    "theme.css",
    "variables.css",
    "tokens.css",
    "design-tokens.css",
    "root.css",
]);

export function isGlobalCssFile(path: string | null | undefined): boolean {
    if (!path) return false;
    const norm = path.replace(/\\/g, "/").toLowerCase();
    const base = norm.split("/").pop() ?? "";
    if (GLOBAL_CSS_NAMES.has(base)) return true;
    return base.endsWith(".theme.css") || base.endsWith(".tokens.css");
}

function isColorValue(value: string): boolean {
    const v = value.trim().toLowerCase();
    if (!v || v.startsWith("var(")) return false;
    return (
        /^#([0-9a-f]{3,8})$/i.test(v) ||
        /^(rgb|rgba|hsl|hsla|oklch|lab|lch|color)\(/i.test(v) ||
        /^(transparent|currentcolor|inherit)$/i.test(v)
    );
}

function classifyVariable(name: string, value: string): CssVariableKind {
    const n = name.toLowerCase();
    const v = value.toLowerCase();

    if (n.includes("font") || /font-family|font-mono|font-sans/.test(n) || /plex|inter|mono|sans-serif|serif/.test(v)) {
        return "font";
    }
    if (n.includes("duration") || n.includes("ease") || n.includes("transition") || v.endsWith("ms") || v.endsWith("s")) {
        return "motion";
    }
    if (
        n.includes("color") ||
        n.includes("accent") ||
        n.includes("surface") ||
        n.includes("panel") ||
        n.includes("border") ||
        n.includes("background") ||
        n.includes("foreground") ||
        n.includes("text-") ||
        n.includes("git-") ||
        n.includes("error") ||
        n.includes("success") ||
        n.includes("warning") ||
        isColorValue(value)
    ) {
        return "color";
    }
    if (/^\d+(\.\d+)?(px|rem|em|ch|%|vh|vw)$/.test(v.trim()) || n.includes("height") || n.includes("width") || n.includes("spacing") || n.includes("size") || n.includes("radius")) {
        return "size";
    }
    return "other";
}

function getCssVariableSection(name: string, kind: CssVariableKind): CssVariableSection {
    const n = name.toLowerCase().replace(/^--/, "");

    if (n.startsWith("git-")) return "git";
    if (kind === "font") return "font";
    if (kind === "motion") return "motion";
    if (kind === "size") return "size";

    if (
        n === "background" ||
        n === "chrome" ||
        n === "base" ||
        n.startsWith("surface-") ||
        n.startsWith("panel") ||
        n.startsWith("editor") ||
        n.startsWith("sidebar") ||
        n.startsWith("titlebar") ||
        n.startsWith("activitybar") ||
        n.startsWith("statusbar")
    ) {
        return "background";
    }

    if (n.startsWith("text-") || n === "foreground") return "text";
    if (n.startsWith("border") || n === "stroke") return "border";
    if (n.includes("shadow") || n.startsWith("z-") || n.includes("z-index")) return "effects";
    if (
        n.includes("accent") ||
        n === "brand" ||
        n === "focus" ||
        n === "action-label" ||
        n.includes("error") ||
        n.includes("warning") ||
        n.includes("warn") ||
        n.includes("danger") ||
        n.includes("success") ||
        n.includes("info") ||
        n === "added" ||
        n === "modified" ||
        n === "removed" ||
        n === "untracked" ||
        n.startsWith("diff-")
    ) {
        return "accent";
    }

    if (kind === "color") return "accent";
    return "other";
}

/** Parse `--name: value` declarations from CSS source text. */
export function parseCssVariables(content: string): CssVariable[] {
    const lines = content.split(/\r?\n/);
    const vars: CssVariable[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^\s*(--[a-zA-Z0-9-_]+)\s*:\s*(.+?)\s*;?\s*$/);
        if (!match) continue;
        const name = match[1];
        if (seen.has(name)) continue;
        seen.add(name);
        const value = match[2].trim();
        const kind = classifyVariable(name, value);
        vars.push({
            name,
            value,
            line: i + 1,
            kind,
            section: getCssVariableSection(name, kind),
        });
    }

    return vars.sort((a, b) => a.name.localeCompare(b.name));
}

export function updateCssVariableInContent(content: string, name: string, newValue: string): string {
    const lines = content.split(/\r?\n/);
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^(\\s*${escaped}\\s*:\\s*)(.+?)(\\s*;?\\s*)$`);

    let updated = false;
    const next = lines.map((line) => {
        const m = line.match(re);
        if (!m) return line;
        updated = true;
        const semi = m[3].includes(";") ? ";" : "";
        return `${m[1]}${newValue}${semi}`;
    });

    return updated ? next.join("\n") : content;
}

/** Rename a CSS variable declaration and `var()` references within a single file. */
export function renameCssVariableInContent(content: string, oldName: string, newName: string): string {
    const from = normalizeVariableName(oldName);
    const to = normalizeVariableName(newName);
    if (!from || !to || from === to) return content;

    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const declRe = new RegExp(`^(\\s*)${escaped}(\\s*:\\s*)`, "m");

    let next = content.replace(declRe, `$1${to}$2`);
    next = next.replace(new RegExp(`var\\(\\s*${escaped}\\b`, "g"), `var(${to}`);
    return next;
}

export function resolveCssVariableColor(name: string): string | null {
    if (typeof window === "undefined") return null;
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return val || null;
}

export function getProjectColorVariables(content: string): CssVariable[] {
    return parseCssVariables(content).filter((v) => v.kind === "color");
}

let cachedGlobalsCssContent = "";

export function setCachedGlobalsCssContent(content: string): void {
    cachedGlobalsCssContent = content;
}

export function getCachedGlobalsCssContent(): string {
    return cachedGlobalsCssContent;
}

export function getCachedProjectColorVariables(): CssVariable[] {
    return getProjectColorVariables(cachedGlobalsCssContent);
}
