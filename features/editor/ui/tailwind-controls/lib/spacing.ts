/**
 * Pure helpers for the inline Layout control: gap / padding / direction
 * Tailwind token parsing and minimal class edits.
 */

import type { ClassEditResult } from "./alignment";

export type PaddingSides = {
    left: number | null;
    top: number | null;
    right: number | null;
    bottom: number | null;
};

export type GapValues = {
    x: number | null;
    y: number | null;
};

export const LAYOUT_DISPLAY = ["flex", "inline-flex", "grid", "inline-grid"] as const;
export type LayoutDirection = "flex-row" | "flex-col" | "grid";

const GAP_RE = /^gap(?:-(x|y))?-(.+)$/;
const PADDING_RE = /^p([xytrbl])?-(.+)$/;

/** Convert a Tailwind spacing suffix ("4", "px", "[24px]", "[1.5rem]") to px. */
export function spacingSuffixToPx(suffix: string): number | null {
    if (suffix === "px") return 1;
    const arbitrary = suffix.match(/^\[(.+)\]$/);
    if (arbitrary) {
        const v = arbitrary[1].trim();
        const num = parseFloat(v);
        if (Number.isNaN(num)) return null;
        if (v.endsWith("rem") || v.endsWith("em")) return Math.round(num * 16);
        if (v.endsWith("px") || /^[\d.]+$/.test(v)) return Math.round(num);
        return null;
    }
    const scale = parseFloat(suffix);
    if (Number.isNaN(scale)) return null;
    return Math.round(scale * 4);
}

/** Convert px to a Tailwind spacing token for the given prefix (e.g. "p", "gap-x"). */
export function pxToSpacingToken(prefix: string, px: number): string {
    if (px === 1) return `${prefix}-px`;
    const scale = px / 4;
    const isHalfStep = scale * 2 === Math.round(scale * 2);
    if (scale >= 0 && isHalfStep) {
        return `${prefix}-${scale % 1 === 0 ? scale : scale.toFixed(1)}`;
    }
    return `${prefix}-[${px}px]`;
}

/** Current gap values (px) from class tokens. */
export function getGapValues(tokens: string[]): GapValues {
    const gap: GapValues = { x: null, y: null };
    for (const tok of tokens) {
        const m = tok.match(GAP_RE);
        if (!m) continue;
        const px = spacingSuffixToPx(m[2]);
        if (px === null) continue;
        if (!m[1]) {
            gap.x = px;
            gap.y = px;
        } else if (m[1] === "x") {
            gap.x = px;
        } else {
            gap.y = px;
        }
    }
    return gap;
}

/** Current padding per side (px) from class tokens. */
export function getPaddingValues(tokens: string[]): PaddingSides {
    const sides: PaddingSides = { left: null, top: null, right: null, bottom: null };
    const apply = (axis: string | undefined, px: number) => {
        switch (axis) {
            case undefined:
                sides.left = sides.top = sides.right = sides.bottom = px;
                break;
            case "x":
                sides.left = sides.right = px;
                break;
            case "y":
                sides.top = sides.bottom = px;
                break;
            case "l": sides.left = px; break;
            case "r": sides.right = px; break;
            case "t": sides.top = px; break;
            case "b": sides.bottom = px; break;
        }
    };

    // Broad tokens first so specific sides win regardless of order.
    const matches = tokens
        .map((tok) => tok.match(PADDING_RE))
        .filter((m): m is RegExpMatchArray => m !== null);
    const broadness = (axis: string | undefined) => (axis === undefined ? 0 : axis === "x" || axis === "y" ? 1 : 2);
    matches.sort((a, b) => broadness(a[1]) - broadness(b[1]));

    for (const m of matches) {
        const px = spacingSuffixToPx(m[2]);
        if (px === null) continue;
        apply(m[1], px);
    }
    return sides;
}

function isGapTokenInternal(tok: string): boolean {
    return GAP_RE.test(tok);
}

function isPaddingTokenInternal(tok: string): boolean {
    return PADDING_RE.test(tok);
}

/** Minimal token set for the given gap values. */
function gapTokens(gap: GapValues): string[] {
    if (gap.x !== null && gap.x === gap.y) return gap.x === 0 ? [] : [pxToSpacingToken("gap", gap.x)];
    const out: string[] = [];
    if (gap.x !== null && gap.x !== 0) out.push(pxToSpacingToken("gap-x", gap.x));
    if (gap.y !== null && gap.y !== 0) out.push(pxToSpacingToken("gap-y", gap.y));
    return out;
}

/** Minimal token set for the given padding sides. */
function paddingTokens(sides: PaddingSides): string[] {
    const { left, top, right, bottom } = sides;
    const val = (n: number | null) => n ?? 0;
    const allSet = [left, top, right, bottom].every((v) => v !== null);
    if (allSet && left === top && top === right && right === bottom) {
        return left === 0 ? [] : [pxToSpacingToken("p", val(left))];
    }
    if (allSet && left === right && top === bottom) {
        const out: string[] = [];
        if (val(left) !== 0) out.push(pxToSpacingToken("px", val(left)));
        if (val(top) !== 0) out.push(pxToSpacingToken("py", val(top)));
        return out;
    }
    const out: string[] = [];
    if (left !== null && left !== 0) out.push(pxToSpacingToken("pl", left));
    if (top !== null && top !== 0) out.push(pxToSpacingToken("pt", top));
    if (right !== null && right !== 0) out.push(pxToSpacingToken("pr", right));
    if (bottom !== null && bottom !== 0) out.push(pxToSpacingToken("pb", bottom));
    return out;
}

function diffEdit(tokens: string[], isKind: (tok: string) => boolean, next: string[]): ClassEditResult {
    const existing = tokens.filter(isKind);
    const remove = existing.filter((t) => !next.includes(t));
    const add = next.filter((t) => !existing.includes(t));
    return { add, remove };
}

/** Edit to set one gap axis to the given px value. */
export function buildGapEdit(tokens: string[], axis: "x" | "y", px: number): ClassEditResult {
    const gap = getGapValues(tokens);
    gap[axis] = Math.max(0, px);
    return diffEdit(tokens, isGapTokenInternal, gapTokens(gap));
}

/** Edit to set one padding side to the given px value. */
export function buildPaddingEdit(
    tokens: string[],
    side: keyof PaddingSides,
    px: number,
): ClassEditResult {
    const sides = getPaddingValues(tokens);
    sides[side] = Math.max(0, px);
    return diffEdit(tokens, isPaddingTokenInternal, paddingTokens(sides));
}

/** Current layout direction from class tokens. */
export function getLayoutDirection(tokens: string[]): LayoutDirection | null {
    if (tokens.includes("grid") || tokens.includes("inline-grid")) return "grid";
    if (tokens.includes("flex") || tokens.includes("inline-flex")) {
        return tokens.includes("flex-col") || tokens.includes("flex-col-reverse") ? "flex-col" : "flex-row";
    }
    return null;
}

/** Edit to switch between flex row / flex column / grid. */
export function buildDirectionEdit(tokens: string[], dir: LayoutDirection): ClassEditResult {
    const displayTokens = tokens.filter((t) => (LAYOUT_DISPLAY as readonly string[]).includes(t));
    const dirTokens = tokens.filter((t) => /^flex-(row|col)(-reverse)?$/.test(t));

    if (dir === "grid") {
        return {
            add: tokens.includes("grid") ? [] : ["grid"],
            remove: [...displayTokens.filter((t) => t !== "grid"), ...dirTokens],
        };
    }

    const add: string[] = [];
    if (!tokens.includes("flex") && !tokens.includes("inline-flex")) add.push("flex");
    // flex-row is the default; only col needs an explicit token.
    if (dir === "flex-col" && !tokens.includes("flex-col")) add.push("flex-col");

    const remove = [
        ...displayTokens.filter((t) => t !== "flex" && t !== "inline-flex"),
        ...dirTokens.filter((t) => (dir === "flex-col" ? t !== "flex-col" : true)),
    ];
    return { add, remove };
}

/** True when the token should show the inline flex/grid swatch. */
export function isFlexDisplayToken(value: string): boolean {
    return (LAYOUT_DISPLAY as readonly string[]).includes(value);
}

export function isGapToken(value: string): boolean {
    return GAP_RE.test(value);
}

export function isPaddingToken(value: string): boolean {
    return PADDING_RE.test(value);
}

export type TailwindControlKind = "flex" | "gap" | "padding" | "radius";

export function getTailwindControlKind(value: string): TailwindControlKind | null {
    if (isFlexDisplayToken(value)) return "flex";
    if (isGapToken(value)) return "gap";
    if (isPaddingToken(value)) return "padding";
    if (/^rounded(?:-|$)/.test(value)) return "radius";
    return null;
}

/** @deprecated use isFlexDisplayToken */
export function isLayoutToken(value: string): boolean {
    return isFlexDisplayToken(value);
}
