/**
 * Radius scale: Tailwind defaults with optional project --radius-* overrides.
 */

import type { CssVariable } from "@/lib/css-variables";

export interface RadiusStop {
    /** Display label: none, sm, md, lg, DEFAULT, xl, 2xl, 3xl, full */
    label: string;
    /** Tailwind class to apply */
    cls: string;
    /** Resolved radius in px for preview/slider position */
    px: number;
}

/** Default Tailwind v3/v4 radius scale (px equivalents for slider positioning). */
export const TAILWIND_RADIUS_SCALE: RadiusStop[] = [
    { label: "none", cls: "rounded-none", px: 0 },
    { label: "sm", cls: "rounded-sm", px: 2 },
    { label: "DEFAULT", cls: "rounded", px: 4 },
    { label: "md", cls: "rounded-md", px: 6 },
    { label: "lg", cls: "rounded-lg", px: 8 },
    { label: "xl", cls: "rounded-xl", px: 12 },
    { label: "2xl", cls: "rounded-2xl", px: 16 },
    { label: "3xl", cls: "rounded-3xl", px: 24 },
    { label: "full", cls: "rounded-full", px: 9999 },
];

export const ALL_ROUNDED_CLASSES = TAILWIND_RADIUS_SCALE.map((s) => s.cls);

export const ROUNDED_TOKEN_RE = /^rounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full|t|b|l|r|tl|tr|bl|br)(?:-(?:none|sm|md|lg|xl|2xl|3xl|full))?|\[[^\]]+\])?$/;

export const ROUNDED_REGEX = /\b(rounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full|t|b|l|r|tl|tr|bl|br)(?:-(?:none|sm|md|lg|xl|2xl|3xl|full))?|\[[^\]]+\])?)\b/g;

/** Parse a CSS length to px (supports px, rem with 16px base). */
export function parseLengthToPx(value: string): number | null {
    const v = value.trim();
    if (!v) return null;
    if (v === "9999px" || v === "50%") return 9999;
    const px = v.match(/^([\d.]+)px$/);
    if (px) return parseFloat(px[1]);
    const rem = v.match(/^([\d.]+)rem$/);
    if (rem) return parseFloat(rem[1]) * 16;
    const num = v.match(/^([\d.]+)$/);
    if (num) return parseFloat(num[1]);
    return null;
}

/** Map --radius-* CSS variable name to Tailwind stop label. */
function varNameToStopLabel(varName: string): string | null {
    const n = varName.replace(/^--/, "");
    if (n === "radius") return "DEFAULT";
    if (n.startsWith("radius-")) return n.replace(/^radius-/, "");
    return null;
}

/**
 * Build slider stops: start from Tailwind scale; project --radius-{name}
 * overrides the matching named stop's px value (and keeps the Tailwind class).
 */
export function buildRadiusStops(projectVars: CssVariable[] = []): RadiusStop[] {
    const stops = TAILWIND_RADIUS_SCALE.map((s) => ({ ...s }));

    for (const v of projectVars) {
        const label = varNameToStopLabel(v.name);
        if (!label) continue;
        const px = parseLengthToPx(v.value);
        if (px === null) continue;
        const idx = stops.findIndex((s) => s.label === label);
        if (idx >= 0) {
            stops[idx] = { ...stops[idx], px };
        }
    }

    return stops;
}

export function findStopByClass(cls: string, stops: RadiusStop[]): RadiusStop | undefined {
    return stops.find((s) => s.cls === cls);
}

export function findStopIndexByClass(cls: string, stops: RadiusStop[]): number {
    const idx = stops.findIndex((s) => s.cls === cls);
    return idx >= 0 ? idx : 0;
}

/** Nearest stop index for a px value. */
export function snapToNearestStopIndex(px: number, stops: RadiusStop[]): number {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < stops.length; i++) {
        const dist = Math.abs(stops[i].px - px);
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        } else if (dist === bestDist && i > best) {
            best = i;
        }
    }
    return best;
}

/** Preview radius (0–16px cap for swatch icon) from a rounded-* class. */
export function previewRadiusPx(cls: string, stops: RadiusStop[] = TAILWIND_RADIUS_SCALE): number {
    const arbitrary = cls.match(/^rounded-\[([^\]]+)\]$/);
    if (arbitrary) {
        const px = parseLengthToPx(arbitrary[1]);
        if (px !== null) return px >= 9999 ? 16 : Math.min(16, Math.max(0, px));
    }
    const stop = findStopByClass(cls, stops);
    if (!stop) return 4;
    if (stop.px >= 9999) return 16;
    return Math.min(16, Math.max(0, stop.px));
}

/** All rounded-* tokens to remove when switching radius. */
export function allRoundedRemovals(currentTokens: string[]): string[] {
    return currentTokens.filter((t) => ROUNDED_TOKEN_RE.test(t) || t === "rounded");
}

export type CornerKey = "tl" | "tr" | "bl" | "br";

export const CORNER_KEYS: CornerKey[] = ["tl", "tr", "bl", "br"];

const CORNER_CLASS_RE = /^rounded-(tl|tr|bl|br)(?:-(none|sm|md|lg|xl|2xl|3xl|full|\[[^\]]+\]))?$/;

export type PerCornerRadius = {
    tl: string;
    tr: string;
    bl: string;
    br: string;
    linked: boolean;
};

export function uniformToCornerClass(uniformCls: string, corner: CornerKey): string {
    if (uniformCls === "rounded") return `rounded-${corner}`;
    if (uniformCls === "rounded-none") return `rounded-${corner}-none`;
    const suffix = uniformCls.replace(/^rounded-/, "");
    return `rounded-${corner}-${suffix}`;
}

export function cornerTokenToUniform(token: string): string | null {
    const m = token.match(/^rounded-(tl|tr|bl|br)(?:-(.*))?$/);
    if (!m) return null;
    const suffix = m[2];
    if (!suffix) return "rounded";
    return `rounded-${suffix}`;
}

export function detectRadiusPerCorner(tokens: string[]): PerCornerRadius {
    const uniform = tokens.find((c) => ALL_ROUNDED_CLASSES.includes(c) || c === "rounded") ?? "rounded-none";
    const cornerTokens: Partial<Record<CornerKey, string>> = {};

    for (const token of tokens) {
        const m = token.match(/^rounded-(tl|tr|bl|br)/);
        if (m) cornerTokens[m[1] as CornerKey] = token;
    }

    const hasCorners = CORNER_KEYS.some((k) => cornerTokens[k]);
    if (!hasCorners) {
        return { tl: uniform, tr: uniform, bl: uniform, br: uniform, linked: true };
    }

    const tl = cornerTokens.tl ?? uniformToCornerClass(uniform, "tl");
    const tr = cornerTokens.tr ?? uniformToCornerClass(uniform, "tr");
    const bl = cornerTokens.bl ?? uniformToCornerClass(uniform, "bl");
    const br = cornerTokens.br ?? uniformToCornerClass(uniform, "br");

    const uniforms = [tl, tr, bl, br].map((t) => cornerTokenToUniform(t) ?? t);
    const linked = uniforms.every((u) => u === uniforms[0]);

    return { tl, tr, bl, br, linked };
}

export function stopPxForClass(cls: string, stops: RadiusStop[]): number {
    const uniform = cornerTokenToUniform(cls) ?? cls;
    const arbitrary = uniform.match(/^rounded-\[([^\]]+)\]$/);
    if (arbitrary) {
        const px = parseLengthToPx(arbitrary[1]);
        return px ?? 0;
    }
    return findStopByClass(uniform, stops)?.px ?? 0;
}

export function buildLinkedRadiusEdit(currentTokens: string[], uniformCls: string): { add: string[]; remove: string[] } {
    const remove = allRoundedRemovals(currentTokens);
    const add = uniformCls === "rounded-none" ? [] : [uniformCls];
    return { add, remove };
}

export function buildCornerRadiusEdit(
    currentTokens: string[],
    corner: CornerKey,
    cornerCls: string,
    linked: boolean,
    allCorners: PerCornerRadius,
): { add: string[]; remove: string[] } {
    if (linked) {
        const uniform = cornerTokenToUniform(cornerCls) ?? cornerCls;
        return buildLinkedRadiusEdit(currentTokens, uniform);
    }

    const remove = allRoundedRemovals(currentTokens);
    const add = CORNER_KEYS.map((k) => {
        if (k === corner) return cornerCls;
        return allCorners[k];
    }).filter((c) => !c.endsWith("-none") && c !== "rounded-none");

    return { add, remove };
}

export function classFromVariable(varName: string): string {
    const label = varNameToStopLabel(varName);
    if (label && label !== "DEFAULT") {
        const stop = TAILWIND_RADIUS_SCALE.find((s) => s.label === label);
        if (stop) return stop.cls;
    }
    return `rounded-[var(${varName})]`;
}
