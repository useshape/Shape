import { commands } from "@/lib/backend";
import type { SearchOptions } from "@/lib/backend/types";
import { parseToRgba, rgbaToHex } from "@/features/editor/ui/color-picker/ui/color-utils";
import { patchCssClass, patchCustomProperty, validateCssSource } from "./apply-css";
import {
    canParseJsx,
    jsxClassExpressionKind,
    jsxHasNestedTextOnly,
    locateJsxByHint,
    locateJsxElement,
    locateJsxFromSearchLine,
    validateJsxSource,
} from "./apply-jsx";
import { designLog } from "./log";
import { enrichSourceIdentity, isBundledGeneratedPath } from "./source-identity";
import type { DesignPendingEdit, DesignSourceLoc } from "./types";

const SEARCH_CODE: SearchOptions = {
    case_sensitive: false,
    whole_word: false,
    is_regex: false,
    include_pattern: "*.{tsx,jsx,ts,js,html,vue,svelte}",
    respect_gitignore: true,
    include_hidden: false,
    follow_symlinks: false,
    exclude_tests: true,
    exclude_docs: true,
    exclude_build: true,
    exclude_assets: true,
    only_source: true,
};

const SEARCH_STYLE: SearchOptions = {
    ...SEARCH_CODE,
    include_pattern: "*.{css,scss,sass,less,module.css,module.scss}",
};

const MIN_LOCATE_SCORE = 8;

const WEIGHT: Record<string, string> = {
    "100": "font-thin",
    "200": "font-extralight",
    "300": "font-light",
    "400": "font-normal",
    "500": "font-medium",
    "600": "font-semibold",
    "700": "font-bold",
    "800": "font-extrabold",
    "900": "font-black",
};

export type ApplyEditsResult = {
    files: string[];
    errors: string[];
    appliedIds: string[];
    reverts: { path: string; previous: string }[];
};

export function pendingEditHasWork(edit: DesignPendingEdit): boolean {
    const hasStyles = Object.values(edit.styles).some((v) => v != null && String(v).trim() !== "");
    const hasText = edit.text != null && edit.text !== "";
    const hasClass = !!edit.classToggles && Object.keys(edit.classToggles).length > 0;
    return hasStyles || hasText || hasClass;
}

let applyEpoch = 0;

export function abortDesignApply() {
    applyEpoch += 1;
}

function applyWasAborted(epoch: number) {
    return epoch !== applyEpoch;
}

function rgbToHex(value: string): string | null {
    const raw = value.trim();
    if (/^var\(/i.test(raw) || /^(calc|clamp|min|max)\(/i.test(raw)) return null;
    const parsed = parseToRgba(raw);
    if (parsed) return rgbaToHex(parsed).toLowerCase();
    if (/^#([0-9a-f]{3,8})$/i.test(raw)) return raw.toLowerCase();
    return null;
}

function arb(prefix: string, value: string): string {
    const compact = value.trim().replace(/\s+/g, "_");
    return `${prefix}-[${compact}]`;
}

function pxToken(prefix: string, value: string): string {
    const m = value.trim().match(/^(-?[\d.]+)px$/i);
    if (!m) return arb(prefix, value);
    return `${prefix}-[${m[1]}px]`;
}

export function splitVariantToken(token: string): { variants: string; core: string } {
    let rest = token;
    let variants = "";
    while (rest.length) {
        if (rest.startsWith("[")) {
            const end = rest.indexOf("]:");
            if (end < 0) break;
            variants += rest.slice(0, end + 2);
            rest = rest.slice(end + 2);
            continue;
        }
        const m = rest.match(/^((?:max|min|@)?[a-z0-9/-]+(?:\[[^\]]+\])?:)/i);
        if (!m) break;
        variants += m[1];
        rest = rest.slice(m[1].length);
    }
    return { variants, core: rest };
}

function originOf(edit: DesignPendingEdit, key: string) {
    return edit.inspect?.origins?.[key];
}

function variantPrefixForKey(edit: DesignPendingEdit, key: string): string {
    const cls = originOf(edit, key)?.source.className;
    if (!cls) return "";
    return splitVariantToken(cls).variants;
}

function tokensForEdit(edit: DesignPendingEdit, styles: Record<string, string | undefined>): string[] {
    const out: string[] = [];
    for (const [key, raw] of Object.entries(styles)) {
        if (raw == null || raw === "") continue;
        const tokens = stylesToClassTokens({ [key]: raw });
        const prefix = variantPrefixForKey(edit, key);
        for (const token of tokens) {
            const split = splitVariantToken(token);
            out.push(split.variants ? token : prefix + token);
        }
    }
    return [...new Set(out)];
}

export function stylesToClassTokens(styles: Record<string, string | undefined>): string[] {
    const out: string[] = [];
    const add = (t?: string | null) => {
        if (t) out.push(t);
    };
    for (const [key, raw] of Object.entries(styles)) {
        if (raw == null || raw === "") continue;
        const v = raw.trim();
        switch (key) {
            case "fontSize":
                add(pxToken("text", v));
                break;
            case "fontWeight":
                add(WEIGHT[v] || (/^\d+$/.test(v) ? arb("font", v) : undefined));
                break;
            case "fontFamily": {
                if (/^var\(/.test(v)) {
                    add(arb("font", v));
                    break;
                }
                const first = v.split(",")[0]?.replace(/['"]/g, "").trim();
                if (first) add(`font-['${first.replace(/\s+/g, "_")}']`);
                break;
            }
            case "fontStyle":
                if (v === "italic") add("italic");
                else if (v === "normal") add("not-italic");
                break;
            case "color":
                add(arb("text", rgbToHex(v) || v));
                break;
            case "backgroundColor":
                if (v === "transparent") add("bg-transparent");
                else add(arb("bg", rgbToHex(v) || v));
                break;
            case "backgroundImage":
                if (v === "none") add("bg-none");
                else add(arb("bg", v));
                break;
            case "width":
                add(v === "100%" ? "w-full" : pxToken("w", v));
                break;
            case "height":
                add(v === "100%" ? "h-full" : pxToken("h", v));
                break;
            case "opacity": {
                const n = parseFloat(v);
                if (Number.isFinite(n)) add(`opacity-${Math.round(n > 1 ? n : n * 100)}`);
                break;
            }
            case "borderRadius":
                add(pxToken("rounded", v));
                break;
            case "borderWidth":
                add(pxToken("border", v));
                break;
            case "borderStyle":
                if (v === "none") add("border-0");
                else if (v === "dashed") add("border-dashed");
                else if (v === "dotted") add("border-dotted");
                else add("border-solid");
                break;
            case "borderColor":
                add(arb("border", rgbToHex(v) || v));
                break;
            case "textAlign":
                add(v === "left" || v === "center" || v === "right" || v === "justify" ? `text-${v}` : undefined);
                break;
            case "textDecoration":
                if (v.includes("underline")) add("underline");
                else if (v.includes("line-through")) add("line-through");
                else if (v === "none") add("no-underline");
                break;
            case "display":
                if (v === "flex" || v === "inline-flex" || v === "grid" || v === "block" || v === "hidden") add(v);
                else if (v === "none") add("hidden");
                break;
            case "flexDirection":
                add(v.startsWith("column") ? "flex-col" : "flex-row");
                break;
            case "flexWrap":
                if (v === "wrap") add("flex-wrap");
                else if (v === "nowrap") add("flex-nowrap");
                break;
            case "justifyContent": {
                const map: Record<string, string> = {
                    "flex-start": "justify-start",
                    center: "justify-center",
                    "flex-end": "justify-end",
                    "space-between": "justify-between",
                    "space-around": "justify-around",
                    "space-evenly": "justify-evenly",
                };
                add(map[v]);
                break;
            }
            case "alignItems": {
                const map: Record<string, string> = {
                    "flex-start": "items-start",
                    center: "items-center",
                    "flex-end": "items-end",
                    stretch: "items-stretch",
                    baseline: "items-baseline",
                };
                add(map[v]);
                break;
            }
            case "gap":
                add(pxToken("gap", v));
                break;
            case "columnGap":
                if (styles.gap != null && String(styles.gap).trim() === v) break;
                add(pxToken("gap-x", v));
                break;
            case "rowGap":
                if (styles.gap != null && String(styles.gap).trim() === v) break;
                add(pxToken("gap-y", v));
                break;
            case "paddingTop":
                add(pxToken("pt", v));
                break;
            case "paddingBottom":
                add(pxToken("pb", v));
                break;
            case "paddingLeft":
                add(pxToken("pl", v));
                break;
            case "paddingRight":
                add(pxToken("pr", v));
                break;
            case "marginTop":
                add(pxToken("mt", v));
                break;
            case "marginBottom":
                add(pxToken("mb", v));
                break;
            case "marginLeft":
                add(pxToken("ml", v));
                break;
            case "marginRight":
                add(pxToken("mr", v));
                break;
            case "letterSpacing":
                add(arb("tracking", v));
                break;
            case "lineHeight":
                add(pxToken("leading", v));
                break;
            case "overflow":
                add(`overflow-${v.split(" ")[0]}`);
                break;
            case "position":
                if (["relative", "absolute", "fixed", "sticky", "static"].includes(v)) add(v);
                break;
            case "left":
            case "top":
            case "right":
            case "bottom":
                add(pxToken(key, v));
                break;
            case "boxShadow":
                if (v === "none") add("shadow-none");
                else add(arb("shadow", v));
                break;
            case "filter":
                add(arb("filter", v));
                break;
            case "backdropFilter":
                add(arb("backdrop", v));
                break;
            case "mixBlendMode":
                add(`mix-blend-${v}`);
                break;
            default:
                break;
        }
    }
    return [...new Set(out)];
}

export function stylesToCssDecls(styles: Record<string, string | undefined>): { prop: string; value: string }[] {
    return Object.entries(styles)
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k, v]) => ({
            prop: k.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`),
            value: String(v).trim(),
        }));
}

function conflictGroup(token: string): string | null {
    const { core } = splitVariantToken(token);
    if (/^text-(left|center|right|justify|start|end)$/.test(core)) return "textAlign";
    if (/^text-\[.+px\]$/.test(core) || /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/.test(core)) {
        return "fontSize";
    }
    if (
        /^text-\[#/.test(core) ||
        /^text-\[rgb/.test(core) ||
        /^text-\[hsl/.test(core) ||
        /^text-\[oklch/.test(core) ||
        /^text-\[lab/.test(core) ||
        /^text-\[var\(/.test(core) ||
        /^text-(black|white|current|transparent|inherit)$/.test(core) ||
        /^text-[a-z]+-\d{2,3}$/.test(core)
    ) {
        return "color";
    }
    if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(core) || /^font-\d+$/.test(core)) {
        return "fontWeight";
    }
    if (/^font-\[/.test(core) || /^font-(sans|serif|mono)$/.test(core)) return "fontFamily";
    if (/^bg-gradient-|^from-|^via-|^to-/.test(core) || /^bg-\[linear-|^bg-\[radial-|^bg-\[url\(/.test(core) || core === "bg-none") {
        return "backgroundImage";
    }
    if (
        /^bg-\[/.test(core) ||
        /^bg-(transparent|current|inherit|black|white)$/.test(core) ||
        /^bg-[a-z]+-\d{2,3}$/.test(core)
    ) {
        return "backgroundColor";
    }
    if (/^w-/.test(core)) return "width";
    if (/^h-/.test(core)) return "height";
    if (/^rounded/.test(core)) return "borderRadius";
    if (/^border-(solid|dashed|dotted|double|none|hidden)$/.test(core)) return "borderStyle";
    if (/^border-0$/.test(core) || /^border$/.test(core) || /^border-\d+$/.test(core) || /^border-\[[\d.]+px\]$/.test(core)) {
        return "borderWidth";
    }
    if (/^border-\[#|^border-\[rgb|^border-\[hsl|^border-\[oklch|^border-[a-z]+-\d/.test(core)) return "borderColor";
    if (/^pt-/.test(core)) return "paddingTop";
    if (/^pr-/.test(core)) return "paddingRight";
    if (/^pb-/.test(core)) return "paddingBottom";
    if (/^pl-/.test(core)) return "paddingLeft";
    if (/^px-/.test(core)) return "paddingX";
    if (/^py-/.test(core)) return "paddingY";
    if (/^p-/.test(core)) return "padding";
    if (/^mt-/.test(core)) return "marginTop";
    if (/^mr-/.test(core)) return "marginRight";
    if (/^mb-/.test(core)) return "marginBottom";
    if (/^ml-/.test(core)) return "marginLeft";
    if (/^mx-/.test(core)) return "marginX";
    if (/^my-/.test(core)) return "marginY";
    if (/^m-/.test(core)) return "margin";
    if (/^gap-x-/.test(core)) return "columnGap";
    if (/^gap-y-/.test(core)) return "rowGap";
    if (/^gap-/.test(core)) return "gap";
    if (/^leading-/.test(core)) return "lineHeight";
    if (/^tracking-/.test(core)) return "letterSpacing";
    if (/^opacity-/.test(core)) return "opacity";
    if (/^overflow-/.test(core)) return "overflow";
    if (/^(static|relative|absolute|fixed|sticky)$/.test(core)) return "position";
    if (/^(flex|inline-flex|grid|block|inline-block|hidden|inline)$/.test(core)) return "display";
    if (/^flex-(row|col)/.test(core)) return "flexDirection";
    if (/^flex-(wrap|nowrap)/.test(core)) return "flexWrap";
    if (/^justify-/.test(core)) return "justifyContent";
    if (/^items-/.test(core)) return "alignItems";
    if (/^shadow/.test(core)) return "boxShadow";
    if (/^filter-/.test(core)) return "filter";
    if (/^backdrop-/.test(core)) return "backdropFilter";
    if (/^(top|right|bottom|left)-/.test(core)) return core.split("-")[0]!;
    return null;
}

const PADDING_EXPAND: Record<string, string[]> = {
    padding: ["padding", "paddingX", "paddingY", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
    paddingX: ["padding", "paddingX", "paddingLeft", "paddingRight"],
    paddingY: ["padding", "paddingY", "paddingTop", "paddingBottom"],
    paddingTop: ["padding", "paddingY", "paddingTop"],
    paddingBottom: ["padding", "paddingY", "paddingBottom"],
    paddingLeft: ["padding", "paddingX", "paddingLeft"],
    paddingRight: ["padding", "paddingX", "paddingRight"],
    margin: ["margin", "marginX", "marginY", "marginTop", "marginRight", "marginBottom", "marginLeft"],
    marginX: ["margin", "marginX", "marginLeft", "marginRight"],
    marginY: ["margin", "marginY", "marginTop", "marginBottom"],
    marginTop: ["margin", "marginY", "marginTop"],
    marginBottom: ["margin", "marginY", "marginBottom"],
    marginLeft: ["margin", "marginX", "marginLeft"],
    marginRight: ["margin", "marginX", "marginRight"],
    gap: ["gap"],
};

function groupsConflict(incoming: string, existing: string): boolean {
    if (incoming === existing) return true;
    const expand = PADDING_EXPAND[incoming];
    if (expand?.includes(existing)) return true;
    return false;
}

export function mergeClassTokens(existing: string[], incoming: string[], contextVariants = ""): string[] {
    const incomingWithVar = incoming.map((t) => {
        const s = splitVariantToken(t);
        return s.variants ? t : contextVariants + t;
    });
    const strip = new Set<string>();
    for (const token of incomingWithVar) {
        const { variants, core } = splitVariantToken(token);
        const group = conflictGroup(core);
        if (!group) continue;
        for (const e of existing) {
            const es = splitVariantToken(e);
            if (es.variants !== variants) continue;
            const eg = conflictGroup(es.core);
            if (eg && groupsConflict(group, eg)) strip.add(e);
        }
    }
    return [...existing.filter((e) => e && !strip.has(e)), ...incomingWithVar.filter(Boolean)];
}

function insertClassesIntoLiteral(literal: string, tokens: string[], contextVariants = ""): string {
    const quote = literal[0]!;
    const inner = literal.slice(1, -1);
    const merged = mergeClassTokens(inner.split(/\s+/).filter(Boolean), tokens, contextVariants);
    return `${quote}${merged.join(" ")}${quote}`;
}

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

export function patchOpeningTag(tagText: string, tokens: string[], preferHtmlClass = false, contextVariants = ""): string {
    if (!tokens.length) return tagText;
    const kind = jsxClassExpressionKind(tagText);
    if (kind === "module" || kind === "spread" || kind === "template") return tagText;
    const classAttr = preferHtmlClass ? "class" : "className";
    const htmlClass = /\bclass\s*=/.test(tagText);
    const attr = htmlClass ? "class" : /\bclassName\s*=/.test(tagText) ? "className" : classAttr;

    const stringAttr = new RegExp(`(\\b${attr}\\s*=\\s*)(["'\`][^"'\`]*["'\`])`);
    const exprString = new RegExp(`(\\b${attr}\\s*=\\s*\\{\\s*)(["'\`][^"'\`]*["'\`])(\\s*\\})`);
    const cnCall = new RegExp(`(\\b${attr}\\s*=\\s*\\{\\s*(?:cn|clsx|classNames|twMerge)\\(\\s*)(["'\`][^"'\`]*["'\`])`);

    if (cnCall.test(tagText)) {
        return tagText.replace(cnCall, (_, prefix: string, lit: string) => `${prefix}${insertClassesIntoLiteral(lit, tokens, contextVariants)}`);
    }
    if (exprString.test(tagText)) {
        return tagText.replace(
            exprString,
            (_, prefix: string, lit: string, suffix: string) => `${prefix}${insertClassesIntoLiteral(lit, tokens, contextVariants)}${suffix}`,
        );
    }
    if (stringAttr.test(tagText)) {
        return tagText.replace(stringAttr, (_, prefix: string, lit: string) => `${prefix}${insertClassesIntoLiteral(lit, tokens, contextVariants)}`);
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
    const ident = tagText.match(/(\bstyle\s*=\s*\{)([A-Za-z_$][\w$]*)(\})/);
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

function pickBestOpening(source: string, tag: string, edit: DesignPendingEdit): OpeningTagHit | null {
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

async function projectUsesTailwind(projectPath: string): Promise<boolean> {
    try {
        const pkg = await commands.readFile(join(projectPath, "package.json"));
        if (typeof pkg === "string" && pkg.includes("tailwindcss")) return true;
    } catch {
        /* ignore */
    }
    return false;
}

function looksLikeTailwind(className: string, tagText: string): boolean {
    const s = `${className} ${tagText}`;
    return /\b(flex|grid|hidden|block|inline-flex|px-\d|py-\d|p-\d|mt-\d|text-(?:sm|lg|xl|\[)|bg-(?:\[|#)|rounded|items-|justify-|w-\[|h-\[)\b/.test(
        s,
    );
}

export function patchTextChild(source: string, tagStart: number, tagEnd: number, tag: string, text: string): string {
    const after = source.slice(tagEnd);
    const close = new RegExp(`^(\\s*)([^<]*)(<\\/${tag}\\s*>)`, "i");
    const m = after.match(close);
    if (!m) return source;
    return source.slice(0, tagEnd) + m[1] + text + m[3] + after.slice(m[0].length);
}

function join(root: string, rel: string) {
    const slash = root.includes("\\") ? "\\" : "/";
    return `${root.replace(/[\\/]$/, "")}${slash}${rel.replaceAll("/", slash)}`;
}

function dirname(path: string) {
    return path.replace(/[/\\][^/\\]+$/, "");
}

function resolveRelative(fromFile: string, rel: string) {
    const slash = fromFile.includes("\\") ? "\\" : "/";
    const parts = dirname(fromFile).split(/[/\\]/);
    for (const seg of rel.replace(/^\.\//, "").split("/")) {
        if (seg === "..") parts.pop();
        else if (seg && seg !== ".") parts.push(seg);
    }
    return parts.join(slash);
}

export function resolveSourcePath(projectPath: string, loc: DesignSourceLoc): string[] {
    if (isBundledGeneratedPath(loc.fileName)) return [];
    let name = loc.fileName
        .replace(/^https?:\/\/[^/]+/, "")
        .replace(/^webpack-internal:\/\/\//, "")
        .replace(/^webpack:\/\/[^/]+\//, "")
        .replace(/^file:\/\//, "")
        .replace(/^\/_N_E\//, "")
        .replace(/^\.\//, "");
    try {
        name = decodeURIComponent(name);
    } catch {
        /* ignore */
    }
    const candidates = [name];
    if (!name.toLowerCase().startsWith(projectPath.toLowerCase())) {
        const rel = name.replace(/^[/\\]+/, "");
        candidates.push(join(projectPath, rel));
        const idx = rel.toLowerCase().lastIndexOf("/src/");
        const win = rel.toLowerCase().lastIndexOf("\\src\\");
        const cut = Math.max(idx, win);
        if (cut >= 0) candidates.push(join(projectPath, rel.slice(cut + 1)));
        const base = rel.split(/[/\\]/).slice(-4).join("/");
        candidates.push(join(projectPath, base));
        const file = rel.split(/[/\\]/).pop();
        if (file) {
            candidates.push(join(projectPath, "src/" + file));
            candidates.push(join(projectPath, "app/" + file));
        }
    }
    return [...new Set(candidates)];
}

async function readLatest(path: string): Promise<string | null> {
    try {
        let dirty: string | undefined;
        try {
            const { loadDirtyBuffer } = await import("@/lib/dirty-buffers");
            dirty = loadDirtyBuffer(path)?.content;
        } catch {
            /* tests */
        }
        commands.invalidateFileCache(path);
        const disk = await commands.readFile(path);
        if (typeof disk !== "string") return dirty ?? null;
        if (dirty && dirty !== disk) return dirty;
        return disk;
    } catch {
        return null;
    }
}

async function readFirst(paths: string[]): Promise<{ path: string; content: string } | null> {
    for (const path of paths) {
        const content = await readLatest(path);
        if (content != null) return { path, content };
    }
    return null;
}

async function persistWrite(path: string, expected: string): Promise<string | null> {
    await commands.saveFile(path, expected);
    commands.invalidateFileCache(path);
    let disk: string;
    try {
        disk = await commands.readFile(path);
    } catch (err) {
        return err instanceof Error ? err.message : "Could not re-read file after save.";
    }
    if (disk.replace(/\r\n/g, "\n") !== expected.replace(/\r\n/g, "\n")) {
        return "Saved file does not match the patch. The write did not persist.";
    }
    try {
        const { emit } = await import("@tauri-apps/api/event");
        await emit("shape-file-edited", path);
    } catch {
        /* not running under Tauri */
    }
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("shape-file-edited"));
    }
    try {
        const { clearDirtyBuffer } = await import("@/lib/dirty-buffers");
        clearDirtyBuffer(path);
    } catch {
        /* ignore */
    }
    return null;
}

export async function revertSourceWrites(entries: { path: string; previous: string }[]): Promise<string | null> {
    for (const entry of entries) {
        const err = await persistWrite(entry.path, entry.previous);
        if (err) return err;
    }
    return null;
}

function evidenceIn(haystack: string, needles: string[]): string | null {
    for (const n of needles) {
        if (n && !haystack.includes(n)) return n;
    }
    return null;
}

function moduleImportPath(source: string, ident: string): string | null {
    const re = new RegExp(
        `import\\s+${ident}\\s+from\\s+['"]([^'"]+\\.(?:module\\.)?(?:css|scss|sass|less))['"]`,
    );
    return source.match(re)?.[1] ?? null;
}

async function patchCssFile(
    cssPath: string,
    selector: string,
    styles: Record<string, string | undefined>,
    writes: Map<string, string>,
    media?: string,
    layer?: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    const content = writes.get(cssPath) ?? (await readLatest(cssPath));
    if (content == null) return { ok: false, error: `Couldn't read ${cssPath}` };
    const decls = stylesToCssDecls(styles);
    if (!decls.length) return { ok: false, error: "No CSS declarations to write." };
    const result = patchCssClass(content, selector, decls, { media, layer });
    if ("error" in result) return { ok: false, error: result.error };
    const parseErr = validateCssSource(result.css);
    if (parseErr) return { ok: false, error: parseErr };
    writes.set(cssPath, result.css);
    return { ok: true, path: cssPath };
}

function componentRootLine(content: string, name?: string): number | undefined {
    if (!name) return undefined;
    const re = new RegExp(`(?:export\\s+)?(?:default\\s+)?(?:function|const|class)\\s+${name}\\b`, "m");
    const m = content.match(re);
    if (!m || m.index == null) return undefined;
    const from = content.slice(m.index, m.index + 2500);
    const ret = from.search(/return\s*\(\s*\n?\s*</);
    if (ret < 0) return undefined;
    const upto = content.slice(0, m.index + ret);
    return upto.split("\n").length;
}

function isHtmlLike(path: string) {
    return /\.(html|vue|svelte)$/i.test(path);
}

type PatchAttempt = { content: string; evidence: string[]; cssPath?: string };

function attemptClassPatch(
    content: string,
    hit: OpeningTagHit,
    tokens: string[],
    html: boolean,
    contextVariants = "",
): PatchAttempt | null {
    if (!tokens.length) return null;
    const patched = patchOpeningTag(hit.text, tokens, html, contextVariants);
    if (patched === hit.text) return null;
    const next = content.slice(0, hit.start) + patched + content.slice(hit.end);
    return { content: next, evidence: tokens };
}

function attemptInlinePatch(
    content: string,
    hit: OpeningTagHit,
    styles: Record<string, string | undefined>,
    html: boolean,
): PatchAttempt | null {
    const patched = patchInlineStyles(hit.text, styles, html);
    if (patched === hit.text) return null;
    const decls = stylesToCssDecls(styles);
    const next = content.slice(0, hit.start) + patched + content.slice(hit.end);
    const needles = html
        ? decls.map((d) => `${d.prop}: ${d.value}`)
        : decls.map((d) => JSON.stringify(d.value)).filter((v) => v.length > 2);
    const missing = evidenceIn(patched, needles.slice(0, 3));
    if (missing) return null;
    return { content: next, evidence: needles };
}

function cssModuleBinding(tagText: string): { ident: string; local: string } | null {
    const m =
        tagText.match(/\b(?:className|class)\s*=\s*\{\s*([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/) ||
        tagText.match(/\b(?:className|class)\s*=\s*\{\s*([A-Za-z_$][\w$]*)\[['"]([^'"]+)['"]\]/);
    if (!m) return null;
    return { ident: m[1]!, local: m[2]! };
}

function plainClassNames(tagText: string): string[] {
    const m = tagText.match(/\b(?:className|class)\s*=\s*(?:\{\s*)?["'`]([^"'`]+)["'`]/);
    if (!m?.[1]) return [];
    return m[1].split(/\s+/).filter((c) => c && !c.includes("[") && !/^(flex|grid|block|hidden|relative|absolute)$/.test(c));
}

function splitVarAndPlain(edit: DesignPendingEdit): {
    plain: Record<string, string | undefined>;
    variables: { key: string; name: string; value: string }[];
} {
    const plain: Record<string, string | undefined> = {};
    const variables: { key: string; name: string; value: string }[] = [];
    for (const [key, raw] of Object.entries(edit.styles)) {
        if (raw == null || !String(raw).trim()) continue;
        const origin = edit.inspect?.origins?.[key];
        const authored = origin?.authored?.trim() ?? "";
        if (authored.startsWith("var(") && !String(raw).trim().startsWith("var(")) {
            const name = authored.match(/var\((--[\w-]+)/)?.[1];
            if (name) {
                variables.push({ key, name, value: String(raw).trim() });
                continue;
            }
        }
        plain[key] = String(raw);
    }
    return { plain, variables };
}

function toOpeningHit(hit: { start: number; end: number; text: string; line: number; column: number }): OpeningTagHit {
    return { start: hit.start, end: hit.end, text: hit.text, line: hit.line, column: hit.column };
}

function locateHit(
    current: string,
    path: string,
    tag: string,
    edit: DesignPendingEdit,
): { hit: OpeningTagHit } | { error: string } {
    const authoredLine = edit.source?.mapped === false ? undefined : edit.source?.lineNumber;
    const hint = {
        className: edit.className,
        tag,
        locateText: edit.locateText || edit.text,
        lineNumber: authoredLine,
    };
    if (canParseJsx(path)) {
        if (authoredLine) {
            const byLoc = locateJsxElement(current, path, { lineNumber: authoredLine, columnNumber: edit.source?.columnNumber });
            if (byLoc.ok) return { hit: toOpeningHit(byLoc.hit) };
        }
        const byHint = locateJsxByHint(current, path, hint);
        if (byHint.ok) return { hit: toOpeningHit(byHint.hit) };
        if (authoredLine) {
            const fromLine = locateJsxFromSearchLine(current, path, authoredLine);
            if (fromLine.ok) return { hit: toOpeningHit(fromLine.hit) };
        }
        return { error: byHint.error };
    }
    const hit = pickBestOpening(current, tag, edit);
    if (!hit) {
        return {
            error: `Cannot safely match <${tag}> in ${path.split(/[/\\]/).pop()}.`,
        };
    }
    return { hit };
}

async function resolveCandidateFiles(
    projectPath: string,
    edit: DesignPendingEdit,
    knownFiles: Map<string, string>,
): Promise<{ path: string; content: string; line?: number }[]> {
    const out: { path: string; content: string; line?: number }[] = [];
    const seen = new Set<string>();
    const add = (item: { path: string; content: string; line?: number } | null) => {
        if (!item) return;
        const key = item.path.replace(/\\/g, "/").toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(item);
    };

    const identity = edit.source;
    if (identity && !isBundledGeneratedPath(identity.fileName)) {
        const file = await readFirst(resolveSourcePath(projectPath, identity));
        add(file ? { ...file, line: identity.mapped === false ? undefined : identity.lineNumber } : null);
    }
    for (const [path, content] of knownFiles) {
        add({ path, content });
    }
    return out;
}

async function applyOne(
    projectPath: string,
    edit: DesignPendingEdit,
    scope: "element" | "component",
    tailwind: boolean,
    writes: Map<string, string>,
): Promise<{ paths: string[] } | { error: string }> {
    const { plain, variables } = splitVarAndPlain(edit);
    const tag = (edit.tag || edit.label.split(/[.#]/)[0] || "div").toLowerCase();
    edit = { ...edit, source: enrichSourceIdentity(edit.source) };

    const candidates = await resolveCandidateFiles(projectPath, edit, writes);
    if (!candidates.length) {
        designLog("ERROR", "no candidate file", {
            tag,
            label: edit.label,
            className: edit.className,
            source: edit.source ?? null,
        });
        return { error: `Couldn't find <${tag}> in the project source.` };
    }

    let located: { path: string; content: string; line?: number } | null = null;
    let hit: OpeningTagHit | null = null;
    let lastLocate = "";
    for (const cand of candidates) {
        const content = writes.get(cand.path) ?? cand.content;
        const scoped =
            scope === "component" && edit.source?.componentName
                ? {
                      ...edit,
                      source: {
                          ...edit.source,
                          lineNumber: componentRootLine(content, edit.source.componentName) ?? edit.source.lineNumber,
                      },
                  }
                : edit;
        const locatedHit = locateHit(content, cand.path, tag, scoped);
        if ("error" in locatedHit) {
            lastLocate = locatedHit.error;
            designLog("WARN", "locate missed", { path: cand.path.split(/[/\\]/).pop(), error: locatedHit.error });
            continue;
        }
        located = { ...cand, content };
        hit = locatedHit.hit;
        break;
    }
    if (!located || !hit) {
        designLog("ERROR", "locate failed", { tag, errors: lastLocate, files: candidates.map((c) => c.path.split(/[/\\]/).pop()) });
        return { error: lastLocate || `Couldn't find <${tag}> in the project source.` };
    }

    const current = writes.get(located.path) ?? located.content;
    const html = isHtmlLike(located.path);
    const scopedEdit = edit;
    const useTailwind = tailwind || looksLikeTailwind(edit.className || "", hit.text);
    const moduleBind = cssModuleBinding(hit.text);
    const hashedLocals = (edit.className || "")
        .split(/\s+/)
        .map(cssModuleLocal)
        .filter((x): x is string => !!x);
    const preferCss = !!moduleBind || hashedLocals.length > 0;

    const cssStyles: Record<string, string | undefined> = {};
    const twStyles: Record<string, string | undefined> = {};
    const inlineOnly: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(plain)) {
        const kind = originOf(edit, key)?.source.kind;
        if (kind === "module" || kind === "stylesheet") cssStyles[key] = value;
        else if (kind === "inline") inlineOnly[key] = value;
        else if (kind === "utility" || kind === "class") twStyles[key] = value;
        else if (preferCss) cssStyles[key] = value;
        else if (useTailwind) twStyles[key] = value;
        else inlineOnly[key] = value;
    }

    const mediaFor = (styles: Record<string, string | undefined>) => {
        for (const key of Object.keys(styles)) {
            const media = originOf(edit, key)?.source.media;
            if (media) return media;
        }
        return undefined;
    };
    const layerFor = (styles: Record<string, string | undefined>) => {
        for (const key of Object.keys(styles)) {
            const layer = originOf(edit, key)?.source.layer;
            if (layer) return layer;
        }
        return undefined;
    };

    designLog("INFO", "identity", {
        runtime: edit.id,
        generated: edit.source?.generated ?? null,
        file: located.path.split(/[/\\]/).pop(),
        ast: { line: hit.line, column: hit.column, tag: hit.text.match(/^<\s*\/?\s*([A-Za-z][\w.]*)/)?.[1] },
        owner: {
            css: Object.keys(cssStyles),
            tailwind: Object.keys(twStyles),
            inline: Object.keys(inlineOnly),
        },
        tokens: tokensForEdit(edit, twStyles),
    });

    const originMedia = mediaFor(cssStyles);
    const originLayer = layerFor(cssStyles);

    const touched = new Set<string>();

    const tryCss = async (
        local: string,
        ident: string | undefined,
        styles: Record<string, string | undefined>,
    ): Promise<PatchAttempt | null> => {
        if (!Object.keys(styles).length) return null;
        const cssRel: string | null = ident ? moduleImportPath(current, ident) : null;
        if (cssRel) {
            const cssPath = resolveRelative(located!.path, cssRel);
            const result = await patchCssFile(cssPath, local, styles, writes, originMedia, originLayer);
            if (result.ok) {
                designLog("INFO", "patched CSS module", { cssPath: cssPath.split(/[/\\]/).pop(), local, keys: Object.keys(styles) });
                touched.add(result.path);
                return { content: current, evidence: [`${local}`], cssPath };
            }
            designLog("WARN", "CSS module patch failed", { local, cssPath: cssPath.split(/[/\\]/).pop() });
            return null;
        }
        try {
            const hits = await commands.searchContent(`.${local}`, SEARCH_STYLE);
            const inProject = hits.filter((h) => h.path.toLowerCase().startsWith(projectPath.toLowerCase()));
            for (const h of inProject) {
                const result = await patchCssFile(h.path, local, styles, writes, originMedia, originLayer);
                if (result.ok) {
                    designLog("INFO", "patched stylesheet", { cssPath: h.path.split(/[/\\]/).pop(), local, keys: Object.keys(styles) });
                    touched.add(result.path);
                    return { content: current, evidence: [local], cssPath: h.path };
                }
            }
        } catch (err) {
            designLog("WARN", "CSS search failed", { local, error: err instanceof Error ? err.message : String(err) });
        }
        return null;
    };

    for (const variable of variables) {
        const href = edit.inspect?.origins?.[variable.key]?.source.href;
        let patched = false;
        if (href && href !== "(inline)") {
            try {
                const hits = await commands.searchContent(variable.name, SEARCH_STYLE);
                for (const h of hits.filter((x) => x.path.toLowerCase().startsWith(projectPath.toLowerCase()))) {
                    const css = writes.get(h.path) ?? (await readLatest(h.path));
                    if (css == null) continue;
                    const next = patchCustomProperty(css, variable.name, variable.value);
                    if ("css" in next) {
                        const err = validateCssSource(next.css);
                        if (err) continue;
                        writes.set(h.path, next.css);
                        touched.add(h.path);
                        patched = true;
                        break;
                    }
                }
            } catch {
                /* ignore */
            }
        }
        if (!patched) {
            return {
                error: `${variable.key} comes from ${variable.name}; refusing to replace it with a computed value.`,
            };
        }
    }

    let appliedCss: PatchAttempt | null = null;
    let mutated = touched.size > 0;
    const cssLocals = [
        moduleBind ? { local: moduleBind.local, ident: moduleBind.ident } : null,
        ...hashedLocals.map((local) => ({ local, ident: moduleBind?.ident })),
        ...plainClassNames(hit.text).map((local) => ({ local, ident: undefined as string | undefined })),
    ].filter((x): x is { local: string; ident: string | undefined } => !!x);

    if (Object.keys(cssStyles).length) {
        for (const { local, ident } of cssLocals) {
            const cssPatch = await tryCss(local, ident, cssStyles);
            if (cssPatch?.cssPath) {
                appliedCss = cssPatch;
                mutated = true;
                break;
            }
        }
        if (!appliedCss?.cssPath) {
            designLog("WARN", "CSS owner missed; falling back to Tailwind/inline", { keys: Object.keys(cssStyles) });
            for (const [k, v] of Object.entries(cssStyles)) twStyles[k] = v;
        }
    }

    let next = current;
    const twTokens = tokensForEdit(edit, twStyles);

    if (twTokens.length) {
        const classPatch = attemptClassPatch(next, hit, twTokens, html, "");
        if (classPatch) {
            designLog("INFO", "patched className", { tokens: twTokens });
            next = classPatch.content;
            mutated = true;
        } else {
            designLog("WARN", "className patch made no change", { tokens: twTokens, kind: jsxClassExpressionKind(hit.text) });
            for (const [k, v] of Object.entries(twStyles)) {
                if (inlineOnly[k] == null) inlineOnly[k] = v;
            }
        }
    }

    if (edit.classToggles && Object.keys(edit.classToggles).length) {
        const add = Object.entries(edit.classToggles)
            .filter(([, on]) => on)
            .map(([name]) => name);
        const remove = new Set(
            Object.entries(edit.classToggles)
                .filter(([, on]) => !on)
                .map(([name]) => name),
        );
        const again = locateHit(next, located.path, tag, scopedEdit);
        if ("hit" in again) {
            let patched = again.hit.text;
            if (add.length) patched = patchOpeningTag(patched, add, html);
            if (remove.size) {
                patched = patched.replace(/((?:className|class)\s*=\s*(?:\{\s*)?)(["'`])([^"'`]*)\2/, (full, pre, q, inner) => {
                    const kept = inner.split(/\s+/).filter((c: string) => c && !remove.has(c));
                    return `${pre}${q}${kept.join(" ")}${q}`;
                });
            }
            if (patched !== again.hit.text) {
                next = next.slice(0, again.hit.start) + patched + next.slice(again.hit.end);
                mutated = true;
            }
        }
    }

    if (Object.keys(inlineOnly).length) {
        const again = locateHit(next, located.path, tag, scopedEdit);
        const inlineHit = "hit" in again ? again.hit : hit;
        const inlinePatch = attemptInlinePatch(next, inlineHit, inlineOnly, html);
        if (inlinePatch) {
            designLog("INFO", "patched inline style", { keys: Object.keys(inlineOnly) });
            next = inlinePatch.content;
            mutated = true;
        } else {
            designLog("WARN", "inline style patch made no change", { keys: Object.keys(inlineOnly) });
        }
    }

    if (edit.text != null && edit.text !== "") {
        const again = locateHit(next, located.path, tag, scopedEdit);
        if ("hit" in again) {
            if (!jsxHasNestedTextOnly(next, again.hit.end, tag) && !html) {
                return { error: `Cannot safely edit text of <${tag}>; it is not a plain text child.` };
            }
            const withText = patchTextChild(next, again.hit.start, again.hit.end, tag, edit.text);
            if (withText !== next) {
                next = withText;
                mutated = true;
            }
        }
    }

    if (!mutated) {
        designLog("WARN", "no source mutation", { tag, keys: Object.keys(plain) });
        return {
            error: `No source change for <${tag}>. Styles may be computed or owned by a parent/theme.`,
        };
    }

    if (next !== current) {
        const parseErr = canParseJsx(located.path) ? validateJsxSource(located.path, next) : null;
        if (parseErr) return { error: `Patch would not parse: ${parseErr}` };
        writes.set(located.path, next);
        touched.add(located.path);
    }

    return { paths: [...touched] };
}

function validateStaged(path: string, content: string): string | null {
    if (canParseJsx(path)) return validateJsxSource(path, content);
    if (/\.(css|scss|sass|less)$/i.test(path)) return validateCssSource(content);
    return null;
}

export async function applyEditsToProject(
    projectPath: string,
    edits: DesignPendingEdit[],
    scope: "element" | "component",
): Promise<ApplyEditsResult> {
    const epoch = applyEpoch;
    const errors: string[] = [];
    const plannedIds: string[] = [];
    const writes = new Map<string, string>();
    const originals = new Map<string, string>();
    const tailwind = await projectUsesTailwind(projectPath);
    if (applyWasAborted(epoch)) {
        return { files: [], errors: ["Apply cancelled."], appliedIds: [], reverts: [] };
    }

    const work = edits.filter(pendingEditHasWork);

    const remember = async (path: string) => {
        if (originals.has(path)) return;
        const current = await readLatest(path);
        if (current != null) originals.set(path, current);
    };

    for (const edit of work) {
        if (applyWasAborted(epoch)) {
            return { files: [], errors: ["Apply cancelled."], appliedIds: [], reverts: [] };
        }
        const before = new Map(writes);
        const result = await applyOne(projectPath, edit, scope, tailwind, writes);
        if ("error" in result) {
            for (const [k] of writes) {
                if (!before.has(k)) writes.delete(k);
            }
            for (const [k, v] of before) writes.set(k, v);
            errors.push(`${edit.label}: ${result.error}`);
            continue;
        }
        for (const path of result.paths) await remember(path);
        plannedIds.push(edit.id);
    }

    if (!writes.size) {
        designLog("WARN", "apply batch wrote nothing", { errors });
        return { files: [], errors, appliedIds: [], reverts: [] };
    }

    for (const [path, content] of writes) {
        const err = validateStaged(path, content);
        if (err) {
            return { files: [], errors: [...errors, `${path.split(/[/\\]/).pop()}: ${err}`], appliedIds: [], reverts: [] };
        }
    }

    const persisted: string[] = [];
    try {
        for (const [path, content] of writes) {
            const persist = await persistWrite(path, content);
            if (persist) throw new Error(`${path.split(/[/\\]/).pop()}: ${persist}`);
            persisted.push(path);
        }
    } catch (e) {
        for (const path of persisted) {
            const orig = originals.get(path);
            if (orig != null) await persistWrite(path, orig);
        }
        return {
            files: [],
            errors: [...errors, e instanceof Error ? e.message : String(e)],
            appliedIds: [],
            reverts: [],
        };
    }

    const reverts = persisted
        .map((path) => {
            const previous = originals.get(path);
            return previous != null ? { path, previous } : null;
        })
        .filter((x): x is { path: string; previous: string } => !!x);
    designLog("INFO", "apply committed", {
        files: persisted.map((p) => p.split(/[/\\]/).pop()),
        appliedIds: plannedIds,
        errors,
    });
    return { files: persisted, errors, appliedIds: plannedIds, reverts };
}
