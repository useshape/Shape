/**
 * Pure utilities for locating and editing Tailwind/class strings in source text.
 * Used by inline tailwind controls, autocomplete, and decorations.
 */

export type ClassQuote = '"' | "'" | "`";

export interface ClassContext {
    /** Absolute start index of the class-string body (first char inside quotes) */
    bodyStart: number;
    /** Absolute end index of the class-string body (exclusive) */
    bodyEnd: number;
    quote: ClassQuote;
}

export interface ClassToken {
    value: string;
    /** Absolute start in full text */
    start: number;
    /** Absolute end in full text (exclusive) */
    end: number;
}

export interface ClassEdit {
    add?: string[];
    remove?: string[];
}

const CLASS_ATTR_RE = /\b(?:class(?:Name)?)\s*=\s*/g;
const CN_LIKE_RE = /\b(?:cn|clsx|cva|tv)\s*\(/g;

/** Mask comments so className inside comments is not matched; preserves string length/indices. */
function maskComments(text: string): string {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
        .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

function findQuotedString(
    text: string,
    openQuoteIdx: number,
): { bodyStart: number; bodyEnd: number; quote: ClassQuote } | null {
    const quote = text[openQuoteIdx] as ClassQuote;
    if (quote !== '"' && quote !== "'" && quote !== "`") return null;

    let i = openQuoteIdx + 1;
    while (i < text.length) {
        const ch = text[i];
        if (ch === "\\") {
            i += 2;
            continue;
        }
        if (ch === quote) {
            return { bodyStart: openQuoteIdx + 1, bodyEnd: i, quote };
        }
        i++;
    }
    return null;
}

/** Find the next non-whitespace char index at or after `from`. */
function skipWs(text: string, from: number): number {
    let i = from;
    while (i < text.length && /\s/.test(text[i])) i++;
    return i;
}

/**
 * Scan for string literal arguments inside cn/clsx/cva/tv(...) calls.
 * Returns contexts for each string argument found at the top level of the call.
 */
function findCnLikeContexts(text: string, from: number, to: number): ClassContext[] {
    const results: ClassContext[] = [];
    CN_LIKE_RE.lastIndex = from;
    let m: RegExpExecArray | null;
    while ((m = CN_LIKE_RE.exec(text)) !== null) {
        if (m.index >= to) break;
        let i = m.index + m[0].length;
        let depth = 1;
        while (i < text.length && depth > 0) {
            const ch = text[i];
            if (ch === "(") {
                depth++;
                i++;
                continue;
            }
            if (ch === ")") {
                depth--;
                if (depth === 0) break;
                i++;
                continue;
            }
            if (depth === 1) {
                if (ch === '"' || ch === "'" || ch === "`") {
                    const q = findQuotedString(text, i);
                    if (q) {
                        results.push(q);
                        i = q.bodyEnd + 1;
                        continue;
                    }
                }
            }
            i++;
        }
    }
    return results;
}

/**
 * Locate every class-string span in `text`.
 * Covers className="...", class="...", className={`...`}, and cn/clsx/cva/tv("...") args.
 */
export function findClassContexts(text: string): ClassContext[] {
    const contexts: ClassContext[] = [];
    const seen = new Set<string>();
    const masked = maskComments(text);

    const add = (ctx: ClassContext) => {
        const key = `${ctx.bodyStart}:${ctx.bodyEnd}`;
        if (seen.has(key)) return;
        seen.add(key);
        contexts.push(ctx);
    };

    CLASS_ATTR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CLASS_ATTR_RE.exec(masked)) !== null) {
        const afterEq = skipWs(masked, m.index + m[0].length);
        if (afterEq >= masked.length) continue;

        const ch = masked[afterEq];
        if (ch === '"' || ch === "'" || ch === "`") {
            const q = findQuotedString(text, afterEq);
            if (q) add(q);
            continue;
        }
        if (ch === "{") {
            let i = afterEq + 1;
            while (i < masked.length && masked[i] !== "}") {
                const ws = skipWs(masked, i);
                if (ws >= masked.length || masked[ws] === "}") break;
                const c = masked[ws];
                if (c === '"' || c === "'" || c === "`") {
                    const q = findQuotedString(text, ws);
                    if (!q) {
                        i = ws + 1;
                        continue;
                    }
                    add(q);
                    i = q.bodyEnd + 1;
                    continue;
                }
                if (/[a-z]/.test(c)) {
                    const cnContexts = findCnLikeContexts(text, ws, masked.indexOf("}", afterEq));
                    for (const ctx of cnContexts) add(ctx);
                }
                i = ws + 1;
            }
        }
    }

    for (const ctx of findCnLikeContexts(text, 0, text.length)) {
        add(ctx);
    }

    return contexts.sort((a, b) => a.bodyStart - b.bodyStart);
}

/** Split a class-string body into tokens with absolute offsets. */
export function getTokensInContext(text: string, ctx: ClassContext): ClassToken[] {
    const body = text.slice(ctx.bodyStart, ctx.bodyEnd);
    const tokens: ClassToken[] = [];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
        tokens.push({
            value: m[0],
            start: ctx.bodyStart + m.index,
            end: ctx.bodyStart + m.index + m[0].length,
        });
    }
    return tokens;
}

/** All tokens across every class context in `text`. */
export function getAllClassTokens(text: string): ClassToken[] {
    return findClassContexts(text).flatMap((ctx) => getTokensInContext(text, ctx));
}

/** Return the class context containing `offset`, or null. */
export function contextAtOffset(text: string, offset: number): ClassContext | null {
    for (const ctx of findClassContexts(text)) {
        if (offset >= ctx.bodyStart && offset <= ctx.bodyEnd) return ctx;
    }
    return null;
}

/** Return the token at `offset` (0-based column as char index in line), or null. */
export function tokenAtOffset(text: string, offset: number): ClassToken | null {
    const ctx = contextAtOffset(text, offset);
    if (!ctx) return null;
    for (const tok of getTokensInContext(text, ctx)) {
        if (offset >= tok.start && offset < tok.end) return tok;
    }
    return null;
}

/** Tokens in a context whose values match a predicate. */
export function tokensMatching(
    text: string,
    ctx: ClassContext,
    pred: (value: string) => boolean,
): ClassToken[] {
    return getTokensInContext(text, ctx).filter((t) => pred(t.value));
}

/**
 * Apply add/remove to a class-string body (not including quotes).
 * Whitespace-safe, dedupes adds, preserves relative order of existing tokens.
 */
export function applyClassEdit(classString: string, edit: ClassEdit): string {
    const removeSet = new Set(edit.remove ?? []);
    const addList = edit.add ?? [];

    const existing = classString.trim() ? classString.trim().split(/\s+/).filter(Boolean) : [];
    const result: string[] = [];
    const addedSet = new Set<string>();
    let insertedAdds = false;

    for (const t of existing) {
        if (removeSet.has(t)) {
            if (!insertedAdds) {
                for (const cls of addList) {
                    if (!addedSet.has(cls) && !existing.includes(cls)) {
                        result.push(cls);
                        addedSet.add(cls);
                    }
                }
                insertedAdds = true;
            }
        } else {
            result.push(t);
        }
    }

    for (const cls of addList) {
        if (!result.includes(cls)) result.push(cls);
    }

    return result.join(" ");
}

/** Apply edit to full line text at a specific context; returns new full line. */
export function applyClassEditInContext(
    text: string,
    ctx: ClassContext,
    edit: ClassEdit,
): string {
    const body = text.slice(ctx.bodyStart, ctx.bodyEnd);
    const nextBody = applyClassEdit(body, edit);
    return text.slice(0, ctx.bodyStart) + nextBody + text.slice(ctx.bodyEnd);
}

/** Cursor prefix: partial token being typed at offset inside a class context. */
export function getClassPrefixAtOffset(text: string, offset: number): string | null {
    const ctx = contextAtOffset(text, offset);
    if (!ctx) return null;
    const before = text.slice(ctx.bodyStart, offset);
    const parts = before.split(/\s+/);
    return parts[parts.length - 1] ?? "";
}

/** Monaco column is 1-based; bodyStart/bodyEnd are 0-based string indices. */
export function monacoRangeForContext(
    lineNumber: number,
    ctx: ClassContext,
): { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } {
    return {
        startLineNumber: lineNumber,
        startColumn: ctx.bodyStart + 1,
        endLineNumber: lineNumber,
        endColumn: ctx.bodyEnd + 1,
    };
}

export function getContextAtColumn(
    line: string,
    columnOneBased: number,
): { ctx: ClassContext; tokenValues: string[] } | null {
    const ctx = contextAtOffset(line, columnOneBased - 1);
    if (!ctx) return null;
    return {
        ctx,
        tokenValues: getTokensInContext(line, ctx).map((t) => t.value),
    };
}

/** Find class context using absolute offsets in the full file (handles multi-line class strings). */
export function getContextAtModelOffset(
    text: string,
    offset: number,
): { ctx: ClassContext; tokenValues: string[] } | null {
    for (let delta = 0; delta <= 4; delta++) {
        for (const tryOffset of delta === 0 ? [offset] : [offset - delta, offset + delta]) {
            if (tryOffset < 0 || tryOffset > text.length) continue;
            const ctx = contextAtOffset(text, tryOffset);
            if (ctx) {
                return {
                    ctx,
                    tokenValues: getTokensInContext(text, ctx).map((t) => t.value),
                };
            }
        }
    }
    return null;
}

export function sliceContextBody(text: string, ctx: ClassContext): string {
    return text.slice(ctx.bodyStart, ctx.bodyEnd);
}

export function monacoRangeForContextInModel(
    model: { getPositionAt: (offset: number) => { lineNumber: number; column: number } },
    ctx: ClassContext,
): { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } {
    const start = model.getPositionAt(ctx.bodyStart);
    const end = model.getPositionAt(ctx.bodyEnd);
    return {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
    };
}

export function isInsideClassContext(text: string, offset: number): boolean {
    return contextAtOffset(text, offset) !== null;
}
