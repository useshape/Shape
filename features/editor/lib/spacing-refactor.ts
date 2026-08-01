/**
 * Safe spacing-scale refactor: find & surgically rewrite scale numbers in a file.
 */

import { findAllDesignProperties, type DesignSourceHit } from "./design-source-map";

export interface SpacingRefactorMatch {
    start: number;
    end: number;
    from: string;
    to: string;
    token?: string;
}

/** Matches spacing-scale hits whose numeric text equals `fromScale`. */
export function findSpacingScaleMatches(text: string, fromScale: string): DesignSourceHit[] {
    return findAllDesignProperties(text).filter(
        (h) => h.kind === "spacing-scale" && text.slice(h.start, h.end) === fromScale,
    );
}

export function planSpacingScaleRefactor(
    text: string,
    fromScale: string,
    toScale: string,
): SpacingRefactorMatch[] {
    if (!fromScale || fromScale === toScale) return [];
    return findSpacingScaleMatches(text, fromScale).map((h) => ({
        start: h.start,
        end: h.end,
        from: fromScale,
        to: toScale,
        token: h.classToken?.value,
    }));
}

/**
 * Apply matches from end → start so offsets stay valid.
 * Returns the rewritten document.
 */
export function applySpacingScaleRefactor(text: string, matches: SpacingRefactorMatch[]): string {
    const ordered = [...matches].sort((a, b) => b.start - a.start);
    let out = text;
    for (const m of ordered) {
        out = out.slice(0, m.start) + m.to + out.slice(m.end);
    }
    return out;
}
