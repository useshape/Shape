import { commands } from "@/lib/backend";
import { patchCssClass, validateCssSource } from "./patch-css";
import {
    canParseJsx,
    jsxClassExpressionKind,
    jsxHasNestedTextOnly,
    locateJsxByHint,
    locateJsxBySelector,
    locateJsxElement,
    locateJsxFromSearchLine,
    clearJsxParseCache,
    isSvgIntrinsicTag,
    jsxNameMatchesDomTag,
    selectorAtSvgRoot,
    validateJsxSource,
} from "./locate-jsx";
import { designLog } from "../log";
import { enrichSourceIdentity, isBundledGeneratedPath } from "../identity";
import type { DesignPendingEdit } from "../types";
import { sameCssColor, splitVariantToken, stylesToClassTokens, stylesToCssDecls } from "./class-tokens";
import { openingTagHasTokens, patchInlineStyles, patchOpeningTag, patchTextChild } from "./patch-tag";
import { cssModuleLocal, pickBestOpening, type OpeningTagHit } from "./locate-html";
import {
    join,
    layoutPathsNear,
    persistWrite,
    readLatest,
    resolveRelative,
    resolveSourcePath,
} from "./source-files";

export type ApplyEditsResult = {
    files: string[];
    errors: string[];
    appliedIds: string[];
    failedIds: string[];
    reverts: { path: string; previous: string }[];
};

function applyResult(partial: Partial<ApplyEditsResult> & { errors: string[] }): ApplyEditsResult {
    return { files: [], appliedIds: [], failedIds: [], reverts: [], ...partial };
}

export function pendingEditHasWork(edit: DesignPendingEdit): boolean {
    const hasStyles = Object.values(edit.styles).some((v) => v != null && String(v).trim() !== "");
    const hasText = edit.text != null && edit.text !== "";
    const hasClass = !!edit.classToggles && Object.keys(edit.classToggles).length > 0;
    return hasStyles || hasText || hasClass;
}

let applyEpoch = 0;
let lastLocatedPath = "";

export function abortDesignApply() {
    applyEpoch += 1;
}

function applyWasAborted(epoch: number) {
    return epoch !== applyEpoch;
}

const TAILWIND_CLASS_KEYS = new Set([
    "fontWeight",
    "fontFamily",
    "fontSize",
    "fontStyle",
    "lineHeight",
    "letterSpacing",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "columnGap",
    "rowGap",
    "boxShadow",
    "filter",
    "backdropFilter",
    "borderStyle",
    "borderWidth",
    "borderColor",
    "textAlign",
    "textDecoration",
    "textTransform",
    "whiteSpace",
    "textOverflow",
    "display",
    "flexDirection",
    "flexWrap",
    "justifyContent",
    "alignItems",
    "gap",
    "width",
    "height",
    "opacity",
    "borderRadius",
    "overflow",
    "maskImage",
    "WebkitMaskImage",
]);

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
    const next = content.slice(0, hit.start) + patched + content.slice(hit.end);
    return { content: next, evidence: Object.keys(styles) };
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

export function splitVarAndPlain(edit: DesignPendingEdit): {
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
            const computed = origin?.computed?.trim() ?? "";
            if (computed && sameCssColor(String(raw).trim(), computed)) {
                continue;
            }
            plain[key] = String(raw);
            continue;
        }
        plain[key] = String(raw);
    }
    return { plain, variables };
}

function toOpeningHit(hit: { start: number; end: number; text: string; line: number; column: number }): OpeningTagHit {
    return { start: hit.start, end: hit.end, text: hit.text, line: hit.line, column: hit.column };
}

function openingName(hit: OpeningTagHit): string {
    return hit.text.match(/^<\s*([A-Za-z][\w.-]*)/)?.[1] ?? "";
}

function hitMatchesDomTag(hit: OpeningTagHit, tag: string, componentName?: string): boolean {
    return jsxNameMatchesDomTag(openingName(hit), tag, componentName);
}

function locateHit(
    current: string,
    path: string,
    tag: string,
    edit: DesignPendingEdit,
): { hit: OpeningTagHit } | { error: string } {
    const authoredLine = edit.source?.mapped === false ? undefined : edit.source?.lineNumber;
    const componentName = edit.source?.componentName;
    const hint = {
        className: edit.className,
        tag,
        locateText: edit.locateText || edit.text,
        lineNumber: authoredLine,
        componentName,
    };
    const accept = (hit: OpeningTagHit) => hitMatchesDomTag(hit, tag, componentName);
    if (canParseJsx(path)) {
        if (authoredLine) {
            const byLoc = locateJsxElement(current, path, { lineNumber: authoredLine, columnNumber: edit.source?.columnNumber });
            if (byLoc.ok) {
                const hit = toOpeningHit(byLoc.hit);
                if (accept(hit)) return { hit };
            }
        }
        const emptyClass = !(edit.className || "").trim();
        if (emptyClass && edit.selector) {
            const bySel = locateJsxBySelector(current, path, edit.selector);
            if (bySel.ok) {
                const hit = toOpeningHit(bySel.hit);
                if (accept(hit)) return { hit };
            }
        }
        const byHint = locateJsxByHint(current, path, hint);
        if (byHint.ok) {
            const hit = toOpeningHit(byHint.hit);
            if (accept(hit)) return { hit };
        }
        const bySel = locateJsxBySelector(current, path, edit.selector);
        if (bySel.ok) {
            const hit = toOpeningHit(bySel.hit);
            if (accept(hit)) return { hit };
        }
        if (authoredLine) {
            const fromLine = locateJsxFromSearchLine(current, path, authoredLine);
            if (fromLine.ok) {
                const hit = toOpeningHit(fromLine.hit);
                if (accept(hit)) return { hit };
            }
        }
        // Clicking inside an icon selects <path>/<g>; retry against the element that owns the <svg>.
        const svgRoot = isSvgIntrinsicTag(tag) ? selectorAtSvgRoot(edit.selector) : undefined;
        if (svgRoot) {
            const byRoot = locateJsxBySelector(current, path, svgRoot);
            if (byRoot.ok) {
                const hit = toOpeningHit(byRoot.hit);
                if (accept(hit)) return { hit };
            }
        }
        if (componentName) {
            const byComponent = locateJsxByHint(current, path, { ...hint, tag: undefined, className: undefined });
            if (byComponent.ok) {
                const hit = toOpeningHit(byComponent.hit);
                if (openingName(hit) === componentName) return { hit };
            }
        }
        return { error: "error" in byHint && !byHint.ok ? byHint.error : `No JSX element at ${path.split(/[/\\]/).pop()} matches this node.` };
    }
    const hit = pickBestOpening(current, tag, edit);
    if (!hit) {
        return {
            error: `Cannot safely match <${tag}> in ${path.split(/[/\\]/).pop()}.`,
        };
    }
    return { hit };
}

async function loadFile(
    path: string,
    writes: Map<string, string>,
    reads: Map<string, string>,
): Promise<string | null> {
    const staged = writes.get(path);
    if (staged != null) return staged;
    const cached = reads.get(path);
    if (cached != null) return cached;
    const content = await readLatest(path);
    if (content != null) reads.set(path, content);
    return content;
}

async function resolveCandidateFiles(
    projectPath: string,
    edit: DesignPendingEdit,
    writes: Map<string, string>,
    reads: Map<string, string>,
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

    const identity = edit.source ? enrichSourceIdentity(edit.source) : undefined;
    if (identity && !isBundledGeneratedPath(identity.fileName)) {
        // Keep every resolvable guess: `app/x.tsx` and `src/x.tsx` can both exist, and the
        // first one that loads is not always the one holding the element.
        for (const path of resolveSourcePath(projectPath, identity)) {
            const content = await loadFile(path, writes, reads);
            if (content != null) {
                add({
                    path,
                    content,
                    line: identity.mapped === false ? undefined : identity.lineNumber,
                });
            }
        }
    }
    const tag = (edit.tag || "").toLowerCase();
    if (tag === "html" || tag === "body") {
        for (const rel of ["app/layout.tsx", "app/layout.jsx", "src/app/layout.tsx", "src/app/layout.jsx"]) {
            const path = join(projectPath, rel);
            const content = await loadFile(path, writes, reads);
            add(content != null ? { path, content } : null);
        }
        const near = out[0]?.path ?? lastLocatedPath;
        if (near) {
            for (const path of layoutPathsNear(near)) {
                const content = await loadFile(path, writes, reads);
                add(content != null ? { path, content } : null);
            }
        }
    }
    for (const [path, content] of writes) add({ path, content });
    for (const [path, content] of reads) add({ path, content });
    if (!out.length && lastLocatedPath) {
        const cached = await loadFile(lastLocatedPath, writes, reads);
        add(cached != null ? { path: lastLocatedPath, content: cached } : null);
    }
    return out;
}

async function applyOne(
    projectPath: string,
    edit: DesignPendingEdit,
    scope: "element" | "component",
    tailwind: boolean,
    writes: Map<string, string>,
    reads: Map<string, string>,
): Promise<{ paths: string[] } | { error: string }> {
    const { plain, variables } = splitVarAndPlain(edit);
    const tag = (edit.tag || edit.label.split(/[.#]/)[0] || "div").toLowerCase();
    edit = { ...edit, source: enrichSourceIdentity(edit.source) };

    const candidates = await resolveCandidateFiles(projectPath, edit, writes, reads);
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
        lastLocatedPath = cand.path;
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
        if (useTailwind && !preferCss && TAILWIND_CLASS_KEYS.has(key) && kind !== "inline" && kind !== "module") {
            twStyles[key] = value;
            continue;
        }
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
        }
        return null;
    };

    for (const variable of variables) {
        return {
            error: `${variable.key} comes from ${variable.name}; refusing to replace it with a computed value.`,
        };
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
            designLog("INFO", "CSS owner missed; applying as Tailwind/inline", { keys: Object.keys(cssStyles) });
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
        } else if (openingTagHasTokens(hit.text, twTokens)) {
            mutated = true;
        } else {
            designLog("WARN", "className patch made no change", { tokens: twTokens, kind: jsxClassExpressionKind(hit.text) });
            for (const [k, v] of Object.entries(twStyles)) {
                if (k === "fontFamily") continue;
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
                designLog("WARN", "skipping text patch; not a plain text child", { tag });
            } else {
                const withText = patchTextChild(next, again.hit.start, again.hit.end, tag, edit.text);
                if (withText !== next) {
                    next = withText;
                    mutated = true;
                }
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
    const failedIds: string[] = [];
    const writes = new Map<string, string>();
    const reads = new Map<string, string>();
    const originals = new Map<string, string>();
    clearJsxParseCache();
    try {
    const tailwind = await projectUsesTailwind(projectPath);
    if (applyWasAborted(epoch)) {
        return applyResult({ errors: ["Apply cancelled."], failedIds: edits.map((e) => e.id) });
    }

    const work = edits
        .filter(pendingEditHasWork)
        .slice()
        .sort((a, b) => Number(!!b.source) - Number(!!a.source));
    let sharedSource = work.find((e) => e.source)?.source;

    const remember = async (path: string) => {
        if (originals.has(path)) return;
        const current = reads.get(path) ?? (await readLatest(path));
        if (current != null) originals.set(path, current);
    };

    for (const edit of work) {
        if (applyWasAborted(epoch)) {
            return applyResult({ errors: ["Apply cancelled."], failedIds: edits.map((e) => e.id) });
        }
        const before = new Map(writes);
        const prepared = !edit.source && sharedSource ? { ...edit, source: sharedSource } : edit;
        const result = await applyOne(projectPath, prepared, scope, tailwind, writes, reads);
        if ("error" in result) {
            for (const [k] of writes) {
                if (!before.has(k)) writes.delete(k);
            }
            for (const [k, v] of before) writes.set(k, v);
            errors.push(`${edit.label}: ${result.error}`);
            failedIds.push(edit.id);
            continue;
        }
        for (const path of result.paths) await remember(path);
        plannedIds.push(edit.id);
        if (prepared.source) sharedSource = prepared.source;
    }

    if (!writes.size) {
        designLog("WARN", "apply batch wrote nothing", { errors });
        return applyResult({ errors, failedIds });
    }

    for (const [path, content] of writes) {
        const err = validateStaged(path, content);
        if (err) {
            return applyResult({
                errors: [...errors, `${path.split(/[/\\]/).pop()}: ${err}`],
                failedIds: [...failedIds, ...plannedIds],
            });
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
        return applyResult({
            errors: [...errors, e instanceof Error ? e.message : String(e)],
            failedIds: [...failedIds, ...plannedIds],
        });
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
    return { files: persisted, errors, appliedIds: plannedIds, failedIds, reverts };
    } finally {
        clearJsxParseCache();
    }
}

