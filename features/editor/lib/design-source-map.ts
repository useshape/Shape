/**
 * Bi-directional design source mapping.
 * Locates exact character ranges for scrubbable design values and mutates
 * only that span — preserves surrounding formatting/comments.
 */

import {
    findClassContexts,
    getTokensInContext,
    tokenAtOffset,
    type ClassToken,
} from "./class-attribute";
import { getTailwindControlKind, type TailwindControlKind } from "@/features/editor/ui/tailwind-controls/lib/spacing";
import { TAILWIND_RADIUS_SCALE } from "@/features/editor/ui/tailwind-controls/lib/radius";

export type DesignPropertyKind =
    | "spacing-scale"
    | "spacing-px"
    | "css-length"
    | "raw-number"
    | "named-radius";

export interface DesignSourceHit {
    /** Absolute start in full document text */
    start: number;
    /** Absolute end (exclusive) */
    end: number;
    kind: DesignPropertyKind;
    /** Parsed numeric value (px for lengths; Tailwind scale units for scale; index for named-radius) */
    value: number;
    /** Unit suffix when present ("px", "rem", "%", or "" for bare / TW scale) */
    unit: string;
    /** Owning class token, if this hit lives inside a className string */
    classToken?: ClassToken;
    /** Matching Tailwind control panel kind when applicable */
    controlKind?: TailwindControlKind;
}

/** Longer prefixes first so `px-1` matches `px`, not `p`. */
const TW_SCALE_RE =
    /^(?:gap-x|gap-y|space-x|space-y|min-w|min-h|max-w|max-h|inset-x|inset-y|rounded-tl|rounded-tr|rounded-bl|rounded-br|rounded-t|rounded-b|rounded-l|rounded-r|border-t|border-b|border-l|border-r|px|py|pt|pr|pb|pl|mx|my|mt|mr|mb|ml|gap|p|m|w|h|top|right|bottom|left|inset|text|leading|tracking|rounded|border|opacity|z|basis|grow|shrink)-(?:\[)?([\d.]+)(px|rem|em|%)?(?:\])?$/;

const TW_ARBITRARY_RE =
    /^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|w|h|min-w|min-h|max-w|max-h|rounded(?:-[trbl]{1,2})?|text|leading|tracking|top|right|bottom|left|inset(?:-[xy])?)-\[([\d.]+)(px|rem|em|%)?\]$/;

const NAMED_RADIUS_RE =
    /^rounded(?:-(tl|tr|bl|br|t|b|l|r))?(?:-(none|sm|md|lg|xl|2xl|3xl|full))?$/;

const CSS_LENGTH_RE =
    /(?<![-\w])((?:padding|padding-(?:top|right|bottom|left)|margin|margin-(?:top|right|bottom|left)|gap|row-gap|column-gap|border-radius|width|height|min-width|min-height|max-width|max-height|top|right|bottom|left|font-size|line-height|letter-spacing)\s*:\s*)(-?[\d.]+)(px|rem|em|%)?/gi;

const RADIUS_STOP_CLASSES = TAILWIND_RADIUS_SCALE.map((s) => s.cls);

function namedRadiusIndex(cls: string): number {
    // Strip corner prefix to uniform stop when possible.
    const uniform =
        cls.replace(/^rounded-(?:tl|tr|bl|br|t|b|l|r)-/, "rounded-")
            .replace(/^rounded-(?:tl|tr|bl|br|t|b|l|r)$/, "rounded");
    const idx = RADIUS_STOP_CLASSES.indexOf(uniform === "rounded" ? "rounded" : uniform);
    if (idx >= 0) return idx;
    if (uniform === "rounded") return RADIUS_STOP_CLASSES.indexOf("rounded");
    return 3; // md-ish default
}

function findNumericSpanInToken(token: ClassToken): DesignSourceHit | null {
    const v = token.value;
    const controlKind = getTailwindControlKind(v) ?? undefined;

    const arb = v.match(TW_ARBITRARY_RE);
    if (arb) {
        const numStr = arb[2];
        const unit = arb[3] ?? "px";
        const numStart = token.start + v.indexOf(numStr);
        return {
            start: numStart,
            end: numStart + numStr.length,
            kind: unit === "" ? "raw-number" : "spacing-px",
            value: parseFloat(numStr),
            unit,
            classToken: token,
            controlKind,
        };
    }

    // Named radius: rounded-lg, rounded-md, rounded, …
    if (NAMED_RADIUS_RE.test(v) && !/rounded-\[\d/.test(v)) {
        // Bare `rounded` with no named/numeric suffix — still scrubbable as whole token.
        const isNamed =
            v === "rounded" ||
            /rounded-(?:(?:tl|tr|bl|br|t|b|l|r)-)?(?:none|sm|md|lg|xl|2xl|3xl|full)$/.test(v) ||
            /rounded-(?:tl|tr|bl|br|t|b|l|r)$/.test(v);
        if (isNamed) {
            return {
                start: token.start,
                end: token.end,
                kind: "named-radius",
                value: namedRadiusIndex(v),
                unit: "",
                classToken: token,
                controlKind: "radius",
            };
        }
    }

    const m = v.match(TW_SCALE_RE);
    if (!m) return null;
    const numStr = m[1];
    const unit = m[2] ?? "";
    const idx = v.lastIndexOf(numStr);
    if (idx < 0) return null;
    const numStart = token.start + idx;
    const isLength = unit === "px" || unit === "rem" || unit === "em" || unit === "%";
    return {
        start: numStart,
        end: numStart + numStr.length,
        kind: isLength ? "spacing-px" : "spacing-scale",
        value: parseFloat(numStr),
        unit,
        classToken: token,
        controlKind,
    };
}

/** Find a scrubbable design value at an absolute document offset. */
export function findDesignPropertyAtOffset(text: string, offset: number): DesignSourceHit | null {
    const tok = tokenAtOffset(text, offset);
    if (tok) {
        const hit = findNumericSpanInToken(tok);
        if (hit && offset >= hit.start && offset <= hit.end) return hit;
        // Cursor on token but not on the number — still allow scrubbing the value.
        if (hit && offset >= tok.start && offset <= tok.end) return hit;
    }

    // CSS declarations outside class strings.
    CSS_LENGTH_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CSS_LENGTH_RE.exec(text)) !== null) {
        const fullStart = m.index + m[1].length;
        const numStr = m[2];
        const unit = m[3] ?? "";
        const start = fullStart;
        const end = start + numStr.length;
        if (offset >= start && offset <= end + unit.length) {
            return {
                start,
                end,
                kind: "css-length",
                value: parseFloat(numStr),
                unit,
            };
        }
    }

    return null;
}

/** All scrubbable hits in a document (for decorations). */
export function findAllDesignProperties(text: string): DesignSourceHit[] {
    const hits: DesignSourceHit[] = [];
    for (const ctx of findClassContexts(text)) {
        for (const tok of getTokensInContext(text, ctx)) {
            const hit = findNumericSpanInToken(tok);
            if (hit) hits.push(hit);
        }
    }
    CSS_LENGTH_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CSS_LENGTH_RE.exec(text)) !== null) {
        const start = m.index + m[1].length;
        const numStr = m[2];
        hits.push({
            start,
            end: start + numStr.length,
            kind: "css-length",
            value: parseFloat(numStr),
            unit: m[3] ?? "",
        });
    }
    return hits;
}

const SPACING_SCALE = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96];

/** Snap a float to the nearest Tailwind spacing scale stop. */
export function snapToSpacingScale(value: number): number {
    let best = SPACING_SCALE[0];
    let bestDist = Math.abs(value - best);
    for (const s of SPACING_SCALE) {
        const d = Math.abs(value - s);
        if (d < bestDist) {
            best = s;
            bestDist = d;
        }
    }
    return best;
}

/** Format a scrubbed numeric value for surgical replacement (number only). */
export function formatScrubbedNumber(hit: DesignSourceHit, nextValue: number): string {
    if (hit.kind === "named-radius") {
        const idx = Math.max(0, Math.min(RADIUS_STOP_CLASSES.length - 1, Math.round(nextValue)));
        return RADIUS_STOP_CLASSES[idx];
    }
    if (hit.kind === "spacing-scale") {
        const snapped = snapToSpacingScale(Math.max(0, nextValue));
        return snapped % 1 === 0 ? String(snapped) : snapped.toFixed(1);
    }
    const rounded = Math.round(nextValue);
    return String(Math.max(0, rounded));
}

/**
 * Apply a scrub delta (mouse pixels or wheel ticks) to a hit.
 * Mouse: ~8px → one scale step (snapped). Wheel: one stop / 4px per tick.
 */
export function scrubValueFromDelta(hit: DesignSourceHit, deltaX: number, opts?: { wheel?: boolean }): string {
    if (hit.kind === "named-radius") {
        const steps = opts?.wheel
            ? (deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0)
            : Math.round(deltaX / 8);
        if (steps === 0) return formatScrubbedNumber(hit, hit.value);
        const nextIdx = Math.max(0, Math.min(RADIUS_STOP_CLASSES.length - 1, hit.value + steps));
        return formatScrubbedNumber(hit, nextIdx);
    }
    if (hit.kind === "spacing-scale") {
        const steps = opts?.wheel
            ? (deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0)
            : Math.round(deltaX / 8);
        if (steps === 0) return formatScrubbedNumber(hit, hit.value);
        let bestIdx = 0;
        let bestDist = Math.abs(SPACING_SCALE[0] - hit.value);
        for (let i = 1; i < SPACING_SCALE.length; i++) {
            const d = Math.abs(SPACING_SCALE[i] - hit.value);
            if (d < bestDist) {
                bestIdx = i;
                bestDist = d;
            }
        }
        const nextIdx = Math.max(0, Math.min(SPACING_SCALE.length - 1, bestIdx + steps));
        return formatScrubbedNumber(hit, SPACING_SCALE[nextIdx]);
    }
    if (opts?.wheel) {
        const step = deltaX > 0 ? 4 : -4;
        return formatScrubbedNumber(hit, hit.value + step);
    }
    const step = Math.round(deltaX / 2);
    return formatScrubbedNumber(hit, hit.value + step);
}

/** Control kind under the cursor for auto-focusing inspector panels. */
export function controlKindAtOffset(text: string, offset: number): TailwindControlKind | null {
    const tok = tokenAtOffset(text, offset);
    if (!tok) return null;
    return getTailwindControlKind(tok.value);
}
