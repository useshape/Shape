/**
 * Pure helpers that apply formatting to markdown source based on a selected
 * piece of rendered text (or explicit source offsets from the preview DOM).
 */

export type MarkdownInlineFormat = "bold" | "italic" | "strike" | "code";
export type MarkdownBlockKind = "h1" | "h2" | "h3" | "p";

export type MarkdownSourceRange = { start: number; end: number };

const INLINE_MARKERS: Record<MarkdownInlineFormat, string> = {
    bold: "**",
    italic: "*",
    strike: "~~",
    code: "`",
};

function normalizePlain(s: string): string {
    return s
        .normalize("NFC")
        .replace(/\u00a0/g, " ")
        .replace(/\u200b/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
}

/**
 * Find selected plain text inside raw markdown, allowing formatting markers
 * and link destinations between character segments (DOM selection drops them).
 */
export function findMarkdownSpan(mdContent: string, plainText: string): string | null {
    const needle = normalizePlain(plainText).replace(/\s+/g, " ").trim();
    if (!needle) return null;
    if (mdContent.includes(needle)) return needle;

    // Project source → plain (links become labels, drop markers) with index map.
    const map: number[] = [];
    let plain = "";
    let i = 0;
    const src = normalizePlain(mdContent);
    while (i < src.length) {
        if (src.startsWith("![", i)) {
            const closeAlt = src.indexOf("]", i + 2);
            if (closeAlt !== -1 && src[closeAlt + 1] === "(") {
                const closeUrl = src.indexOf(")", closeAlt + 2);
                if (closeUrl !== -1) {
                    for (let j = i + 2; j < closeAlt; j++) {
                        plain += src[j];
                        map.push(j);
                    }
                    i = closeUrl + 1;
                    continue;
                }
            }
        }
        if (src[i] === "[" && src[i - 1] !== "!") {
            const closeText = src.indexOf("]", i + 1);
            if (closeText !== -1 && src[closeText + 1] === "(") {
                const closeUrl = src.indexOf(")", closeText + 2);
                if (closeUrl !== -1) {
                    for (let j = i + 1; j < closeText; j++) {
                        plain += src[j];
                        map.push(j);
                    }
                    i = closeUrl + 1;
                    continue;
                }
            }
        }
        if (src.startsWith("**", i) || src.startsWith("__", i) || src.startsWith("~~", i)) {
            i += 2;
            continue;
        }
        // Only treat * / _ / ` as markers when they are emphasis delimiters,
        // not mid-identifier underscores like foo_bar.
        if (src[i] === "`") {
            i += 1;
            continue;
        }
        if (src[i] === "*" || src[i] === "_") {
            const prev = i > 0 ? src[i - 1]! : "\n";
            const next = src[i + 1] ?? "\n";
            const flankedByWord = /\w/.test(prev) && /\w/.test(next);
            if (!flankedByWord) {
                i += 1;
                continue;
            }
        }
        if ((i === 0 || src[i - 1] === "\n") && src[i] === "#") {
            while (src[i] === "#") i++;
            if (src[i] === " " || src[i] === "\t") {
                i++;
                continue;
            }
        }
        // Skip ATX-style list / quote markers at line start
        if (i === 0 || src[i - 1] === "\n") {
            const line = src.slice(i);
            const list = line.match(/^\s*(?:[-*+]|\d+\.)\s+/);
            if (list) {
                i += list[0].length;
                continue;
            }
            const quote = line.match(/^>\s?/);
            if (quote) {
                i += quote[0].length;
                continue;
            }
        }
        // Skip HTML tags
        if (src[i] === "<" && /[a-zA-Z/!]/.test(src[i + 1] ?? "")) {
            const close = src.indexOf(">", i + 1);
            if (close !== -1) {
                i = close + 1;
                continue;
            }
        }
        const ch = src[i]!;
        if (/\s/.test(ch)) {
            if (plain.length && plain[plain.length - 1] !== " ") {
                plain += " ";
                map.push(i);
            }
            i++;
            continue;
        }
        plain += ch;
        map.push(i);
        i++;
    }

    const idx = plain.indexOf(needle);
    if (idx === -1) return null;
    const start = map[idx]!;
    const end = map[idx + needle.length - 1]! + 1;
    return src.slice(start, end);
}

/** Locate selected rendered text in the source. Prefer an explicit DOM-mapped range when provided. */
export function locateMarkdownText(
    content: string,
    selected: string,
    preferred?: MarkdownSourceRange | null,
): MarkdownSourceRange | null {
    if (preferred && preferred.start >= 0 && preferred.end > preferred.start && preferred.end <= content.length) {
        return preferred;
    }

    const needle = normalizePlain(selected).replace(/\s+/g, " ").trim();
    if (!needle) return null;

    const src = normalizePlain(content);
    const direct = src.indexOf(needle);
    if (direct !== -1) return { start: direct, end: direct + needle.length };

    const span = findMarkdownSpan(src, needle);
    if (span) {
        const idx = src.indexOf(span);
        if (idx !== -1) return { start: idx, end: idx + span.length };
    }

    // Last resort: search inside stripped projection (links → labels, drop markers).
    const stripped = src
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
        .replace(/(\*\*|__|\*|_|~~|`|#+\s+)/g, "");
    const strippedIdx = stripped.toLowerCase().indexOf(needle.toLowerCase());
    if (strippedIdx === -1) return null;

    // Approximate map: walk source consuming the same visible chars.
    let si = 0;
    let oi = 0;
    const visible = (c: string) => !/[\\*_~`#\[\]]/.test(c);
    while (oi < src.length && si < strippedIdx) {
        // skip link/image destinations
        if (src.startsWith("](", oi)) {
            const close = src.indexOf(")", oi + 2);
            oi = close === -1 ? src.length : close + 1;
            continue;
        }
        if (visible(src[oi]!) || /\s/.test(src[oi]!)) {
            if (!/\s/.test(src[oi]!) || (stripped[si] === " " || stripped[si] === "\n")) si++;
            else if (/\s/.test(src[oi]!)) {
                oi++;
                continue;
            } else si++;
        }
        oi++;
    }
    const start = oi;
    let left = needle.replace(/\s+/g, " ").length;
    while (oi < src.length && left > 0) {
        if (src.startsWith("](", oi)) {
            const close = src.indexOf(")", oi + 2);
            oi = close === -1 ? src.length : close + 1;
            continue;
        }
        const c = src[oi]!;
        if (visible(c) && !/\s/.test(c)) left--;
        else if (/\s/.test(c) && left > 0) {
            // collapse whitespace in needle
            while (oi + 1 < src.length && /\s/.test(src[oi + 1]!)) oi++;
            left--;
        }
        oi++;
    }
    return { start, end: Math.max(start + 1, oi) };
}

export function applyInlineMarkdownFormat(
    content: string,
    selected: string,
    format: MarkdownInlineFormat,
    preferred?: MarkdownSourceRange | null,
): string | null {
    const range = locateMarkdownText(content, selected, preferred);
    if (!range) return null;
    const marker = INLINE_MARKERS[format];
    const before = content.slice(range.start - marker.length, range.start);
    const after = content.slice(range.end, range.end + marker.length);

    if (before === marker && after === marker) {
        return (
            content.slice(0, range.start - marker.length) +
            content.slice(range.start, range.end) +
            content.slice(range.end + marker.length)
        );
    }
    if (format === "bold" && before === "__" && after === "__") {
        return (
            content.slice(0, range.start - 2) +
            content.slice(range.start, range.end) +
            content.slice(range.end + 2)
        );
    }
    if (format === "italic" && before === "_" && after === "_") {
        return (
            content.slice(0, range.start - 1) +
            content.slice(range.start, range.end) +
            content.slice(range.end + 1)
        );
    }

    // If the matched span already includes surrounding markers of this type, toggle those.
    const inner = content.slice(range.start, range.end);
    if (inner.startsWith(marker) && inner.endsWith(marker) && inner.length > marker.length * 2) {
        return (
            content.slice(0, range.start) +
            inner.slice(marker.length, inner.length - marker.length) +
            content.slice(range.end)
        );
    }

    return (
        content.slice(0, range.start) +
        marker +
        content.slice(range.start, range.end) +
        marker +
        content.slice(range.end)
    );
}

function lineBoundsAt(content: string, offset: number): { start: number; end: number } {
    const start = content.lastIndexOf("\n", offset - 1) + 1;
    const nl = content.indexOf("\n", offset);
    return { start, end: nl === -1 ? content.length : nl };
}

function linesIntersectingRange(content: string, range: MarkdownSourceRange): { start: number; end: number }[] {
    const lines: { start: number; end: number }[] = [];
    const from = Math.min(range.start, range.end);
    const to = Math.max(range.start, range.end);
    let start = content.lastIndexOf("\n", Math.max(0, from) - 1) + 1;
    for (;;) {
        const nl = content.indexOf("\n", start);
        const end = nl === -1 ? content.length : nl;
        lines.push({ start, end });
        if (nl === -1 || end >= to) break;
        start = end + 1;
    }
    return lines;
}

export function applyMarkdownBlock(
    content: string,
    selected: string,
    block: MarkdownBlockKind,
    preferred?: MarkdownSourceRange | null,
): string | null {
    const range = locateMarkdownText(content, selected, preferred);
    if (!range) return null;
    const lines = linesIntersectingRange(content, range);
    if (lines.length === 0) return null;
    const prefix = block === "p" ? "" : "#".repeat(Number(block.slice(1))) + " ";
    // Rewrite from bottom to top so offsets stay valid.
    let next = content;
    for (let i = lines.length - 1; i >= 0; i--) {
        const { start, end } = lines[i]!;
        const line = next.slice(start, end);
        if (!line.trim()) continue;
        const body = line.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*/, "");
        next = next.slice(0, start) + prefix + body + next.slice(end);
    }
    return next;
}

export function applyMarkdownList(
    content: string,
    selected: string,
    ordered: boolean,
    preferred?: MarkdownSourceRange | null,
): string | null {
    const range = locateMarkdownText(content, selected, preferred);
    if (!range) return null;
    const lines = linesIntersectingRange(content, range);
    if (lines.length === 0) return null;
    const listRe = /^\s*(?:[-*+]|\d+\.)\s+/;
    let next = content;
    let n = 1;
    const replacements: { start: number; end: number; text: string }[] = [];
    for (const { start, end } of lines) {
        const line = next.slice(start, end);
        if (!line.trim()) continue;
        const marker = ordered ? `${n}. ` : "- ";
        n += 1;
        const text = listRe.test(line)
            ? line.replace(listRe, marker)
            : marker + line.replace(/^\s*/, "");
        replacements.push({ start, end, text });
    }
    for (let i = replacements.length - 1; i >= 0; i--) {
        const r = replacements[i]!;
        next = next.slice(0, r.start) + r.text + next.slice(r.end);
    }
    return next;
}

export function replaceMarkdownText(
    content: string,
    selected: string,
    next: string,
    preferred?: MarkdownSourceRange | null,
): string | null {
    const range = locateMarkdownText(content, selected, preferred);
    if (!range) return null;
    return content.slice(0, range.start) + next + content.slice(range.end);
}

/**
 * Map a browser Selection inside a preview root to markdown source offsets
 * using data-source-start/end stamped by remarkSourcePositions.
 */
export function selectionToSourceRange(
    content: string,
    selection: Selection,
    root: HTMLElement,
): MarkdownSourceRange | null {
    if (selection.rangeCount === 0 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;

    const text = normalizePlain(selection.toString()).replace(/\s+/g, " ").trim();
    if (!text) return null;

    const startEl =
        (range.startContainer.nodeType === Node.ELEMENT_NODE
            ? (range.startContainer as Element)
            : range.startContainer.parentElement
        )?.closest("[data-source-start][data-source-end]") ?? null;
    const endEl =
        (range.endContainer.nodeType === Node.ELEMENT_NODE
            ? (range.endContainer as Element)
            : range.endContainer.parentElement
        )?.closest("[data-source-start][data-source-end]") ?? null;

    if (startEl && root.contains(startEl)) {
        const blockStart = Number(startEl.getAttribute("data-source-start"));
        const blockEnd = Number(
            (endEl && root.contains(endEl) ? endEl : startEl).getAttribute("data-source-end"),
        );
        if (
            Number.isFinite(blockStart) &&
            Number.isFinite(blockEnd) &&
            blockStart >= 0 &&
            blockEnd <= content.length &&
            blockEnd > blockStart
        ) {
            const slice = content.slice(blockStart, blockEnd);
            const inner = locateMarkdownText(slice, text);
            if (inner) {
                return { start: blockStart + inner.start, end: blockStart + inner.end };
            }
            // Whole-block selection (e.g. clicked a heading)
            if (normalizePlain(startEl.textContent || "").replace(/\s+/g, " ").trim() === text) {
                // Prefer the visible title inside an ATX heading line
                const headingBody = slice.replace(/^\s*#{1,6}\s+/, "").trimEnd();
                if (headingBody && slice.includes(headingBody)) {
                    const hs = slice.indexOf(headingBody);
                    return { start: blockStart + hs, end: blockStart + hs + headingBody.length };
                }
                return { start: blockStart, end: blockEnd };
            }
        }
    }

    return locateMarkdownText(content, text);
}
