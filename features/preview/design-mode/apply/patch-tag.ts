import { jsxClassExpressionKind } from "./locate-jsx";
import { mergeClassTokens } from "./class-tokens";

function classLiteralInner(literal: string): string {
    if (literal.startsWith("`")) return literal.slice(1, -1);
    return literal.slice(1, -1);
}

/** Keep class strings parseable: never nest the same quote used by the attribute. */
export function wrapClassLiteral(inner: string, mode: "string" | "expr"): string {
    if (!inner.includes('"')) return `"${inner}"`;
    if (!inner.includes("'")) return `'${inner}'`;
    const tmpl = `\`${inner.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``;
    return mode === "expr" ? tmpl : `{${tmpl}}`;
}

function insertClassesIntoLiteral(literal: string, tokens: string[], contextVariants = "", mode: "string" | "expr" = "string"): string {
    const inner = classLiteralInner(literal);
    const merged = mergeClassTokens(inner.split(/\s+/).filter(Boolean), tokens, contextVariants).join(" ");
    return wrapClassLiteral(merged, mode);
}

export function openingTagClassList(tagText: string): string[] {
    const m = tagText.match(/\b(?:className|class)\s*=\s*(?:\{\s*)?(["'`])([^]*?)\1/);
    if (!m?.[2]) return [];
    return m[2].split(/\s+/).filter(Boolean);
}

export function openingTagHasTokens(tagText: string, tokens: string[]): boolean {
    if (!tokens.length) return true;
    const list = new Set(openingTagClassList(tagText));
    if (tokens.every((t) => list.has(t))) return true;
    return tokens.every((t) => tagText.includes(t));
}

export function patchOpeningTag(tagText: string, tokens: string[], preferHtmlClass = false, contextVariants = ""): string {
    if (!tokens.length) return tagText;
    const kind = jsxClassExpressionKind(tagText);
    if (kind === "module" || kind === "spread" || kind === "template" || kind === "expression") return tagText;
    const classAttr = preferHtmlClass ? "class" : "className";
    const htmlClass = /\bclass\s*=/.test(tagText);
    const attr = htmlClass ? "class" : /\bclassName\s*=/.test(tagText) ? "className" : classAttr;

    const stringAttr = new RegExp(`(\\b${attr}\\s*=\\s*)("[^"]*"|'[^']*'|\`[^\`]*\`)`);
    const exprString = new RegExp(`(\\b${attr}\\s*=\\s*\\{\\s*)("[^"]*"|'[^']*'|\`[^\`]*\`)(\\s*\\})`);
    const cnCall = new RegExp(`(\\b${attr}\\s*=\\s*\\{\\s*(?:cn|clsx|classNames|twMerge)\\(\\s*)("[^"]*"|'[^']*'|\`[^\`]*\`)`);

    if (cnCall.test(tagText)) {
        return tagText.replace(cnCall, (_, prefix: string, lit: string) => `${prefix}${insertClassesIntoLiteral(lit, tokens, contextVariants, "expr")}`);
    }
    if (exprString.test(tagText)) {
        return tagText.replace(
            exprString,
            (_, prefix: string, lit: string, suffix: string) => `${prefix}${insertClassesIntoLiteral(lit, tokens, contextVariants, "expr")}${suffix}`,
        );
    }
    if (stringAttr.test(tagText)) {
        return tagText.replace(stringAttr, (_, prefix: string, lit: string) => `${prefix}${insertClassesIntoLiteral(lit, tokens, contextVariants, "string")}`);
    }

    const cnBare = new RegExp(`(\\b${attr}\\s*=\\s*\\{\\s*(?:cn|clsx|classNames|twMerge)\\()([\\s\\S]*?)(\\)\\s*\\})`);
    if (cnBare.test(tagText)) {
        const prefixed = mergeClassTokens([], tokens, contextVariants).join(" ");
        return tagText.replace(
            cnBare,
            (_, a: string, inner: string, b: string) => `${a}${inner.replace(/\s*$/, "")}, "${prefixed}"${b}`,
        );
    }

    const insert = ` ${attr}="${mergeClassTokens([], tokens, contextVariants).join(" ")}"`;
    if (tagText.endsWith("/>")) return `${tagText.slice(0, -2)}${insert} />`;
    return `${tagText.slice(0, -1)}${insert}>`;
}

function kebab(key: string) {
    return key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

function mergeHtmlStyleString(inner: string, styles: Record<string, string | undefined>): string {
    const map = new Map<string, string>();
    for (const part of inner.split(";")) {
        const idx = part.indexOf(":");
        if (idx < 0) continue;
        const prop = part.slice(0, idx).trim().toLowerCase();
        const val = part.slice(idx + 1).trim();
        if (prop && val) map.set(prop, val);
    }
    for (const [k, v] of Object.entries(styles)) {
        if (v == null || !String(v).trim()) continue;
        map.set(kebab(k), String(v).trim());
    }
    return [...map.entries()].map(([k, v]) => `${k}: ${v}`).join("; ");
}

function mergeJsxStyleBody(body: string, styles: Record<string, string | undefined>): string {
    let next = body.trim();
    if (next.endsWith(",")) next = next.slice(0, -1);
    for (const [k, v] of Object.entries(styles)) {
        if (v == null || !String(v).trim()) continue;
        const re = new RegExp(`(\\b${k}\\s*:\\s*)([^,}]+)`);
        if (re.test(next)) next = next.replace(re, `$1${JSON.stringify(v)}`);
        else next = next ? `${next}, ${k}: ${JSON.stringify(v)}` : `${k}: ${JSON.stringify(v)}`;
    }
    return next;
}

export function patchInlineStyles(
    tagText: string,
    styles: Record<string, string | undefined>,
    html: boolean,
): string {
    const entries = Object.entries(styles).filter(([, v]) => v != null && String(v).trim() !== "");
    if (!entries.length) return tagText;
    if (html) {
        const re = /(\bstyle\s*=\s*)(["'])([^"']*)\2/;
        if (re.test(tagText)) {
            return tagText.replace(re, (_, prefix: string, q: string, inner: string) => {
                return `${prefix}${q}${mergeHtmlStyleString(inner, styles)}${q}`;
            });
        }
        const extra = entries.map(([k, v]) => `${kebab(k)}: ${v}`).join("; ");
        const insert = ` style="${extra}"`;
        if (tagText.endsWith("/>")) return `${tagText.slice(0, -2)}${insert} />`;
        return `${tagText.slice(0, -1)}${insert}>`;
    }

    const obj = tagText.match(/(\bstyle\s*=\s*\{\{)([\s\S]*?)(\}\})/);
    if (obj) {
        const body = mergeJsxStyleBody(obj[2] ?? "", styles);
        return tagText.slice(0, obj.index!) + `${obj[1]}${body}${obj[3]}` + tagText.slice(obj.index! + obj[0].length);
    }
    const ident = tagText.match(/(?<![A-Za-z0-9_])(style\s*=\s*\{)([A-Za-z_$][\w$]*)(\})/);
    if (ident) {
        const extra = entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
        return tagText.replace(
            ident[0],
            `${ident[1]}{ ...${ident[2]}, ${extra} }${ident[3]}`,
        );
    }
    const body = entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
    const insert = ` style={{ ${body} }}`;
    if (tagText.endsWith("/>")) return `${tagText.slice(0, -2)}${insert} />`;
    return `${tagText.slice(0, -1)}${insert}>`;
}

export function patchTextChild(source: string, tagStart: number, tagEnd: number, tag: string, text: string): string {
    const after = source.slice(tagEnd);
    const close = new RegExp(`^(\\s*)([^<]*)(<\\/${tag}\\s*>)`, "i");
    const m = after.match(close);
    if (!m) return source;
    return source.slice(0, tagEnd) + m[1] + text + m[3] + after.slice(m[0].length);
}
