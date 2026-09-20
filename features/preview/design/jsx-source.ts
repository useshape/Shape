import { parse, print, types, visit } from "recast";
import * as babelTs from "recast/parsers/babel-ts";
import { twMerge } from "tailwind-merge";
import { transformStyleToTailwindcss } from "transform-to-tailwindcss-core";

const b = types.builders;
const n = types.namedTypes;

export type JsxLocateQuery = {
    tag: string;
    classes?: string[];
    text?: string | null;
    line?: number | null;
    column?: number | null;
};

export type JsxPatch = {
    styles?: Record<string, string>;
    text?: string | null;
    attributes?: Record<string, string>;
};

type Candidate = {
    node: unknown;
    tag: string;
    line: number;
    column: number;
    classes: string[];
    text: string;
    score: number;
};

function parseTsx(source: string) {
    return parse(source, { parser: babelTs });
}

function jsxName(name: types.namedTypes.JSXIdentifier | types.namedTypes.JSXMemberExpression | types.namedTypes.JSXNamespacedName | null | undefined): string {
    if (!name) return "";
    if (n.JSXIdentifier.check(name)) return name.name;
    if (n.JSXNamespacedName.check(name)) return name.name.name;
    if (n.JSXMemberExpression.check(name)) {
        const object = jsxName(name.object as never);
        const property = n.JSXIdentifier.check(name.property) ? name.property.name : "";
        return object && property ? `${object}.${property}` : property || object;
    }
    return "";
}

function stringFromExpr(node: unknown): string {
    if (!node) return "";
    if (n.StringLiteral.check(node) || n.Literal.check(node)) {
        return String((node as { value?: unknown }).value ?? "");
    }
    if (n.TemplateLiteral.check(node)) {
        return node.quasis.map((part) => part.value.cooked || part.value.raw || "").join(" ");
    }
    if (n.JSXExpressionContainer.check(node)) return stringFromExpr(node.expression);
    if (n.BinaryExpression.check(node) || n.LogicalExpression.check(node)) {
        return `${stringFromExpr(node.left)} ${stringFromExpr(node.right)}`;
    }
    if (n.CallExpression.check(node)) {
        return node.arguments.map((arg) => stringFromExpr(arg)).join(" ");
    }
    if (n.ArrayExpression.check(node)) {
        return node.elements.map((el) => stringFromExpr(el)).join(" ");
    }
    if (n.ConditionalExpression.check(node)) {
        return `${stringFromExpr(node.consequent)} ${stringFromExpr(node.alternate)}`;
    }
    return "";
}

function attrNamed(attrs: unknown[] | undefined, names: string[]) {
    return (attrs || []).find((attr) => {
        if (!n.JSXAttribute.check(attr)) return false;
        const name = n.JSXIdentifier.check(attr.name) ? attr.name.name : "";
        return names.includes(name);
    }) as types.namedTypes.JSXAttribute | undefined;
}

function classListFromOpening(opening: types.namedTypes.JSXOpeningElement) {
    const attr = attrNamed(opening.attributes as unknown[], ["className", "class"]);
    return stringFromExpr(attr?.value)
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean);
}

function textFromElement(path: { parent?: { node?: unknown } }) {
    const parent = path.parent?.node;
    if (!n.JSXElement.check(parent) || !Array.isArray(parent.children)) return "";
    return parent.children
        .map((child) => {
            if (n.JSXText.check(child)) return child.value;
            if (n.Literal.check(child)) return String(child.value ?? "");
            return "";
        })
        .join("")
        .replace(/\s+/g, " ")
        .trim();
}

function locOf(node: { loc?: { start?: { line?: number; column?: number } } | null }) {
    return {
        line: node.loc?.start?.line || 1,
        column: (node.loc?.start?.column || 0) + 1,
    };
}

export function isComponentTag(tag: string) {
    if (tag.includes(".")) return true;
    return /^[A-Z]/.test(tag) && /[a-z]/.test(tag);
}

const REACT_DOM_ATTR = new Set([
    "className",
    "class",
    "htmlFor",
    "tabIndex",
    "readOnly",
    "autoFocus",
    "autoComplete",
    "autoPlay",
    "contentEditable",
    "spellCheck",
    "colSpan",
    "rowSpan",
    "crossOrigin",
    "maxLength",
    "minLength",
    "defaultValue",
    "defaultChecked",
    "dangerouslySetInnerHTML",
    "srcSet",
    "useMap",
    "hrefLang",
    "inputMode",
    "itemProp",
    "itemScope",
    "itemType",
    "itemID",
    "itemRef",
    "noValidate",
    "radioGroup",
    "srcDoc",
    "allowFullScreen",
    "playsInline",
    "formAction",
    "formEncType",
    "formMethod",
    "formNoValidate",
    "formTarget",
    "acceptCharset",
    "encType",
    "strokeWidth",
    "fillOpacity",
    "strokeOpacity",
    "fontSize",
    "fontFamily",
    "clipPath",
    "fillRule",
    "strokeDasharray",
    "strokeLinecap",
    "strokeLinejoin",
    "viewBox",
    "preserveAspectRatio",
    "gradientUnits",
    "gradientTransform",
    "patternUnits",
    "patternTransform",
    "xlinkHref",
    "xmlLang",
    "xmlnsXlink",
]);

/** Matches https://react.dev/warnings/unknown-prop — camelCase component props on DOM tags. */
export function wouldReactWarnUnknownProp(tag: string, name: string) {
    if (!name || isComponentTag(tag) || tag.includes("-")) return false;
    if (name.startsWith("data-") || name.startsWith("aria-")) return false;
    if (/^on[A-Z]/.test(name)) return false;
    if (REACT_DOM_ATTR.has(name)) return false;
    if (/^[a-z][a-z0-9-]*$/.test(name)) return false;
    return true;
}

export function isSafeDomAttribute(tag: string, name: string) {
    return !wouldReactWarnUnknownProp(tag, name);
}

export function unknownDomProps(source: string): Array<{ tag: string; name: string; line: number }> {
    const ast = parseTsx(source);
    const out: Array<{ tag: string; name: string; line: number }> = [];
    visit(ast, {
        visitJSXOpeningElement(path) {
            const tag = jsxName(path.node.name as never);
            const loc = locOf(path.node);
            for (const attr of path.node.attributes || []) {
                if (!n.JSXAttribute.check(attr) || !n.JSXIdentifier.check(attr.name)) continue;
                const name = attr.name.name;
                if (wouldReactWarnUnknownProp(tag, name)) {
                    out.push({ tag, name, line: loc.line });
                }
            }
            this.traverse(path);
        },
    });
    return out;
}

function assertNoNewUnknownDomProps(before: string, after: string) {
    const prev = new Set(unknownDomProps(before).map((item) => `${item.tag}:${item.name}:${item.line}`));
    const added = unknownDomProps(after).filter((item) => !prev.has(`${item.tag}:${item.name}:${item.line}`));
    if (!added.length) return;
    const first = added[0]!;
    throw new Error(
        `React does not recognize the \`${first.name}\` prop on a DOM element <${first.tag}>. ` +
            `Instance props must be written on the component call site, not the host node.`,
    );
}

function scoreCandidate(query: JsxLocateQuery, item: { tag: string; classes: string[]; text: string; line: number }) {
    let score = 0;
    if (item.tag === query.tag) score += 60;
    else if (
        !isComponentTag(query.tag) &&
        !isComponentTag(item.tag) &&
        item.tag.toLowerCase() === query.tag.toLowerCase()
    ) {
        score += 50;
    } else score -= 80;
    const wanted = (query.classes || []).filter(Boolean);
    const hits = wanted.filter((cls) => item.classes.includes(cls)).length;
    score += hits * 12;
    if (wanted.length && hits === wanted.length) score += 20;
    if (query.text && item.text && item.text.includes(query.text.slice(0, 40))) score += 25;
    if (query.line && query.line > 0) {
        const dist = Math.abs(item.line - query.line);
        score += Math.max(0, 40 - dist);
    }
    return score;
}

function collectFromAst(ast: ReturnType<typeof parseTsx>, query: JsxLocateQuery): Candidate[] {
    const out: Candidate[] = [];
    const take = (path: { node: types.namedTypes.JSXOpeningElement; parent?: { node?: unknown } }) => {
        const tag = jsxName(path.node.name as never);
        if (!tag) return;
        const loc = locOf(path.node);
        const classes = classListFromOpening(path.node);
        const text = textFromElement(path);
        const base = { tag, line: loc.line, column: loc.column, classes, text };
        out.push({ node: path.node, ...base, score: scoreCandidate(query, base) });
    };
    visit(ast, {
        visitJSXOpeningElement(path) {
            take(path as never);
            this.traverse(path);
        },
    });
    return out.sort((a, b) => b.score - a.score);
}

function collect(source: string, query: JsxLocateQuery): Candidate[] {
    return collectFromAst(parseTsx(source), query);
}

export function locateJsx(source: string, query: JsxLocateQuery) {
    const [best, second] = collect(source, query);
    if (!best || best.score < 40) return null;
    if (second && second.score === best.score && best.score < 70) return null;
    return { tag: best.tag, line: best.line, column: best.column };
}

function kebabCss(property: string) {
    return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

const VAR_TW: Record<string, string> = {
    color: "text",
    "background-color": "bg",
    background: "bg",
    "border-color": "border",
    fill: "fill",
    stroke: "stroke",
};

export function stylesToTailwind(styles: Record<string, string>) {
    const tokens: string[] = [];
    const rest: Record<string, string> = {};
    for (const [property, value] of Object.entries(styles)) {
        if (!value) continue;
        if (/var\s*\(/i.test(value)) {
            const kebab = kebabCss(property);
            const prefix = VAR_TW[kebab];
            const compact = value.replace(/\s+/g, "");
            tokens.push(prefix ? `${prefix}-[${compact}]` : `[${kebab}:${compact}]`);
            continue;
        }
        rest[property] = value;
    }
    const decls = Object.entries(rest)
        .map(([property, value]) => `${kebabCss(property)}: ${value}`)
        .join("; ");
    let converted = "";
    const extras: string[] = [];
    if (decls) {
        const [classes, unconverted] = transformStyleToTailwindcss(decls, false, false, true);
        converted = classes;
        for (const decl of unconverted) {
            const colon = decl.indexOf(":");
            if (colon < 0) continue;
            const property = decl.slice(0, colon).trim();
            const value = decl.slice(colon + 1).trim().replace(/;$/, "").replace(/\s+/g, "_");
            if (!property || !value) continue;
            extras.push(`[${property}:${value}]`);
        }
    }
    return twMerge(converted, extras.join(" "), tokens.join(" "));
}

function callName(expr: types.namedTypes.Expression | types.namedTypes.SpreadElement | null | undefined) {
    if (!expr || n.SpreadElement.check(expr)) return "";
    if (n.Identifier.check(expr)) return expr.name;
    if (n.MemberExpression.check(expr) && n.Identifier.check(expr.property)) return expr.property.name;
    return "";
}

function setOpeningUtilities(
    opening: types.namedTypes.JSXOpeningElement,
    styles: Record<string, string>,
) {
    const add = stylesToTailwind(styles);
    if (!add) return;
    const attrs = (opening.attributes ||= []) as types.namedTypes.JSXAttribute[];
    const attr = attrNamed(attrs, ["className", "class"]);
    const name = attrNamed(attrs, ["class"]) && !attrNamed(attrs, ["className"]) ? "class" : "className";
    if (!attr) {
        attrs.push(b.jsxAttribute(b.jsxIdentifier(name), b.stringLiteral(add)));
        return;
    }
    if (n.StringLiteral.check(attr.value) || n.Literal.check(attr.value)) {
        attr.value = b.stringLiteral(twMerge(String(attr.value.value ?? ""), add));
        return;
    }
    if (n.JSXExpressionContainer.check(attr.value)) {
        const expr = attr.value.expression;
        if (n.StringLiteral.check(expr) || n.Literal.check(expr)) {
            attr.value = b.jsxExpressionContainer(b.stringLiteral(twMerge(String(expr.value ?? ""), add)));
            return;
        }
        if (n.CallExpression.check(expr)) {
            const callee = callName(expr.callee as never);
            if (["cn", "clsx", "classNames", "twMerge", "cx"].includes(callee)) {
                expr.arguments.push(b.stringLiteral(add));
                return;
            }
        }
    }
    throw new Error("This element uses a dynamic className. Shape will not overwrite it.");
}

export function patchHtmlOpening(source: string, start: number, end: number, styles: Record<string, string>) {
    const add = stylesToTailwind(styles);
    if (!add || start < 0 || end > source.length || start >= end) return source;
    const opening = source.slice(start, end);
    const match = opening.match(/\s(className|class)\s*=\s*(["'])([^"']*)\2/);
    let next = opening;
    if (match && match.index != null) {
        const merged = twMerge(match[3], add);
        next = `${opening.slice(0, match.index)} ${match[1]}=${match[2]}${merged}${match[2]}${opening.slice(match.index + match[0].length)}`;
    } else {
        if (/\sclass(Name)?\s*=\s*\{/.test(opening) || /\bclass:list\b/.test(opening)) {
            throw new Error("This element uses a dynamic class. Shape will not overwrite it.");
        }
        const insert = opening.search(/\s*\/?>$/);
        const at = insert >= 0 ? insert : opening.length;
        next = `${opening.slice(0, at)} class="${add}"${opening.slice(at)}`;
    }
    return `${source.slice(0, start)}${next}${source.slice(end)}`;
}

function setOpeningAttr(
    opening: types.namedTypes.JSXOpeningElement,
    name: string,
    value: string,
) {
    const tag = jsxName(opening.name as never);
    if (!isSafeDomAttribute(tag, name)) {
        throw new Error(`Refusing to write "${name}" onto <${tag}>. That prop belongs on a component instance.`);
    }
    const attrs = (opening.attributes ||= []) as types.namedTypes.JSXAttribute[];
    const existing = attrNamed(attrs, [name]);
    if (value === "false" && (name.startsWith("is") || name.startsWith("has") || /^(disabled|checked|open|required|selected|hidden|loading|invalid|readOnly)$/i.test(name))) {
        if (existing) {
            opening.attributes = attrs.filter((attr) => attr !== existing);
        }
        return;
    }
    const numeric = /^-?\d+(\.\d+)?$/.test(value);
    const nextValue =
        value === "true" && /^(disabled|checked|open|required|selected|hidden|loading|invalid|readOnly)$/i.test(name)
            ? null
            : value === "true" || value === "false"
              ? b.jsxExpressionContainer(b.booleanLiteral(value === "true"))
              : numeric
                ? b.jsxExpressionContainer(b.numericLiteral(Number(value)))
                : b.stringLiteral(value);
    const next = b.jsxAttribute(b.jsxIdentifier(name), nextValue);
    if (existing) {
        existing.value = next.value;
        return;
    }
    attrs.push(next);
}

function setElementText(path: { parent?: { node?: unknown } }, text: string) {
    const parent = path.parent?.node;
    if (!n.JSXElement.check(parent)) {
        throw new Error("Text editing is unavailable for this self-closing element.");
    }
    const nested = (parent.children ?? []).some((child) => n.JSXElement.check(child) || n.JSXExpressionContainer.check(child));
    if (nested) {
        throw new Error("This text is generated by nested or dynamic content, so Shape left the code unchanged.");
    }
    parent.children = [b.jsxText(text)];
}

export function patchJsx(source: string, query: JsxLocateQuery, patch: JsxPatch) {
    const ast = parseTsx(source);
    const ranked = collectFromAst(ast, query);
    const best = ranked[0];
    if (!best || best.score < 40) {
        throw new Error("Could not find this element in source.");
    }
    if (ranked[1] && ranked[1].score === best.score && best.score < 70) {
        throw new Error("Multiple matching elements. Select a more specific node.");
    }
    const targetNode = best.node;

    visit(ast, {
        visitJSXOpeningElement(path) {
            if (path.node === targetNode) {
                if (patch.styles && Object.keys(patch.styles).length) setOpeningUtilities(path.node, patch.styles);
                if (patch.attributes) {
                    for (const [name, value] of Object.entries(patch.attributes)) {
                        setOpeningAttr(path.node, name, value);
                    }
                }
                if (patch.text != null) setElementText(path as never, patch.text);
                return false;
            }
            this.traverse(path);
        },
    });

    const next = print(ast).code;
    assertNoNewUnknownDomProps(source, next);
    return next;
}

export function reorderJsx(source: string, moving: JsxLocateQuery, before: JsxLocateQuery | null) {
    const ast = parseTsx(source);
    const moveHit = collectFromAst(ast, moving)[0];
    if (!moveHit || moveHit.score < 40) {
        throw new Error("Could not find the dragged element in source.");
    }
    const beforeHit = before ? collectFromAst(ast, before)[0] : null;
    if (before && (!beforeHit || beforeHit.score < 40)) {
        throw new Error("Could not find the drop target in source.");
    }

    let moved = false;
    visit(ast, {
        visitJSXElement(path) {
            const children = path.node.children;
            if (!children?.length) {
                this.traverse(path);
                return;
            }
            const from = children.findIndex(
                (child) => n.JSXElement.check(child) && child.openingElement === moveHit.node,
            );
            if (from < 0) {
                this.traverse(path);
                return;
            }
            const [node] = children.splice(from, 1);
            let insertAt = children.length;
            if (beforeHit) {
                const at = children.findIndex(
                    (child) => n.JSXElement.check(child) && child.openingElement === beforeHit.node,
                );
                if (at >= 0) insertAt = at;
            }
            children.splice(insertAt, 0, node);
            moved = true;
            return false;
        },
    });
    if (!moved) {
        throw new Error("Those elements are not siblings in source, so Shape could not reorder them.");
    }
    return print(ast).code;
}
