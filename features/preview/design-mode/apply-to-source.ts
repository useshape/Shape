import { commands } from "@/lib/backend";
import type { SearchOptions } from "@/lib/backend/types";
import type { DesignPendingEdit, DesignSourceLoc } from "./types";

const SEARCH: SearchOptions = {
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

function rgbToHex(value: string): string | null {
    const m = value.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) {
        const hex = value.trim();
        if (/^#([0-9a-f]{3,8})$/i.test(hex)) return hex.toLowerCase();
        return null;
    }
    const h = (n: string) => Number(n).toString(16).padStart(2, "0");
    return `#${h(m[1]!)}${h(m[2]!)}${h(m[3]!)}`;
}

function arb(prefix: string, value: string): string {
    const compact = value.trim().replace(/\s+/g, "_");
    return `${prefix}-[${compact}]`;
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
                add(v.endsWith("px") ? `text-[${parseInt(v, 10)}px]` : arb("text", v));
                break;
            case "fontWeight":
                add(WEIGHT[v] || arb("font", v));
                break;
            case "fontFamily": {
                const first = v.split(",")[0]?.replace(/['"]/g, "").trim();
                if (first) add(`font-[${first.replace(/\s+/g, "_")}]`);
                break;
            }
            case "color":
                add(arb("text", rgbToHex(v) || v));
                break;
            case "backgroundColor":
                if (v === "transparent") add("bg-transparent");
                else add(arb("bg", rgbToHex(v) || v));
                break;
            case "width":
                add(v === "100%" ? "w-full" : v.endsWith("px") ? `w-[${parseInt(v, 10)}px]` : arb("w", v));
                break;
            case "height":
                add(v === "100%" ? "h-full" : v.endsWith("px") ? `h-[${parseInt(v, 10)}px]` : arb("h", v));
                break;
            case "opacity": {
                const n = parseFloat(v);
                if (Number.isFinite(n)) add(`opacity-${Math.round((n > 1 ? n : n * 100))}`);
                break;
            }
            case "borderRadius":
                add(v.endsWith("px") ? `rounded-[${parseInt(v, 10)}px]` : arb("rounded", v));
                break;
            case "borderWidth":
                add(v.endsWith("px") ? `border-[${parseInt(v, 10)}px]` : "border");
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
            case "display":
                if (v === "flex" || v === "inline-flex" || v === "grid" || v === "block" || v === "hidden") add(v);
                else if (v === "none") add("hidden");
                break;
            case "flexDirection":
                add(v.startsWith("column") ? "flex-col" : "flex-row");
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
            case "columnGap":
            case "rowGap":
                add(v.endsWith("px") ? `gap-[${parseInt(v, 10)}px]` : arb("gap", v));
                break;
            case "paddingTop":
            case "paddingBottom":
            case "paddingLeft":
            case "paddingRight": {
                const side = key.replace("padding", "").slice(0, 1).toLowerCase();
                add(v.endsWith("px") ? `p${side}-[${parseInt(v, 10)}px]` : arb(`p${side}`, v));
                break;
            }
            case "letterSpacing":
                add(arb("tracking", v));
                break;
            case "lineHeight":
                add(v.endsWith("px") ? `leading-[${parseInt(v, 10)}px]` : arb("leading", v));
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
                add(v.endsWith("px") ? `${key}-[${parseInt(v, 10)}px]` : arb(key, v));
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

const OPEN_TAG = (tag: string) =>
    new RegExp(`<${tag}\\b(?:[^>"'\`/]|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`)*?>`, "i");

export function findOpeningTag(
    source: string,
    tag: string,
    lineNumber?: number,
): { start: number; end: number; text: string } | null {
    const re = OPEN_TAG(tag);
    if (lineNumber && lineNumber > 0) {
        const lines = source.split("\n");
        let offset = 0;
        for (let i = 0; i < Math.min(lines.length, lineNumber - 1); i++) offset += lines[i]!.length + 1;
        const windowStart = Math.max(0, offset - 400);
        const slice = source.slice(windowStart, offset + 800);
        re.lastIndex = 0;
        const m = re.exec(slice);
        if (m && m.index != null) {
            const start = windowStart + m.index;
            return { start, end: start + m[0].length, text: m[0] };
        }
    }
    re.lastIndex = 0;
    const m = re.exec(source);
    if (!m || m.index == null) return null;
    return { start: m.index, end: m.index + m[0].length, text: m[0] };
}

function insertClassesIntoLiteral(literal: string, tokens: string[]): string {
    const quote = literal[0]!;
    const inner = literal.slice(1, -1);
    const existing = new Set(inner.split(/\s+/).filter(Boolean));
    for (const t of tokens) existing.add(t);
    return `${quote}${[...existing].join(" ")}${quote}`;
}

export function patchOpeningTag(
    tagText: string,
    tokens: string[],
    preferHtmlClass = false,
): string {
    if (!tokens.length) return tagText;
    const classAttr = preferHtmlClass ? "class" : "className";
    const htmlClass = /\bclass\s*=/.test(tagText);
    const attr = htmlClass ? "class" : /\bclassName\s*=/.test(tagText) ? "className" : classAttr;

    const stringAttr = new RegExp(`(\\b${attr}\\s*=\\s*)(["'\`][^"'\`]*["'\`])`);
    const exprString = new RegExp(`(\\b${attr}\\s*=\\s*\\{\\s*)(["'\`][^"'\`]*["'\`])(\\s*\\})`);
    const cnCall = new RegExp(`(\\b${attr}\\s*=\\s*\\{\\s*(?:cn|clsx|classNames|twMerge)\\(\\s*)(["'\`][^"'\`]*["'\`])`);

    if (cnCall.test(tagText)) {
        return tagText.replace(cnCall, (_, prefix: string, lit: string) => `${prefix}${insertClassesIntoLiteral(lit, tokens)}`);
    }
    if (exprString.test(tagText)) {
        return tagText.replace(exprString, (_, prefix: string, lit: string, suffix: string) => `${prefix}${insertClassesIntoLiteral(lit, tokens)}${suffix}`);
    }
    if (stringAttr.test(tagText)) {
        return tagText.replace(stringAttr, (_, prefix: string, lit: string) => `${prefix}${insertClassesIntoLiteral(lit, tokens)}`);
    }

    const exprAttr = new RegExp(`(\\b${attr}\\s*=\\s*\\{)([^}]+)(\\})`);
    if (exprAttr.test(tagText)) {
        return tagText.replace(
            exprAttr,
            (_, a: string, expr: string, b: string) => `${a}\`\${${expr.trim()}} ${tokens.join(" ")}\`${b}`,
        );
    }

    const insert = ` ${attr}="${tokens.join(" ")}"`;
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

function join(root: string, rel: string) {
    const slash = root.includes("\\") ? "\\" : "/";
    return `${root.replace(/[\\/]$/, "")}${slash}${rel.replaceAll("/", slash)}`;
}

export function resolveSourcePath(projectPath: string, loc: DesignSourceLoc): string[] {
    let name = loc.fileName
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
    if (!name.startsWith(projectPath)) {
        const rel = name.replace(/^[/\\]+/, "");
        candidates.push(join(projectPath, rel));
        const idx = rel.toLowerCase().lastIndexOf("/src/");
        const win = rel.toLowerCase().lastIndexOf("\\src\\");
        const cut = Math.max(idx, win);
        if (cut >= 0) candidates.push(join(projectPath, rel.slice(cut + 1)));
        const base = rel.split(/[/\\]/).slice(-4).join("/");
        candidates.push(join(projectPath, base));
        candidates.push(join(projectPath, "src/" + rel.split(/[/\\]/).pop()));
    }
    return [...new Set(candidates)];
}

async function readFirst(paths: string[]): Promise<{ path: string; content: string } | null> {
    for (const path of paths) {
        try {
            const content = await commands.readFile(path);
            if (typeof content === "string") return { path, content };
        } catch {
            /* next */
        }
    }
    return null;
}

async function findBySearch(
    projectPath: string,
    edit: DesignPendingEdit,
): Promise<{ path: string; content: string; line?: number } | null> {
    const needles: string[] = [];
    const text = edit.text?.trim();
    if (text && text.length >= 2 && text.length < 80) needles.push(text);
    const classes = (edit.className || "")
        .split(/\s+/)
        .filter((c) => c.length > 2 && !c.startsWith("shape-") && !/^[a-z]+_/.test(c) && c.length < 40);
    if (classes[0]) needles.push(classes[0]);
    const tag = edit.tag || edit.label.split(/[.#]/)[0];
    if (tag && tag !== "div") needles.push(`<${tag}`);

    const pick = async (hit: { path: string; matches: { line_number: number; line_text: string }[] }) => {
        const content = await commands.readFile(hit.path);
        const match =
            tag && hit.matches.find((m) => m.line_text.toLowerCase().includes(`<${tag}`)) || hit.matches[0];
        return { path: hit.path, content, line: match?.line_number };
    };

    for (const needle of needles) {
        try {
            const hits = await commands.searchContent(needle, SEARCH);
            const inProject = hits.filter((h) => h.path.toLowerCase().startsWith(projectPath.toLowerCase()));
            const unique = inProject.length ? inProject : hits;
            if (unique.length === 1) return pick(unique[0]!);
            if (tag && unique.length > 1) {
                const tagged = unique.filter((h) =>
                    h.matches.some((m) => m.line_text.toLowerCase().includes(`<${tag}`)),
                );
                if (tagged.length === 1) return pick(tagged[0]!);
            }
        } catch {
            /* next needle */
        }
    }
    return null;
}

function componentRootLine(content: string, name?: string): number | undefined {
    if (!name) return undefined;
    const re = new RegExp(
        `(?:export\\s+)?(?:default\\s+)?(?:function|const|class)\\s+${name}\\b`,
        "m",
    );
    const m = content.match(re);
    if (!m || m.index == null) return undefined;
    const from = content.slice(m.index, m.index + 2500);
    const ret = from.search(/return\s*\(\s*\n?\s*</);
    if (ret < 0) return undefined;
    const upto = content.slice(0, m.index + ret);
    return upto.split("\n").length;
}

export async function applyEditsToProject(
    projectPath: string,
    edits: DesignPendingEdit[],
    scope: "element" | "component",
): Promise<{ files: string[]; errors: string[] }> {
    const files = new Set<string>();
    const errors: string[] = [];
    const writes = new Map<string, string>();

    for (const edit of edits) {
        const tokens = stylesToClassTokens(edit.styles as Record<string, string | undefined>);
        const tag = (edit.tag || edit.label.split(/[.#]/)[0] || "div").toLowerCase();
        let located: { path: string; content: string; line?: number } | null = null;

        if (edit.source?.fileName) {
            const found = await readFirst(resolveSourcePath(projectPath, edit.source));
            if (found) {
                located = {
                    path: found.path,
                    content: found.content,
                    line:
                        scope === "component"
                            ? componentRootLine(found.content, edit.source.componentName) ?? edit.source.lineNumber
                            : edit.source.lineNumber,
                };
            }
        }
        if (!located) {
            const found = await findBySearch(projectPath, edit);
            if (found) located = found;
        }
        if (!located) {
            errors.push(`Couldn't find source for ${edit.label}`);
            continue;
        }
        if (scope === "component" && edit.source?.componentName) {
            const root = componentRootLine(located.content, edit.source.componentName);
            if (root) located.line = root;
        }

        const current = writes.get(located.path) ?? located.content;
        const html = located.path.endsWith(".html") || located.path.endsWith(".vue");
        const opening = findOpeningTag(current, tag, located.line);
        if (!opening) {
            errors.push(`Couldn't find <${tag}> in ${located.path}`);
            continue;
        }
        let next = current.slice(0, opening.start) + patchOpeningTag(opening.text, tokens, html) + current.slice(opening.end);
        if (edit.text != null && edit.text !== "") {
            const again = findOpeningTag(next, tag, located.line);
            if (again) next = patchTextChild(next, again.start, again.end, tag, edit.text);
        }
        writes.set(located.path, next);
        files.add(located.path);
    }

    for (const [path, content] of writes) {
        await commands.saveFile(path, content);
        const name = path.split(/[/\\]/).pop() || path;
        try {
            await commands.openFile(path, name);
        } catch {
            /* ignore */
        }
    }

    return { files: [...files], errors };
}
