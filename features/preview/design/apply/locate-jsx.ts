import ts from "typescript";

export type JsxHit = {
    start: number;
    end: number;
    text: string;
    line: number;
    column: number;
    tagName: string;
};

function scriptKind(fileName: string): ts.ScriptKind {
    const n = fileName.toLowerCase();
    if (n.endsWith(".tsx")) return ts.ScriptKind.TSX;
    if (n.endsWith(".jsx")) return ts.ScriptKind.JSX;
    if (n.endsWith(".ts")) return ts.ScriptKind.TS;
    return ts.ScriptKind.JSX;
}

export function canParseJsx(fileName: string): boolean {
    return /\.(tsx|jsx|ts|js)$/i.test(fileName);
}

const jsxParseMemo = new Map<string, { source: string; sf: ts.SourceFile }>();

export function clearJsxParseCache() {
    jsxParseMemo.clear();
}

export function parseJsxFile(fileName: string, source: string): ts.SourceFile {
    const prev = jsxParseMemo.get(fileName);
    if (prev && prev.source === source) return prev.sf;
    const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind(fileName));
    jsxParseMemo.set(fileName, { source, sf });
    return sf;
}

export function validateJsxSource(fileName: string, source: string): string | null {
    if (!canParseJsx(fileName)) return null;
    const result = ts.transpileModule(source, {
        fileName,
        reportDiagnostics: true,
        compilerOptions: {
            target: ts.ScriptTarget.Latest,
            jsx: ts.JsxEmit.Preserve,
            allowJs: true,
        },
    });
    const fatal = result.diagnostics?.find((d) => d.category === ts.DiagnosticCategory.Error);
    if (!fatal) return null;
    return ts.flattenDiagnosticMessageText(fatal.messageText, "\n");
}

function collectOpenings(sf: ts.SourceFile): ts.JsxOpeningLikeElement[] {
    const openings: ts.JsxOpeningLikeElement[] = [];
    const visit = (node: ts.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) openings.push(node);
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return openings;
}

const SVG_INTRINSIC_TAGS = new Set([
    "svg", "path", "g", "circle", "ellipse", "line", "polyline", "polygon", "rect",
    "defs", "use", "symbol", "mask", "clippath", "lineargradient", "radialgradient",
    "stop", "tspan", "textpath", "marker", "pattern", "filter", "foreignobject",
]);

/** SVG internals are usually rendered by an icon component, so they never appear in the authored JSX. */
export function isSvgIntrinsicTag(tag: string): boolean {
    return SVG_INTRINSIC_TAGS.has((tag || "").toLowerCase());
}

function isComponentName(jsxName: string): boolean {
    return /^[A-Z]/.test(jsxName) || jsxName.includes(".");
}

/**
 * Whether a JSX tag name can be the source of a DOM element with `domTag`.
 * The DOM name and the authored name often differ: `next/link` renders `<a>`, and an
 * icon component renders the whole `<svg>` subtree, none of which exists in source.
 */
export function jsxNameMatchesDomTag(jsxName: string, domTag: string, componentName?: string): boolean {
    const a = jsxName.toLowerCase();
    const b = (domTag || "").toLowerCase();
    if (a === b) return true;
    if (b === "a" && /^(link|anchor|navlink)$/i.test(jsxName)) return true;
    if (b === "img" && /^(image|img)$/i.test(jsxName)) return true;
    if (componentName && jsxName === componentName) return true;
    if (isSvgIntrinsicTag(b) && isComponentName(jsxName)) return true;
    return false;
}

function tagMatches(jsxName: string, domTag: string) {
    return jsxNameMatchesDomTag(jsxName, domTag);
}

function childOpenings(opening: ts.JsxOpeningLikeElement): ts.JsxOpeningLikeElement[] {
    const parent = opening.parent;
    if (!parent || ts.isJsxSelfClosingElement(opening) || !ts.isJsxElement(parent)) return [];
    const out: ts.JsxOpeningLikeElement[] = [];
    const take = (nodes: readonly ts.Node[]) => {
        for (const c of nodes) {
            if (ts.isJsxElement(c)) out.push(c.openingElement);
            else if (ts.isJsxSelfClosingElement(c)) out.push(c);
            else if (ts.isJsxFragment(c)) take(c.children);
        }
    };
    take(parent.children);
    return out;
}

function topLevelOpenings(sf: ts.SourceFile): ts.JsxOpeningLikeElement[] {
    const all = collectOpenings(sf);
    return all.filter((opening) => {
        let p: ts.Node | undefined = opening.parent;
        if (p && ts.isJsxElement(p) && p.openingElement === opening) p = p.parent;
        while (p) {
            if (ts.isJsxElement(p) || ts.isJsxFragment(p)) return false;
            p = p.parent;
        }
        return true;
    });
}

export type SelectorPart = { tag: string; className?: string; nth: number };

export function parseCssPathSelector(selector: string): SelectorPart[] {
    const parts: SelectorPart[] = [];
    for (const raw of selector.split(">")) {
        const seg = raw.trim();
        const m = seg.match(/^([a-zA-Z][\w-]*)(?:#([^\s.#:]+))?(?:\.([^\s:#]+))?(?::nth-of-type\((\d+)\))?/);
        if (!m?.[1]) continue;
        const tag = m[1].toLowerCase();
        if (tag === "html" || tag === "body") continue;
        if (m[2] && !m[3]) continue;
        const part: SelectorPart = { tag, nth: m[4] ? Math.max(1, parseInt(m[4], 10)) : 1 };
        if (m[3]) part.className = m[3];
        parts.push(part);
    }
    return parts;
}

/**
 * Drop the parts below the outermost SVG element. `button>svg>path` becomes `button>svg`,
 * which can then match an icon component in source instead of failing on internals.
 */
export function selectorAtSvgRoot(selector: string | undefined): string | undefined {
    if (!selector) return undefined;
    const segments = selector.split(">");
    const at = segments.findIndex((seg) => isSvgIntrinsicTag(seg.trim().match(/^([a-zA-Z][\w-]*)/)?.[1] ?? ""));
    if (at < 0 || at === segments.length - 1) return undefined;
    return segments.slice(0, at + 1).join(">");
}

function nodeMatchesPart(sf: ts.SourceFile, node: ts.JsxOpeningLikeElement, part: SelectorPart): boolean {
    if (!tagMatches(node.tagName.getText(sf), part.tag)) return false;
    if (part.className && !jsxAttrBlob(sf, node).includes(part.className)) return false;
    return true;
}

function ancestorOpenings(node: ts.JsxOpeningLikeElement): ts.JsxOpeningLikeElement[] {
    const out: ts.JsxOpeningLikeElement[] = [];
    let p: ts.Node | undefined = node.parent;
    while (p) {
        if (ts.isJsxElement(p)) out.push(p.openingElement);
        p = p.parent;
    }
    return out;
}

function ancestorsFit(sf: ts.SourceFile, node: ts.JsxOpeningLikeElement, before: SelectorPart[]): boolean {
    let remaining = ancestorOpenings(node);
    for (let i = before.length - 1; i >= 0; i--) {
        const part = before[i]!;
        const hit = remaining.findIndex((n) => nodeMatchesPart(sf, n, part));
        if (hit < 0) {
            if (part.className) return false;
            continue;
        }
        remaining = remaining.slice(hit + 1);
    }
    return true;
}

function walkSelectorParts(
    sf: ts.SourceFile,
    start: ts.JsxOpeningLikeElement,
    parts: SelectorPart[],
): ts.JsxOpeningLikeElement | undefined {
    let chosen = start;
    let nodes = childOpenings(start);
    for (const part of parts) {
        let matched = nodes.filter((n) => nodeMatchesPart(sf, n, part));
        if (!matched.length) {
            const next = nodes.flatMap(childOpenings);
            if (!next.length) return undefined;
            nodes = next;
            matched = nodes.filter((n) => nodeMatchesPart(sf, n, part));
            if (!matched.length) return undefined;
        }
        chosen = matched[Math.min(matched.length - 1, part.nth - 1)]!;
        nodes = childOpenings(chosen);
    }
    return chosen;
}

export function locateJsxBySelector(
    source: string,
    fileName: string,
    selector: string | undefined,
): { ok: true; hit: JsxHit } | { ok: false; error: string } {
    const miss = (): { ok: false; error: string } => ({
        ok: false,
        error: `No JSX element at ${fileName.split(/[/\\]/).pop()} matches this node.`,
    });
    if (!selector || !canParseJsx(fileName)) return miss();
    const parts = parseCssPathSelector(selector);
    if (!parts.length) return miss();
    const sf = parseJsxFile(fileName, source);
    const all = collectOpenings(sf);
    const anchorAt = (() => {
        for (let i = parts.length - 1; i >= 0; i--) if (parts[i]?.className) return i;
        return -1;
    })();
    if (anchorAt >= 0) {
        const anchor = parts[anchorAt]!;
        const hits = all.filter((n) => nodeMatchesPart(sf, n, anchor)).filter((n) => ancestorsFit(sf, n, parts.slice(0, anchorAt)));
        const pool = hits.length ? hits : all.filter((n) => nodeMatchesPart(sf, n, anchor));
        if (pool.length === 1) {
            const rest = parts.slice(anchorAt + 1);
            const chosen = rest.length ? walkSelectorParts(sf, pool[0]!, rest) : pool[0];
            if (chosen) return toJsxHit(sf, source, chosen);
        } else if (pool.length > 1 && parts.length > anchorAt + 1) {
            const rest = parts.slice(anchorAt + 1);
            const found = pool
                .map((n) => walkSelectorParts(sf, n, rest))
                .filter((n): n is ts.JsxOpeningLikeElement => !!n);
            if (found.length === 1) return toJsxHit(sf, source, found[0]!);
        }
    }
    let nodes = topLevelOpenings(sf);
    let chosen: ts.JsxOpeningLikeElement | undefined;
    let hops = 0;
    for (let i = 0; i < parts.length && hops < 48; hops++) {
        const part = parts[i]!;
        let matched = nodes.filter((n) => nodeMatchesPart(sf, n, part));
        if (!matched.length && part.className) {
            matched = nodes.filter((n) => jsxAttrBlob(sf, n).includes(part.className!));
        }
        const laterClass = parts.slice(i + 1).some((p) => p.className);
        if (!matched.length || (!part.className && i < parts.length - 1 && laterClass)) {
            if (matched.length && laterClass) {
                const nextClass = parts.slice(i + 1).find((p) => p.className)!;
                const pick = matched[Math.min(matched.length - 1, part.nth - 1)]!;
                const under = [pick, ...childOpenings(pick).flatMap((n) => [n, ...childOpenings(n)])].some((n) =>
                    nodeMatchesPart(sf, n, nextClass),
                );
                if (under) {
                    chosen = pick;
                    nodes = childOpenings(pick);
                    i += 1;
                    continue;
                }
            }
            const next = nodes.flatMap(childOpenings);
            if (!next.length) break;
            nodes = next;
            continue;
        }
        const pick = matched[Math.min(matched.length - 1, part.nth - 1)]!;
        chosen = pick;
        nodes = childOpenings(pick);
        i += 1;
    }
    if (!chosen) return miss();
    return toJsxHit(sf, source, chosen);
}

export function locateJsxElement(
    source: string,
    fileName: string,
    loc: { lineNumber: number; columnNumber?: number } | undefined,
): { ok: true; hit: JsxHit } | { ok: false; error: string } {
    if (!canParseJsx(fileName)) {
        return { ok: false, error: "Not a JavaScript/TypeScript file." };
    }
    if (!loc?.lineNumber) {
        return { ok: false, error: "No source location from the preview; cannot safely choose an element." };
    }
    const sf = parseJsxFile(fileName, source);
    const openings = collectOpenings(sf);
    const line = loc.lineNumber;
    const col = loc.columnNumber ?? 1;
    let pos = 0;
    try {
        pos = sf.getPositionOfLineAndCharacter(Math.max(0, line - 1), Math.max(0, col - 1));
    } catch {
        pos = -1;
    }

    const covering = openings.filter((n) => pos >= n.getStart(sf) && pos <= n.getEnd());
    const onLine = openings.filter((n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 === line);

    let chosen: ts.JsxOpeningLikeElement | undefined;
    if (covering.length === 1) {
        chosen = covering[0];
    } else if (covering.length > 1) {
        const ranked = [...covering].sort((a, b) => a.getEnd() - a.getStart(sf) - (b.getEnd() - b.getStart(sf)));
        const a = ranked[0]!;
        const b = ranked[1]!;
        if (b.getEnd() - b.getStart(sf) - (a.getEnd() - a.getStart(sf)) < 12) {
            return {
                ok: false,
                error: `Multiple JSX nodes overlap ${fileName.split(/[/\\]/).pop()}:${line}; cannot safely edit.`,
            };
        }
        chosen = a;
    } else if (onLine.length === 1) {
        chosen = onLine[0];
    } else if (onLine.length > 1) {
        return {
            ok: false,
            error: `Line ${line} contains ${onLine.length} JSX tags; cannot safely choose one.`,
        };
    } else {
        return {
            ok: false,
            error: `No JSX element at ${fileName.split(/[/\\]/).pop()}:${line}.`,
        };
    }

    return toJsxHit(sf, source, chosen);
}

function toJsxHit(sf: ts.SourceFile, source: string, chosen: ts.JsxOpeningLikeElement): { ok: true; hit: JsxHit } {
    const start = chosen.getStart(sf);
    const end = chosen.getEnd();
    const lc = sf.getLineAndCharacterOfPosition(start);
    return {
        ok: true,
        hit: {
            start,
            end,
            text: source.slice(start, end),
            line: lc.line + 1,
            column: lc.character + 1,
            tagName: chosen.tagName.getText(sf),
        },
    };
}

function jsxAttrBlob(sf: ts.SourceFile, node: ts.JsxOpeningLikeElement): string {
    return node.attributes.getText(sf);
}

function afterOpeningText(source: string, node: ts.JsxOpeningLikeElement): string {
    const parent = node.parent;
    if (parent && ts.isJsxElement(parent)) {
        return parent.getText().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    return source.slice(node.getEnd(), Math.min(source.length, node.getEnd() + 80)).replace(/<[^>]+>/g, " ");
}

export function locateJsxByHint(
    source: string,
    fileName: string,
    hint: { className?: string; tag?: string; locateText?: string; lineNumber?: number; componentName?: string },
): { ok: true; hit: JsxHit } | { ok: false; error: string } {
    if (!canParseJsx(fileName)) {
        return { ok: false, error: "Not a JavaScript/TypeScript file." };
    }
    const sf = parseJsxFile(fileName, source);
    const openings = collectOpenings(sf);
    if (!openings.length) {
        return { ok: false, error: `No JSX in ${fileName.split(/[/\\]/).pop()}.` };
    }
    const tokens = (hint.className || "")
        .split(/\s+/)
        .filter((c) => c.length >= 3 && !SKIP_CLASS_TOKEN.test(c));
    const tag = (hint.tag || "").toLowerCase();
    const phrase = (hint.locateText || "").replace(/\s+/g, " ").trim().slice(0, 48);
    const pool =
        tokens.length > 0
            ? openings.filter((node) => tokens.every((t) => jsxAttrBlob(sf, node).includes(t)))
            : openings;
    if (tokens.length > 0 && pool.length === 1) {
        const only = pool[0]!;
        if (!tag || tagMatches(only.tagName.getText(sf), tag)) return toJsxHit(sf, source, only);
    }
    const candidates = pool.length ? pool : openings;
    if (tag && phrase.length >= 2) {
        const taggedAll = openings.filter((node) => tagMatches(node.tagName.getText(sf), tag));
        const byText = taggedAll.filter((node) => afterPhrase(source, node, phrase));
        if (byText.length === 1) return toJsxHit(sf, source, byText[0]!);
    }
    if (tag) {
        const tagged = candidates.filter((node) => tagMatches(node.tagName.getText(sf), tag));
        if (tagged.length === 1 && tokens.length === 0) return toJsxHit(sf, source, tagged[0]!);
    }
    if (phrase.length >= 2) {
        const byText = (tag ? candidates.filter((node) => tagMatches(node.tagName.getText(sf), tag)) : candidates).filter((node) =>
            afterPhrase(source, node, phrase),
        );
        if (byText.length === 1) return toJsxHit(sf, source, byText[0]!);
    }
    const ranked = candidates
        .filter((node) => !tag || tagMatches(node.tagName.getText(sf), tag))
        .map((node) => {
            const blob = jsxAttrBlob(sf, node);
            const name = node.tagName.getText(sf);
            let score = 0;
            for (const t of tokens) {
                if (blob.includes(t)) score += t.startsWith("!") || t.includes("/") ? 8 : t.length >= 8 ? 6 : 5;
            }
            if (tag && name.toLowerCase() === tag) score += 6;
            if (tag && /^[A-Z]/.test(name)) score += 1;
            if (hint.componentName && name === hint.componentName) score += 10;
            if (phrase.length >= 2 && afterPhrase(source, node, phrase)) score += phrase.length >= 8 ? 12 : 8;
            if (hint.lineNumber) {
                const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
                const dist = Math.abs(line - hint.lineNumber);
                if (dist === 0) score += 10;
                else if (dist <= 8) score += 4;
                else if (dist > 40) score -= 6;
            }
            return { node, score };
        })
        .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1];
    if (!best || best.score < 8) {
        return { ok: false, error: `No JSX element at ${fileName.split(/[/\\]/).pop()} matches this node.` };
    }
    if (second && best.score - second.score < 4) {
        return { ok: false, error: `Multiple JSX nodes in ${fileName.split(/[/\\]/).pop()} look the same; cannot safely choose one.` };
    }
    return toJsxHit(sf, source, best.node);
}

function bindingName(node: ts.Node): string | undefined {
    let n: ts.Node | undefined = node;
    while (n) {
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) return n.name.text;
        if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
        n = n.parent;
    }
    return undefined;
}

export function locateJsxFromSearchLine(
    source: string,
    fileName: string,
    line: number,
): { ok: true; hit: JsxHit } | { ok: false; error: string } {
    if (!canParseJsx(fileName) || !line) {
        return { ok: false, error: "Not a JavaScript/TypeScript file." };
    }
    const atLine = locateJsxElement(source, fileName, { lineNumber: line });
    if (atLine.ok) return atLine;
    const sf = parseJsxFile(fileName, source);
    let lit: ts.Node | undefined;
    const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
            const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
            if (line >= start && line <= end) lit = node;
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    const name = lit ? bindingName(lit) : undefined;
    if (!name) return { ok: false, error: `No JSX element at ${fileName.split(/[/\\]/).pop()}:${line}.` };
    const openings = collectOpenings(sf).filter((n) => n.attributes.getText(sf).includes(name));
    if (openings.length === 1) return toJsxHit(sf, source, openings[0]!);
    return { ok: false, error: `No JSX element at ${fileName.split(/[/\\]/).pop()}:${line}.` };
}

function isClassNameAttr(name: string) {
    return name === "className" || name === "class";
}

const SKIP_CLASS_TOKEN =
    /^(flex|inline-flex|grid|inline-grid|block|inline-block|hidden|contents|relative|absolute|fixed|sticky|static|shrink-0|grow|items-center|items-start|items-end|justify-center|justify-between|justify-start|whitespace-nowrap|outline-none|transition-all|select-none|pointer-events-none|rounded-md|rounded-lg|rounded-xl|font-medium|font-sans|text-sm|text-lg|w-full|h-full|overflow-hidden)$/;

function afterPhrase(source: string, node: ts.JsxOpeningLikeElement, phrase: string) {
    if (phrase.length < 2) return false;
    return afterOpeningText(source, node).includes(phrase);
}

export function jsxClassExpressionKind(
    tagText: string,
): "literal" | "cn" | "module" | "template" | "spread" | "expression" | "unknown" {
    if (/\b(?:className|class)\s*=\s*\{\s*\.\.\./.test(tagText)) return "spread";
    if (/\b(?:className|class)\s*=\s*\{\s*(?:cn|clsx|twMerge|cva|tv)\s*\(/.test(tagText)) return "cn";
    if (/\b(?:className|class)\s*=\s*\{\s*[A-Za-z_$][\w$]*\.[A-Za-z_$]/.test(tagText)) return "module";
    if (/\b(?:className|class)\s*=\s*\{\s*`/.test(tagText)) return "template";
    if (/\b(?:className|class)\s*=\s*\{\s*["']/.test(tagText)) return "literal";
    if (/\b(?:className|class)\s*=\s*\{/.test(tagText)) return "expression";
    if (/\b(?:className|class)\s*=\s*["']/.test(tagText)) return "literal";
    return "unknown";
}

export function jsxHasNestedTextOnly(source: string, tagEnd: number, tag: string): boolean {
    const after = source.slice(tagEnd);
    const close = new RegExp(`^(\\s*)([^<]*)(<\\/${tag}\\s*>)`, "i");
    return close.test(after);
}
