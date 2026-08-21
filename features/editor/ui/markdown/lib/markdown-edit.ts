import {
    type MarkdownSourceRange,
} from "./markdown-format";

const EMPTY_PARAGRAPH = "<p><br></p>";

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineEndAt(content: string, offset: number): number {
    const nl = content.indexOf("\n", offset);
    return nl === -1 ? content.length : nl;
}

/** Insert an empty visual paragraph after a source offset. */
export function insertEmptyParagraphAfter(
    content: string,
    afterOffset: number,
): { next: string; caret: MarkdownSourceRange } {
    const at = Math.max(0, Math.min(content.length, afterOffset));
    const insert = `\n\n${EMPTY_PARAGRAPH}\n`;
    const next = content.slice(0, at) + insert + content.slice(at);
    const start = at + 2;
    return { next, caret: { start, end: start + EMPTY_PARAGRAPH.length } };
}

export function insertEmptyParagraphAtEnd(content: string): { next: string; caret: MarkdownSourceRange } {
    const trimmed = content.replace(/\s+$/, "");
    const prefix = trimmed.length ? `${trimmed}\n\n` : "";
    const next = prefix + EMPTY_PARAGRAPH + "\n";
    return {
        next,
        caret: { start: prefix.length, end: prefix.length + EMPTY_PARAGRAPH.length },
    };
}

export function isEmptyParagraphSlice(slice: string): boolean {
    const t = slice.trim();
    return (
        t === "" ||
        t === EMPTY_PARAGRAPH ||
        t === "<p></p>" ||
        t === "<br>" ||
        t === "<br/>" ||
        t === "<br />" ||
        t === "&nbsp;"
    );
}

export function replaceBlockVisibleText(
    content: string,
    block: MarkdownSourceRange,
    visible: string,
): string | null {
    const slice = content.slice(block.start, block.end);
    const body = visible.replace(/\u00a0/g, " ").replace(/\u200b/g, "").replace(/\n+$/, "");
    if (isEmptyParagraphSlice(slice)) {
        if (!body.trim()) {
            return content.slice(0, block.start) + EMPTY_PARAGRAPH + content.slice(block.end);
        }
        return content.slice(0, block.start) + body + content.slice(block.end);
    }

    const heading = slice.match(/^(\s*#{1,6}\s+)/);
    if (heading) {
        return content.slice(0, block.start) + heading[1] + body + content.slice(block.end);
    }
    const list = slice.match(/^(\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?)/);
    if (list) {
        return content.slice(0, block.start) + list[1] + body + content.slice(block.end);
    }
    const quote = slice.match(/^(>\s?)/);
    if (quote && !slice.slice(quote[1].length).includes("\n")) {
        return content.slice(0, block.start) + quote[1] + body + content.slice(block.end);
    }
    if (/^<p\b/i.test(slice.trim())) {
        return content.slice(0, block.start) + (body.trim() ? body : EMPTY_PARAGRAPH) + content.slice(block.end);
    }
    return content.slice(0, block.start) + body + content.slice(block.end);
}

export function deleteBlock(content: string, block: MarkdownSourceRange): string {
    let start = block.start;
    let end = block.end;
    while (end < content.length && (content[end] === "\n" || content[end] === "\r")) end++;
    while (start > 0 && content[start - 1] === "\n") start--;
    if (start > 0) start = Math.max(0, start);
    let next = content.slice(0, start) + (start > 0 && end < content.length ? "\n\n" : "") + content.slice(end);
    next = next.replace(/\n{3,}/g, "\n\n");
    return next;
}

export function insertMarkdownSnippet(
    content: string,
    at: number,
    snippet: string,
): string {
    const offset = Math.max(0, Math.min(content.length, at));
    const needsLead = offset > 0 && content[offset - 1] !== "\n";
    const needsTail = offset < content.length && content[offset] !== "\n";
    const piece = `${needsLead ? "\n\n" : ""}${snippet}${needsTail ? "\n\n" : ""}`;
    return content.slice(0, offset) + piece + content.slice(offset);
}

export function insertHorizontalRule(content: string, at: number): string {
    return insertMarkdownSnippet(content, at, "---");
}

export function insertTableSnippet(content: string, at: number): string {
    return insertMarkdownSnippet(
        content,
        at,
        "| Column 1 | Column 2 |\n| --- | --- |\n|  |  |",
    );
}

export function insertImageSnippet(content: string, at: number, src: string, alt = ""): string {
    const safeSrc = src.trim();
    if (!safeSrc) return content;
    return insertMarkdownSnippet(content, at, `![${alt}](${safeSrc})`);
}

export function moveMarkdownRange(
    content: string,
    range: MarkdownSourceRange,
    target: number,
): string {
    if (target >= range.start && target <= range.end) return content;
    let slice = content.slice(range.start, range.end);
    let from = range.start;
    let to = range.end;
    // Pull adjacent blank lines with a standalone image/paragraph block.
    if (content[to] === "\n") to++;
    if (from > 0 && content[from - 1] === "\n") {
        slice = "\n" + slice;
        from--;
    }
    const extracted = content.slice(0, from) + content.slice(to);
    let dest = target;
    if (target > range.start) dest -= to - from;
    dest = Math.max(0, Math.min(extracted.length, dest));
    const lead = dest > 0 && extracted[dest - 1] !== "\n" ? "\n\n" : "";
    const tail = dest < extracted.length && extracted[dest] !== "\n" ? "\n\n" : "";
    const body = slice.replace(/^\n+/, "").replace(/\n+$/, "");
    return (extracted.slice(0, dest) + lead + body + tail + extracted.slice(dest)).replace(/\n{3,}/g, "\n\n");
}

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/;
const HTML_IMG_RE = /<img\b[^>]*>/i;

function parseMdImageDest(dest: string): { src: string; title?: string } {
    const trimmed = dest.trim();
    const titled = trimmed.match(/^(\S+)\s+"([^"]*)"$/) || trimmed.match(/^(\S+)\s+'([^']*)'$/);
    if (titled) return { src: titled[1]!, title: titled[2] };
    return { src: trimmed.split(/\s+/)[0] ?? trimmed };
}

export function findImageSpan(
    content: string,
    src: string,
    preferred?: MarkdownSourceRange | null,
): MarkdownSourceRange | null {
    if (preferred && preferred.start >= 0 && preferred.end <= content.length && preferred.end > preferred.start) {
        const slice = content.slice(preferred.start, preferred.end);
        if (MD_IMAGE_RE.test(slice) || HTML_IMG_RE.test(slice) || slice.includes(src)) {
            return preferred;
        }
    }
    const needle = src.trim();
    if (!needle) return null;

    const html = new RegExp(`<img\\b[^>]*src=["']${escapeRegExp(needle)}["'][^>]*>`, "i");
    const htmlMatch = html.exec(content);
    if (htmlMatch && htmlMatch.index != null) {
        return { start: htmlMatch.index, end: htmlMatch.index + htmlMatch[0].length };
    }

    const md = new RegExp(`!\\[[^\\]]*\\]\\(\\s*${escapeRegExp(needle)}[^)]*\\)`);
    const mdMatch = md.exec(content);
    if (mdMatch && mdMatch.index != null) {
        return { start: mdMatch.index, end: mdMatch.index + mdMatch[0].length };
    }

    const idx = content.indexOf(needle);
    if (idx === -1) return null;
    const lineStart = content.lastIndexOf("\n", idx - 1) + 1;
    return { start: lineStart, end: lineEndAt(content, idx) };
}

export function setImageWidth(
    content: string,
    range: MarkdownSourceRange,
    width: number,
): string | null {
    const w = Math.max(40, Math.round(width));
    const slice = content.slice(range.start, range.end).trim();

    const md = slice.match(MD_IMAGE_RE);
    if (md && md[0] === slice) {
        const alt = md[1] ?? "";
        const { src, title } = parseMdImageDest(md[2] ?? "");
        const titleAttr = title ? ` title="${title}"` : "";
        const tag = `<img src="${src}" alt="${alt}"${titleAttr} width="${w}">`;
        const raw = content.slice(range.start, range.end);
        const lead = raw.match(/^\s*/)?.[0] ?? "";
        const tail = raw.match(/\s*$/)?.[0] ?? "";
        return content.slice(0, range.start) + lead + tag + tail + content.slice(range.end);
    }

    if (HTML_IMG_RE.test(slice)) {
        let tag = slice.match(HTML_IMG_RE)?.[0] ?? slice;
        if (/\bwidth\s*=/.test(tag)) {
            tag = tag.replace(/\bwidth\s*=\s*(["']?)\d+%?\1/i, `width="${w}"`);
        } else {
            tag = tag.replace(/<img\b/i, `<img width="${w}"`);
        }
        tag = tag.replace(/\bheight\s*=\s*(["']?)\d+%?\1/i, "");
        const raw = content.slice(range.start, range.end);
        return content.slice(0, range.start) + raw.replace(HTML_IMG_RE, tag) + content.slice(range.end);
    }

    const innerMd = slice.match(MD_IMAGE_RE);
    if (innerMd) {
        const alt = innerMd[1] ?? "";
        const { src, title } = parseMdImageDest(innerMd[2] ?? "");
        const titleAttr = title ? ` title="${title}"` : "";
        const tag = `<img src="${src}" alt="${alt}"${titleAttr} width="${w}">`;
        return content.slice(0, range.start) + slice.replace(MD_IMAGE_RE, tag) + content.slice(range.end);
    }

    return null;
}
