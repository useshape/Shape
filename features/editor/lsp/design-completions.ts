/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design-aware completion provider for Tailwind / CSS class attributes.
 * Ranks by project usage, sibling context, role prefix, and fuzzy match —
 * not bare text regex alone.
 */

import { getSettings } from "@/lib/settings";
import {
    contextAtOffset,
    findClassContexts,
    getClassPrefixAtOffset,
    getTokensInContext,
} from "@/features/editor/lib/class-attribute";

export interface DesignSuggestion {
    label: string;
    detail?: string;
    sortPriority: number;
}

export interface BuildSuggestionsInput {
    prefix: string;
    projectTokens?: DesignSuggestion[];
    frequency?: Map<string, number>;
    semantic?: DesignSuggestion[];
    roleHint?: string | null;
    /** Other tokens already in the same class string (for contextual boosts). */
    siblings?: string[];
}

const SPACING_SCALE = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96];

function scaleFamily(prefix: string, basePriority: number, detail: string): DesignSuggestion[] {
    return SPACING_SCALE.map((n) => ({
        label: `${prefix}-${n % 1 === 0 ? n : n.toFixed(1)}`,
        detail,
        sortPriority: basePriority,
    }));
}

/** Curated utility catalog — families designers actually reach for. */
export const DESIGN_UTILITY_CATALOG: DesignSuggestion[] = [
    // layout
    { label: "flex", detail: "Display", sortPriority: 4 },
    { label: "inline-flex", detail: "Display", sortPriority: 6 },
    { label: "grid", detail: "Display", sortPriority: 4 },
    { label: "inline-grid", detail: "Display", sortPriority: 7 },
    { label: "hidden", detail: "Display", sortPriority: 5 },
    { label: "block", detail: "Display", sortPriority: 6 },
    { label: "inline-block", detail: "Display", sortPriority: 7 },
    { label: "flex-1", detail: "Flex", sortPriority: 5 },
    { label: "flex-col", detail: "Flex", sortPriority: 4 },
    { label: "flex-row", detail: "Flex", sortPriority: 6 },
    { label: "flex-wrap", detail: "Flex", sortPriority: 6 },
    { label: "items-start", detail: "Align", sortPriority: 5 },
    { label: "items-center", detail: "Align", sortPriority: 4 },
    { label: "items-end", detail: "Align", sortPriority: 5 },
    { label: "items-baseline", detail: "Align", sortPriority: 6 },
    { label: "items-stretch", detail: "Align", sortPriority: 6 },
    { label: "justify-start", detail: "Justify", sortPriority: 5 },
    { label: "justify-center", detail: "Justify", sortPriority: 4 },
    { label: "justify-end", detail: "Justify", sortPriority: 5 },
    { label: "justify-between", detail: "Justify", sortPriority: 4 },
    { label: "justify-around", detail: "Justify", sortPriority: 6 },
    { label: "justify-evenly", detail: "Justify", sortPriority: 6 },
    { label: "self-start", detail: "Self", sortPriority: 6 },
    { label: "self-center", detail: "Self", sortPriority: 6 },
    { label: "self-end", detail: "Self", sortPriority: 6 },
    { label: "self-stretch", detail: "Self", sortPriority: 6 },
    { label: "grid-cols-2", detail: "Grid", sortPriority: 5 },
    { label: "grid-cols-3", detail: "Grid", sortPriority: 5 },
    { label: "grid-cols-4", detail: "Grid", sortPriority: 5 },
    { label: "col-span-2", detail: "Grid", sortPriority: 6 },
    { label: "col-span-full", detail: "Grid", sortPriority: 6 },
    // sizing
    { label: "w-full", detail: "Size", sortPriority: 4 },
    { label: "h-full", detail: "Size", sortPriority: 4 },
    { label: "w-fit", detail: "Size", sortPriority: 6 },
    { label: "h-fit", detail: "Size", sortPriority: 6 },
    { label: "min-w-0", detail: "Size", sortPriority: 5 },
    { label: "min-h-0", detail: "Size", sortPriority: 5 },
    { label: "max-w-full", detail: "Size", sortPriority: 6 },
    { label: "size-4", detail: "Size", sortPriority: 6 },
    { label: "size-5", detail: "Size", sortPriority: 6 },
    { label: "size-6", detail: "Size", sortPriority: 6 },
    { label: "size-8", detail: "Size", sortPriority: 6 },
    { label: "size-icon-sm", detail: "Size", sortPriority: 5 },
    // typography
    { label: "text-xs", detail: "Type", sortPriority: 5 },
    { label: "text-sm", detail: "Type", sortPriority: 4 },
    { label: "text-base", detail: "Type", sortPriority: 5 },
    { label: "text-lg", detail: "Type", sortPriority: 5 },
    { label: "text-xl", detail: "Type", sortPriority: 6 },
    { label: "text-2xl", detail: "Type", sortPriority: 6 },
    { label: "font-medium", detail: "Type", sortPriority: 4 },
    { label: "font-semibold", detail: "Type", sortPriority: 5 },
    { label: "font-normal", detail: "Type", sortPriority: 6 },
    { label: "font-mono", detail: "Type", sortPriority: 6 },
    { label: "leading-none", detail: "Type", sortPriority: 6 },
    { label: "leading-tight", detail: "Type", sortPriority: 6 },
    { label: "leading-snug", detail: "Type", sortPriority: 6 },
    { label: "truncate", detail: "Type", sortPriority: 4 },
    { label: "text-left", detail: "Type", sortPriority: 6 },
    { label: "text-center", detail: "Type", sortPriority: 5 },
    { label: "text-right", detail: "Type", sortPriority: 6 },
    { label: "whitespace-nowrap", detail: "Type", sortPriority: 5 },
    // colors (semantic / project-shaped)
    { label: "text-text-primary", detail: "Color", sortPriority: 4 },
    { label: "text-text-secondary", detail: "Color", sortPriority: 4 },
    { label: "text-text-muted", detail: "Color", sortPriority: 4 },
    { label: "text-text-disabled", detail: "Color", sortPriority: 6 },
    { label: "text-accent", detail: "Color", sortPriority: 5 },
    { label: "text-success", detail: "Color", sortPriority: 6 },
    { label: "text-primary", detail: "Color", sortPriority: 5 },
    { label: "text-secondary", detail: "Color", sortPriority: 5 },
    { label: "text-muted", detail: "Color", sortPriority: 5 },
    { label: "bg-background", detail: "Color", sortPriority: 4 },
    { label: "bg-editor", detail: "Color", sortPriority: 5 },
    { label: "bg-panel", detail: "Color", sortPriority: 4 },
    { label: "bg-panel-hover", detail: "Color", sortPriority: 5 },
    { label: "bg-panel-active", detail: "Color", sortPriority: 5 },
    { label: "bg-surface-3", detail: "Color", sortPriority: 5 },
    { label: "bg-accent", detail: "Color", sortPriority: 5 },
    { label: "border-border", detail: "Color", sortPriority: 4 },
    { label: "border-border-subtle", detail: "Color", sortPriority: 4 },
    { label: "border-border-secondary", detail: "Color", sortPriority: 6 },
    // chrome
    { label: "rounded", detail: "Radius", sortPriority: 6 },
    { label: "rounded-md", detail: "Radius", sortPriority: 4 },
    { label: "rounded-lg", detail: "Radius", sortPriority: 4 },
    { label: "rounded-xl", detail: "Radius", sortPriority: 5 },
    { label: "rounded-full", detail: "Radius", sortPriority: 5 },
    { label: "border", detail: "Border", sortPriority: 4 },
    { label: "border-t", detail: "Border", sortPriority: 6 },
    { label: "border-b", detail: "Border", sortPriority: 6 },
    { label: "shadow-sm", detail: "Shadow", sortPriority: 6 },
    { label: "shadow-md", detail: "Shadow", sortPriority: 6 },
    { label: "shadow-lg", detail: "Shadow", sortPriority: 6 },
    // overflow / position
    { label: "relative", detail: "Position", sortPriority: 4 },
    { label: "absolute", detail: "Position", sortPriority: 5 },
    { label: "fixed", detail: "Position", sortPriority: 6 },
    { label: "sticky", detail: "Position", sortPriority: 6 },
    { label: "inset-0", detail: "Position", sortPriority: 5 },
    { label: "overflow-hidden", detail: "Overflow", sortPriority: 4 },
    { label: "overflow-auto", detail: "Overflow", sortPriority: 5 },
    { label: "overflow-y-auto", detail: "Overflow", sortPriority: 5 },
    { label: "shrink-0", detail: "Flex", sortPriority: 4 },
    { label: "grow", detail: "Flex", sortPriority: 6 },
    { label: "min-w-0", detail: "Flex", sortPriority: 5 },
    // interaction
    { label: "transition-colors", detail: "Motion", sortPriority: 5 },
    { label: "transition-opacity", detail: "Motion", sortPriority: 6 },
    { label: "transition-transform", detail: "Motion", sortPriority: 6 },
    { label: "duration-150", detail: "Motion", sortPriority: 6 },
    { label: "duration-200", detail: "Motion", sortPriority: 5 },
    { label: "cursor-pointer", detail: "Cursor", sortPriority: 5 },
    { label: "select-none", detail: "Interaction", sortPriority: 6 },
    { label: "pointer-events-none", detail: "Interaction", sortPriority: 6 },
    { label: "outline-none", detail: "Focus", sortPriority: 5 },
    { label: "ring-1", detail: "Focus", sortPriority: 6 },
    { label: "ring-accent", detail: "Focus", sortPriority: 6 },
    // spacing families
    ...scaleFamily("p", 5, "Padding"),
    ...scaleFamily("px", 5, "Padding"),
    ...scaleFamily("py", 5, "Padding"),
    ...scaleFamily("pt", 6, "Padding"),
    ...scaleFamily("pr", 6, "Padding"),
    ...scaleFamily("pb", 6, "Padding"),
    ...scaleFamily("pl", 6, "Padding"),
    ...scaleFamily("m", 6, "Margin"),
    ...scaleFamily("mx", 6, "Margin"),
    ...scaleFamily("my", 6, "Margin"),
    ...scaleFamily("gap", 4, "Gap"),
    ...scaleFamily("gap-x", 5, "Gap"),
    ...scaleFamily("gap-y", 5, "Gap"),
    ...scaleFamily("w", 6, "Width"),
    ...scaleFamily("h", 6, "Height"),
];

const VARIANT_PREFIXES = [
    "hover:",
    "focus:",
    "focus-visible:",
    "active:",
    "disabled:",
    "group-hover:",
    "dark:",
    "sm:",
    "md:",
    "lg:",
    "xl:",
    "2xl:",
];

/** Soft fuzzy: consecutive subsequence match (e.g. "flx" → "flex"). */
export function fuzzyMatchScore(query: string, label: string): number | null {
    if (!query) return 0;
    const q = query.toLowerCase();
    const t = label.toLowerCase();
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    if (t.includes(q)) return 3;
    let qi = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
        if (t[i] === q[qi]) qi++;
    }
    if (qi === q.length) return 8;
    return null;
}

function siblingBoost(label: string, siblings: string[]): number {
    if (!siblings.length) return 0;
    const set = new Set(siblings);
    let boost = 0;
    const hasFlex = set.has("flex") || set.has("inline-flex");
    const hasGrid = set.has("grid") || set.has("inline-grid");
    if (hasFlex) {
        if (/^(items|justify|gap|flex-|self-|shrink|grow)/.test(label)) boost += 3;
    }
    if (hasGrid) {
        if (/^(grid-|col-|row-|gap)/.test(label)) boost += 3;
    }
    if ([...set].some((s) => s.startsWith("text-") || s.startsWith("font-"))) {
        if (/^(text-|font-|leading-|truncate|whitespace-)/.test(label)) boost += 2;
    }
    if ([...set].some((s) => s.startsWith("bg-") || s === "border")) {
        if (/^(bg-|border|rounded|shadow)/.test(label)) boost += 2;
    }
    return boost;
}

function computePriority(
    label: string,
    base: number,
    prefix: string,
    boost = 0,
    roleHint?: string | null,
    siblings?: string[],
): number {
    const bare = label.includes(":") ? label.slice(label.lastIndexOf(":") + 1) : label;
    const fuzzy = fuzzyMatchScore(prefix, bare);
    if (fuzzy === null && prefix) {
        // Allow matching against full label including variant.
        const full = fuzzyMatchScore(prefix, label);
        if (full === null) return Number.POSITIVE_INFINITY;
        return Math.max(0, base + full - boost);
    }

    let priority = base + (fuzzy ?? 0);

    if (roleHint && bare.startsWith(`${roleHint}-`)) {
        priority = Math.max(0, priority - 2);
    }

    priority -= siblingBoost(bare, siblings ?? []);
    priority -= boost;

    return Math.max(0, priority);
}

/** Pure, testable suggestion builder. */
export function buildDesignSuggestions(input: BuildSuggestionsInput): DesignSuggestion[] {
    const prefix = input.prefix.toLowerCase();
    const semantic = input.semantic ?? DESIGN_UTILITY_CATALOG;
    const projectTokens = input.projectTokens ?? [];
    const frequency = input.frequency ?? new Map<string, number>();
    const roleHint = input.roleHint ?? null;
    const siblings = input.siblings ?? [];

    const seen = new Set<string>();
    const results: DesignSuggestion[] = [];

    const add = (entry: DesignSuggestion, boost = 0) => {
        if (seen.has(entry.label)) return;
        const priority = computePriority(
            entry.label,
            entry.sortPriority,
            prefix,
            boost,
            roleHint,
            siblings,
        );
        if (!Number.isFinite(priority)) return;
        seen.add(entry.label);
        results.push({ ...entry, sortPriority: priority });
    };

    // Variant completion: "hover:" → hover:flex, hover:bg-panel-hover, …
    const variantMatch = VARIANT_PREFIXES.find((v) => prefix === v || (prefix.startsWith(v.slice(0, -1)) && v.startsWith(prefix)));
    if (variantMatch && (prefix === variantMatch || variantMatch.startsWith(prefix))) {
        if (prefix.endsWith(":") || variantMatch === prefix + ":") {
            const v = prefix.endsWith(":") ? prefix : variantMatch;
            for (const entry of semantic.slice(0, 40)) {
                add({ label: `${v}${entry.label}`, detail: entry.detail ?? "Variant", sortPriority: 3 });
            }
        } else {
            for (const v of VARIANT_PREFIXES) {
                if (v.startsWith(prefix)) add({ label: v, detail: "Variant", sortPriority: 2 });
            }
        }
    }

    for (const entry of projectTokens) {
        add({ ...entry, sortPriority: entry.sortPriority ?? 2 }, 2);
    }

    const sortedFreq = [...frequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 120);
    for (const [cls, freq] of sortedFreq) {
        const boost = Math.min(6, Math.floor(Math.log2(freq + 1)));
        const known = projectTokens.find((e) => e.label === cls) ?? semantic.find((e) => e.label === cls);
        if (known) add(known, boost);
        else add({ label: cls, detail: `Used ${freq}×`, sortPriority: 4 }, boost);
    }

    for (const entry of semantic) add(entry);

    // If typing a known family prefix with a trailing dash, ensure scale series is present.
    const family = prefix.match(/^(p|px|py|pt|pr|pb|pl|m|mx|my|gap|gap-x|gap-y|w|h)-$/)?.[1];
    if (family) {
        for (const n of SPACING_SCALE) {
            add({
                label: `${family}-${n % 1 === 0 ? n : n.toFixed(1)}`,
                detail: "Scale",
                sortPriority: 3,
            });
        }
    }

    results.sort((a, b) => a.sortPriority - b.sortPriority || a.label.localeCompare(b.label));
    return results.slice(0, 80);
}

const classFrequency = new Map<string, number>();
const projectClassTokens = new Set<string>();
let lastScanMs = 0;
const SCAN_INTERVAL_MS = 30_000;

function isWorkspaceModel(model: any): boolean {
    const uri: string = model.uri?.path ?? model.uri?.fsPath ?? String(model.uri ?? "");
    return !uri.includes("node_modules");
}

function scanProjectClasses(monaco: any): void {
    const now = Date.now();
    if (now - lastScanMs < SCAN_INTERVAL_MS) return;
    lastScanMs = now;
    classFrequency.clear();
    projectClassTokens.clear();

    for (const model of monaco.editor.getModels()) {
        if (!isWorkspaceModel(model)) continue;
        const content = model.getValue();
        for (const ctx of findClassContexts(content)) {
            for (const tok of getTokensInContext(content, ctx)) {
                if (tok.value.length < 2) continue;
                classFrequency.set(tok.value, (classFrequency.get(tok.value) ?? 0) + 1);
                projectClassTokens.add(tok.value);
            }
        }
    }
}

function inferRoleHint(prefix: string, ctxBody: string): string | null {
    const bare = prefix.includes(":") ? prefix.slice(prefix.lastIndexOf(":") + 1) : prefix;
    const fromPrefix = bare.match(
        /^(bg|text|border|ring|fill|stroke|outline|divide|accent|caret|decoration|placeholder|p|px|py|m|mx|my|gap|w|h|rounded|font|leading|items|justify|self|grid|col|row)-/,
    )?.[1];
    if (fromPrefix) return fromPrefix;
    const before = ctxBody.slice(0, Math.max(0, ctxBody.length - prefix.length));
    const tail = before.match(
        /(?:^|\s)(bg|text|border|ring|fill|stroke|outline|divide|accent|caret|decoration|placeholder)-$/,
    );
    return tail?.[1] ?? null;
}

function siblingsAtOffset(line: string, offset: number): string[] {
    const ctx = contextAtOffset(line, offset);
    if (!ctx) return [];
    const prefix = getClassPrefixAtOffset(line, offset) ?? "";
    return getTokensInContext(line, ctx)
        .map((t) => t.value)
        .filter((v) => v && v !== prefix);
}

let _registered = false;

export function ensureDesignCompletionProvider(monaco: any): void {
    if (_registered) return;
    _registered = true;

    const LANGUAGES = ["typescriptreact", "javascriptreact", "typescript", "javascript", "html"];

    for (const lang of LANGUAGES) {
        monaco.languages.registerCompletionItemProvider(lang, {
            triggerCharacters: [" ", '"', "'", "`", "-", ":"],
            provideCompletionItems(model: any, position: any) {
                if (getSettings().designAutocomplete?.enable === false) {
                    return { suggestions: [] };
                }

                const line: string = model.getLineContent(position.lineNumber);
                const offset = position.column - 1;
                const ctx = contextAtOffset(line, offset);
                if (!ctx) return { suggestions: [] };

                scanProjectClasses(monaco);
                const prefix = getClassPrefixAtOffset(line, offset) ?? "";

                const ctxBody = line.slice(ctx.bodyStart, ctx.bodyEnd);
                const tokenStart = ctx.bodyStart + ctxBody.lastIndexOf(prefix);
                const tokenEnd = tokenStart + prefix.length;

                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: tokenStart + 1,
                    endColumn: Math.max(tokenEnd + 1, position.column),
                };

                const projectTokens = [...projectClassTokens].map((label) => ({
                    label,
                    sortPriority: 2,
                    detail: "In project",
                }));

                const suggestions = buildDesignSuggestions({
                    prefix,
                    frequency: classFrequency,
                    projectTokens,
                    roleHint: inferRoleHint(prefix, ctxBody),
                    siblings: siblingsAtOffset(line, offset),
                });

                return {
                    suggestions: suggestions.map((entry) => ({
                        label: entry.label,
                        kind: monaco.languages.CompletionItemKind.Value,
                        detail: entry.detail,
                        insertText: entry.label,
                        range,
                        sortText: String(entry.sortPriority).padStart(3, "0") + entry.label,
                    })),
                };
            },
        });
    }
}
