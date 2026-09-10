import type { DesignPendingEdit } from "../types";

const MIN_LOCATE_SCORE = 8;

const OPEN_TAG = (tag: string) =>
    new RegExp(`<${tag}\\b(?:[^>"'\`/]|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`)*?>`, "gi");

export type OpeningTagHit = {
    start: number;
    end: number;
    text: string;
    line: number;
    column: number;
};

function lineColAt(source: string, index: number): { line: number; column: number } {
    let line = 1;
    let last = -1;
    for (let i = 0; i < index; i++) {
        if (source.charCodeAt(i) === 10) {
            line++;
            last = i;
        }
    }
    return { line, column: index - last };
}

export function findOpeningTags(source: string, tag: string): OpeningTagHit[] {
    const re = OPEN_TAG(tag);
    const out: OpeningTagHit[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
        const loc = lineColAt(source, m.index);
        out.push({ start: m.index, end: m.index + m[0].length, text: m[0], line: loc.line, column: loc.column });
        if (m[0].length === 0) re.lastIndex++;
    }
    return out;
}

export function findOpeningTag(
    source: string,
    tag: string,
    lineNumber?: number,
): { start: number; end: number; text: string } | null {
    const all = findOpeningTags(source, tag);
    if (!all.length) return null;
    if (lineNumber && lineNumber > 0) {
        let best = all[0]!;
        let dist = Math.abs(best.line - lineNumber);
        for (const hit of all) {
            const d = Math.abs(hit.line - lineNumber);
            if (d < dist) {
                best = hit;
                dist = d;
            }
        }
        if (dist > 40) return null;
        return best;
    }
    return all[0] ?? null;
}

export function classSearchNeedles(className: string): string[] {
    const parts = className.split(/\s+/).filter((c) => c && !c.startsWith("shape-") && c !== "group" && c !== "peer");
    const out: string[] = [];
    for (const c of parts) {
        if (c.startsWith("!")) out.push(c);
        const local = cssModuleLocal(c);
        if (local) out.push(`styles.${local}`);
    }
    const trailing = parts.slice(-2).join(" ");
    if (trailing.length >= 4) out.push(trailing);
    const skipPrefix = /^(?:\[&|has-\[|focus-visible:|disabled:|aria-|in-data-\[|data-\[)/;
    const skipExact =
        /^(inline-flex|inline-block|shrink-0|items-center|justify-center|whitespace-nowrap|outline-none|transition-all|select-none|pointer-events-none|rounded-md|text-sm|font-medium|gap-2)$/;
    const rare = parts.filter((c) => c.length >= 5 && !skipPrefix.test(c) && !skipExact.test(c));
    rare.sort((a, b) => b.length - a.length);
    out.push(...rare.slice(0, 6));
    if (parts.length >= 2) {
        const raw = parts.filter((c) => !cssModuleLocal(c)).slice(0, 3).join(" ");
        if (raw.length >= 5) out.push(raw);
    }
    return [...new Set(out)].slice(0, 10);
}

export function cssModuleLocal(className: string): string | null {
    const m = className.match(/^[A-Za-z][\w]*_([A-Za-z][\w-]*)__[\w-]+$/);
    return m?.[1] ?? null;
}

export function scoreSourceLine(line: string, edit: DesignPendingEdit): number {
    const lower = line.toLowerCase();
    const tag = (edit.tag || edit.label.split(/[.#]/)[0] || "").toLowerCase();
    let score = 0;
    if (tag && lower.includes(`<${tag}`)) score += 5;
    for (const c of (edit.className || "").split(/\s+/).filter(Boolean)) {
        const local = cssModuleLocal(c);
        if (local && (line.includes(`styles.${local}`) || line.includes(`.${local}`) || line.includes(`'${local}'`) || line.includes(`"${local}"`))) {
            score += 8;
        } else if (c.length > 2 && line.includes(c)) score += c.length >= 8 ? 3 : 1;
    }
    const text = (edit.locateText || edit.text)?.trim();
    const phrase = text && text.length >= 2 ? text.replace(/\s+/g, " ").slice(0, 40) : "";
    if (phrase.length >= 8 && line.includes(phrase.slice(0, 24))) score += 10;
    else if (text && text.length >= 2 && line.includes(text.slice(0, 16))) score += 4;
    if (!/<[A-Za-z]/.test(line) && !/className|class\s*=/.test(line) && !(phrase.length >= 8 && line.includes(phrase.slice(0, 24)))) {
        score -= 10;
    }
    return score;
}

function scoreOpening(hit: OpeningTagHit, edit: DesignPendingEdit, source: string): number {
    let score = scoreSourceLine(hit.text, edit);
    if (edit.source?.lineNumber) {
        const dist = Math.abs(hit.line - edit.source.lineNumber);
        if (dist === 0) score += 25;
        else if (dist <= 2) score += 12;
        else if (dist <= 6) score += 4;
        else if (dist > 20) score -= 8;
        if (dist === 0 && edit.source.columnNumber) {
            const cd = Math.abs(hit.column - edit.source.columnNumber);
            if (cd <= 8) score += 15;
            else if (cd <= 40) score += 6;
        }
    }
    const text = edit.text?.trim();
    if (text && text.length >= 2) {
        const after = source.slice(hit.end, hit.end + 240);
        if (after.includes(text)) score += 6;
    }
    return score;
}

export function pickBestOpening(source: string, tag: string, edit: DesignPendingEdit): OpeningTagHit | null {
    const hits = findOpeningTags(source, tag);
    if (!hits.length) return null;
    const ranked = hits
        .map((hit) => ({ hit, score: scoreOpening(hit, edit, source) }))
        .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best) return null;
    const second = ranked[1];
    if (second && best.score - second.score < 3 && best.score < 22) return null;
    if (best.score < MIN_LOCATE_SCORE) return null;
    return best.hit;
}
