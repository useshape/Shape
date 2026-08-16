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

export function parseJsxFile(fileName: string, source: string): ts.SourceFile {
    return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind(fileName));
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
    return source.slice(node.getEnd(), Math.min(source.length, node.getEnd() + 500)).replace(/<[^>]+>/g, " ");
}

export function locateJsxByHint(
    source: string,
    fileName: string,
    hint: { className?: string; tag?: string; locateText?: string; lineNumber?: number },
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
        .filter((c) => c.length >= 4 && !/^(inline-flex|shrink-0|items-center|justify-center|whitespace-nowrap|outline-none|transition-all|select-none|pointer-events-none|rounded-md|font-medium)$/.test(c));
    const tag = (hint.tag || "").toLowerCase();
    const phrase = (hint.locateText || "").replace(/\s+/g, " ").trim().slice(0, 48);
    const ranked = openings
        .map((node) => {
            const blob = jsxAttrBlob(sf, node);
            const name = node.tagName.getText(sf);
            let score = 0;
            for (const t of tokens) {
                if (blob.includes(t)) score += t.startsWith("!") || t.includes("/") ? 8 : t.length >= 8 ? 4 : 2;
            }
            if (tag && name.toLowerCase() === tag) score += 6;
            if (tag && /^[A-Z]/.test(name)) score += 1;
            if (phrase.length >= 8 && afterOpeningText(source, node).includes(phrase.slice(0, 32))) score += 12;
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

export function jsxClassExpressionKind(
    tagText: string,
): "literal" | "cn" | "module" | "template" | "spread" | "unknown" {
    if (/\b(?:className|class)\s*=\s*\{\s*\.\.\./.test(tagText)) return "spread";
    if (/\b(?:className|class)\s*=\s*\{\s*(?:cn|clsx|twMerge|cva|tv)\s*\(/.test(tagText)) return "cn";
    if (/\b(?:className|class)\s*=\s*\{\s*[A-Za-z_$][\w$]*\.[A-Za-z_$]/.test(tagText)) return "module";
    if (/\b(?:className|class)\s*=\s*\{\s*`/.test(tagText)) return "template";
    if (/\b(?:className|class)\s*=\s*(?:\{\s*)?["']/.test(tagText)) return "literal";
    return "unknown";
}

export function jsxHasNestedTextOnly(source: string, tagEnd: number, tag: string): boolean {
    const after = source.slice(tagEnd);
    const close = new RegExp(`^(\\s*)([^<]*)(<\\/${tag}\\s*>)`, "i");
    return close.test(after);
}
