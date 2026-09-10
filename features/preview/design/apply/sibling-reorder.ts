/**
 * Reorder JSX/HTML sibling elements by index within a parent opening tag's children.
 * Fails closed on `.map(`, spreads, or non-element children between siblings.
 */

export type SiblingReorderResult = { content: string } | { error: string };

function findMatchingClose(source: string, openEnd: number, tagName: string): number {
    const openRe = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
    const closeRe = new RegExp(`</${tagName}\\s*>`, "gi");
    let depth = 1;
    let i = openEnd;
    while (i < source.length && depth > 0) {
        openRe.lastIndex = i;
        closeRe.lastIndex = i;
        const o = openRe.exec(source);
        const c = closeRe.exec(source);
        if (!c) return -1;
        if (o && o.index < c.index) {
            // self-closing?
            const slice = o[0];
            if (!/\/>$/.test(slice)) depth += 1;
            i = o.index + slice.length;
        } else {
            depth -= 1;
            if (depth === 0) return c.index + c[0].length;
            i = c.index + c[0].length;
        }
    }
    return -1;
}

function splitTopLevelChildren(inner: string): { chunks: string[]; error?: string } {
    const chunks: string[] = [];
    let i = 0;
    const len = inner.length;
    while (i < len) {
        while (i < len && /\s/.test(inner[i]!)) i += 1;
        if (i >= len) break;
        if (inner.startsWith("{", i)) {
            // expression child — refuse if it looks like a map/spread
            let depth = 0;
            let j = i;
            for (; j < len; j++) {
                const ch = inner[j]!;
                if (ch === "{") depth += 1;
                else if (ch === "}") {
                    depth -= 1;
                    if (depth === 0) {
                        j += 1;
                        break;
                    }
                }
            }
            const expr = inner.slice(i, j);
            if (/\.map\s*\(|\.\.\./.test(expr)) {
                return {
                    chunks: [],
                    error: "Cannot reorder siblings that include .map() or spreads — edit the source array.",
                };
            }
            // Skip non-element expressions (whitespace/comments ok to refuse)
            return {
                chunks: [],
                error: "Cannot reorder when parent children include JSX expressions.",
            };
        }
        if (inner[i] !== "<") {
            // text node between elements
            let j = i;
            while (j < len && inner[j] !== "<") j += 1;
            const text = inner.slice(i, j).trim();
            if (text) {
                return {
                    chunks: [],
                    error: "Cannot reorder when parent has mixed text and element children.",
                };
            }
            i = j;
            continue;
        }
        // element
        const tagMatch = inner.slice(i).match(/^<\s*([A-Za-z][\w.-]*)/);
        if (!tagMatch) {
            return { chunks: [], error: "Could not parse sibling opening tag." };
        }
        const tag = tagMatch[1]!;
        const openEndRel = inner.slice(i).search(/>/);
        if (openEndRel < 0) return { chunks: [], error: "Unclosed sibling tag." };
        const openAbsEnd = i + openEndRel + 1;
        const openSlice = inner.slice(i, openAbsEnd);
        if (/\/>$/.test(openSlice) || /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i.test(openSlice)) {
            chunks.push(openSlice);
            i = openAbsEnd;
            continue;
        }
        const closeAbs = findMatchingClose(inner, openAbsEnd, tag);
        if (closeAbs < 0) return { chunks: [], error: `Unclosed </${tag}>.` };
        chunks.push(inner.slice(i, closeAbs));
        i = closeAbs;
    }
    return { chunks };
}

/**
 * Move the child at `fromIndex` to `toIndex` inside the first element matching
 * a simple tag-ish parentSelector (e.g. `div.flex` or `ul`), near optional line hint.
 */
export function reorderSiblingElements(
    source: string,
    opts: {
        parentHint?: string;
        fromIndex: number;
        toIndex: number;
        nearLine?: number;
    },
): SiblingReorderResult {
    const { fromIndex, toIndex } = opts;
    if (fromIndex === toIndex) return { content: source };
    if (fromIndex < 0 || toIndex < 0) {
        return { error: "Invalid sibling reorder indices." };
    }

    // Find a parent opening tag: prefer nearLine, else first match of hint tag
    const hint = (opts.parentHint || "").trim();
    const tagFromHint = hint.match(/^([A-Za-z][\w.-]*)/)?.[1] || "div";
    const openRe = new RegExp(`<${tagFromHint}\\b[^>]*>`, "gi");
    const opens: { start: number; end: number; text: string; line: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = openRe.exec(source))) {
        const start = m.index;
        const text = m[0];
        if (/\/>$/.test(text)) continue;
        const line = source.slice(0, start).split("\n").length;
        opens.push({ start, end: start + text.length, text, line });
    }
    if (!opens.length) {
        return { error: `Couldn't find parent <${tagFromHint}> for sibling reorder.` };
    }

    let parent = opens[0]!;
    if (opts.nearLine != null) {
        parent = opens.reduce((best, cur) =>
            Math.abs(cur.line - opts.nearLine!) < Math.abs(best.line - opts.nearLine!) ? cur : best,
        );
    }

    const closeEnd = findMatchingClose(source, parent.end, tagFromHint);
    if (closeEnd < 0) return { error: `Unclosed parent <${tagFromHint}>.` };

    // Find close tag start
    const closeMatch = source.slice(parent.end, closeEnd).match(new RegExp(`</${tagFromHint}\\s*>$`, "i"));
    if (!closeMatch) return { error: `Couldn't locate closing </${tagFromHint}>.` };
    const innerStart = parent.end;
    const innerEnd = closeEnd - closeMatch[0].length;
    const inner = source.slice(innerStart, innerEnd);
    const split = splitTopLevelChildren(inner);
    if (split.error) return { error: split.error };
    const { chunks } = split;
    if (fromIndex >= chunks.length) {
        return { error: `Sibling index ${fromIndex} out of range (${chunks.length} children).` };
    }
    const clampedTo = Math.max(0, Math.min(chunks.length - 1, toIndex));
    const next = [...chunks];
    const [item] = next.splice(fromIndex, 1);
    if (!item) return { error: "Sibling move failed." };
    next.splice(clampedTo, 0, item);
    const rebuilt = next.join("\n");
    const content = source.slice(0, innerStart) + rebuilt + source.slice(innerEnd);
    return { content };
}
