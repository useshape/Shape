"use client";

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/**
 * Syntax palette — vivid tokens. Light/dark handled via CSS color-scheme + dual themes.
 */
const darkHighlight = HighlightStyle.define([
    { tag: t.comment, color: "#6b6b6b", fontStyle: "italic" },
    { tag: t.lineComment, color: "#6b6b6b", fontStyle: "italic" },
    { tag: t.blockComment, color: "#6b6b6b", fontStyle: "italic" },
    { tag: t.docComment, color: "#6b6b6b", fontStyle: "italic" },

    { tag: t.keyword, color: "#c4b5fd" },
    { tag: t.controlKeyword, color: "#c4b5fd" },
    { tag: t.moduleKeyword, color: "#c4b5fd" },
    { tag: t.definitionKeyword, color: "#c4b5fd" },
    { tag: t.operatorKeyword, color: "#c4b5fd" },

    { tag: t.string, color: "#86efac" },
    { tag: t.special(t.string), color: "#86efac" },
    { tag: t.character, color: "#86efac" },
    { tag: t.regexp, color: "#f9a8d4" },
    { tag: t.escape, color: "#fcd34d" },

    { tag: t.number, color: "#fdba74" },
    { tag: t.integer, color: "#fdba74" },
    { tag: t.float, color: "#fdba74" },
    { tag: t.bool, color: "#fdba74" },
    { tag: t.null, color: "#fdba74" },

    { tag: t.function(t.variableName), color: "#93c5fd" },
    { tag: t.function(t.propertyName), color: "#93c5fd" },
    { tag: t.definition(t.function(t.variableName)), color: "#93c5fd" },
    { tag: t.labelName, color: "#93c5fd" },

    { tag: t.typeName, color: "#67e8f9" },
    { tag: t.className, color: "#67e8f9" },
    { tag: t.namespace, color: "#67e8f9" },
    { tag: t.typeOperator, color: "#67e8f9" },

    { tag: t.propertyName, color: "#e2e8f0" },
    { tag: t.definition(t.propertyName), color: "#e2e8f0" },
    { tag: t.attributeName, color: "#fcd34d" },

    { tag: t.variableName, color: "#f1f5f9" },
    { tag: t.definition(t.variableName), color: "#f1f5f9" },
    { tag: t.local(t.variableName), color: "#f1f5f9" },
    { tag: t.special(t.variableName), color: "#f9a8d4" },

    { tag: t.operator, color: "#a3a3a3" },
    { tag: t.compareOperator, color: "#a3a3a3" },
    { tag: t.logicOperator, color: "#c4b5fd" },
    { tag: t.arithmeticOperator, color: "#a3a3a3" },
    { tag: t.punctuation, color: "#737373" },
    { tag: t.bracket, color: "#a3a3a3" },
    { tag: t.paren, color: "#a3a3a3" },
    { tag: t.squareBracket, color: "#a3a3a3" },
    { tag: t.brace, color: "#a3a3a3" },
    { tag: t.separator, color: "#737373" },

    { tag: t.tagName, color: "#f9a8d4" },
    { tag: t.angleBracket, color: "#737373" },
    { tag: t.attributeValue, color: "#86efac" },

    { tag: t.heading, color: "#c4b5fd", fontWeight: "600" },
    { tag: t.heading1, color: "#c4b5fd", fontWeight: "700" },
    { tag: t.heading2, color: "#c4b5fd", fontWeight: "600" },
    { tag: t.link, color: "#93c5fd", textDecoration: "underline" },
    { tag: t.url, color: "#93c5fd" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strong, fontWeight: "700" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.quote, color: "#86efac" },
    { tag: t.monospace, color: "#e2e8f0" },

    { tag: t.meta, color: "#737373" },
    { tag: t.processingInstruction, color: "#737373" },
    { tag: t.invalid, color: "#e5484d" },
]);

const lightHighlight = HighlightStyle.define([
    { tag: t.comment, color: "#6b7280", fontStyle: "italic" },
    { tag: t.lineComment, color: "#6b7280", fontStyle: "italic" },
    { tag: t.blockComment, color: "#6b7280", fontStyle: "italic" },
    { tag: t.docComment, color: "#6b7280", fontStyle: "italic" },

    { tag: t.keyword, color: "#7c3aed" },
    { tag: t.controlKeyword, color: "#7c3aed" },
    { tag: t.moduleKeyword, color: "#7c3aed" },
    { tag: t.definitionKeyword, color: "#7c3aed" },
    { tag: t.operatorKeyword, color: "#7c3aed" },

    { tag: t.string, color: "#15803d" },
    { tag: t.special(t.string), color: "#15803d" },
    { tag: t.character, color: "#15803d" },
    { tag: t.regexp, color: "#db2777" },
    { tag: t.escape, color: "#b45309" },

    { tag: t.number, color: "#c2410c" },
    { tag: t.integer, color: "#c2410c" },
    { tag: t.float, color: "#c2410c" },
    { tag: t.bool, color: "#c2410c" },
    { tag: t.null, color: "#c2410c" },

    { tag: t.function(t.variableName), color: "#1d4ed8" },
    { tag: t.function(t.propertyName), color: "#1d4ed8" },
    { tag: t.definition(t.function(t.variableName)), color: "#1d4ed8" },
    { tag: t.labelName, color: "#1d4ed8" },

    { tag: t.typeName, color: "#0e7490" },
    { tag: t.className, color: "#0e7490" },
    { tag: t.namespace, color: "#0e7490" },
    { tag: t.typeOperator, color: "#0e7490" },

    { tag: t.propertyName, color: "#334155" },
    { tag: t.definition(t.propertyName), color: "#334155" },
    { tag: t.attributeName, color: "#b45309" },

    { tag: t.variableName, color: "#0f172a" },
    { tag: t.definition(t.variableName), color: "#0f172a" },
    { tag: t.local(t.variableName), color: "#0f172a" },
    { tag: t.special(t.variableName), color: "#db2777" },

    { tag: t.operator, color: "#64748b" },
    { tag: t.compareOperator, color: "#64748b" },
    { tag: t.logicOperator, color: "#7c3aed" },
    { tag: t.arithmeticOperator, color: "#64748b" },
    { tag: t.punctuation, color: "#94a3b8" },
    { tag: t.bracket, color: "#64748b" },
    { tag: t.paren, color: "#64748b" },
    { tag: t.squareBracket, color: "#64748b" },
    { tag: t.brace, color: "#64748b" },
    { tag: t.separator, color: "#94a3b8" },

    { tag: t.tagName, color: "#db2777" },
    { tag: t.angleBracket, color: "#94a3b8" },
    { tag: t.attributeValue, color: "#15803d" },

    { tag: t.heading, color: "#7c3aed", fontWeight: "600" },
    { tag: t.heading1, color: "#7c3aed", fontWeight: "700" },
    { tag: t.heading2, color: "#7c3aed", fontWeight: "600" },
    { tag: t.link, color: "#1d4ed8", textDecoration: "underline" },
    { tag: t.url, color: "#1d4ed8" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strong, fontWeight: "700" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.quote, color: "#15803d" },
    { tag: t.monospace, color: "#334155" },

    { tag: t.meta, color: "#94a3b8" },
    { tag: t.processingInstruction, color: "#94a3b8" },
    { tag: t.invalid, color: "#dc2626" },
]);

function chromeTheme(dark: boolean) {
    return EditorView.theme(
        {
            "&": {
                height: "100%",
                fontSize: "13.5px",
                backgroundColor: "var(--color-panel)",
                color: "var(--color-text-primary)",
            },
            ".cm-scroller": {
                fontFamily:
                    "var(--font-geist-mono, var(--font-mono), 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace)",
                fontFeatureSettings: '"liga" 1, "calt" 1',
                lineHeight: "1.55",
                overflow: "auto",
                backgroundColor: "var(--color-panel)",
            },
            ".cm-content": {
                caretColor: "var(--color-text-primary)",
                padding: "12px 0 48px",
                minHeight: "100%",
            },
            "&.cm-focused .cm-content": {
                outline: "none",
            },
            ".cm-line": {
                padding: "0 16px 0 6px",
                borderBottom: "none",
                textDecoration: "none",
            },
            ".cm-line *": {
                textDecorationLine: "none",
            },
            /* Keep strikethrough only on deleted merge chunks, not every token */
            ".cm-deletedChunk .cm-line, .cm-deletedChunk .cm-line *": {
                textDecorationLine: "unset",
            },
            ".cm-cursor, .cm-dropCursor": {
                borderLeftWidth: "2px",
                borderLeftColor: "var(--color-text-primary)",
            },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
                {
                    backgroundColor:
                        "color-mix(in srgb, var(--color-accent) 28%, transparent) !important",
                },
            ".cm-selectionMatch": {
                backgroundColor:
                    "color-mix(in srgb, var(--color-accent-text) 18%, transparent)",
            },
            ".cm-activeLine": {
                backgroundColor: dark
                    ? "rgba(255, 255, 255, 0.035)"
                    : "rgba(0, 0, 0, 0.035)",
            },
            ".cm-gutters": {
                backgroundColor: "var(--color-panel)",
                color: "var(--color-text-disabled)",
                border: "none",
                borderRight: "1px solid transparent",
                minWidth: "3.25rem",
                paddingLeft: "4px",
            },
            ".cm-gutter, .cm-lineNumbers": {
                backgroundColor: "var(--color-panel)",
            },
            ".cm-gutterElement": {
                padding: "0 10px 0 8px",
                fontSize: "12px",
                fontVariantNumeric: "tabular-nums",
            },
            ".cm-activeLineGutter": {
                backgroundColor: "transparent",
                color: "var(--color-text-secondary)",
            },
            ".cm-foldGutter .cm-gutterElement": {
                color: "var(--color-text-disabled)",
                padding: "0 4px",
            },
            ".cm-foldPlaceholder": {
                background: "color-mix(in srgb, var(--color-surface-3) 80%, transparent)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "4px",
                color: "var(--color-text-muted)",
                margin: "0 2px",
                padding: "0 6px",
            },
            ".cm-matchingBracket, .cm-nonmatchingBracket": {
                backgroundColor:
                    "color-mix(in srgb, var(--color-accent-text) 22%, transparent)",
                outline:
                    "1px solid color-mix(in srgb, var(--color-accent-text) 45%, transparent)",
                borderRadius: "2px",
            },
            ".cm-tooltip": {
                backgroundColor: "var(--color-surface-3)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                color: "var(--color-text-primary)",
                boxShadow: dark
                    ? "0 8px 24px rgba(0,0,0,0.35)"
                    : "0 8px 24px rgba(0,0,0,0.12)",
                fontSize: "12.5px",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
                backgroundColor: "color-mix(in srgb, var(--color-accent) 28%, transparent)",
                color: "var(--color-text-primary)",
            },
            ".cm-completionIcon": {
                opacity: 0.55,
            },
            ".cm-completionMatchedText": {
                color: "var(--color-accent-text)",
                textDecoration: "none",
                fontWeight: "600",
            },
            ".cm-panels": {
                backgroundColor: "var(--color-surface-2)",
                color: "var(--color-text-primary)",
                borderTop: "1px solid var(--color-border-subtle)",
            },
            ".cm-panels .cm-panel": {
                padding: "6px 10px",
            },
            ".cm-panels input, .cm-panels button": {
                backgroundColor: "var(--color-surface-3)",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                color: "var(--color-text-primary)",
                fontSize: "12.5px",
            },
            ".cm-searchMatch": {
                backgroundColor: "color-mix(in srgb, var(--color-warn) 35%, transparent)",
            },
            ".cm-searchMatch.cm-searchMatch-selected": {
                backgroundColor: "color-mix(in srgb, var(--color-warn) 55%, transparent)",
            },
            ".cm-specialChar": {
                color: "var(--color-warn)",
            },
            ".cm-indent-markers ::before": {
                borderColor: dark
                    ? "rgba(255, 255, 255, 0.07) !important"
                    : "rgba(0, 0, 0, 0.08) !important",
            },
            ".cm-indent-markers.active ::before": {
                borderColor: dark
                    ? "rgba(255, 255, 255, 0.16) !important"
                    : "rgba(0, 0, 0, 0.18) !important",
            },
            ".cm-layer.cm-cursorLayer": {
                mixBlendMode: "normal",
            },
            /* Merge / diff — kill underline decorations from @codemirror/merge */
            ".cm-changedLine, .cm-changedText, .cm-underline, .cm-deletedChunk .cm-changedText, .cm-insertedChunk .cm-changedText": {
                textDecoration: "none !important",
                backgroundImage: "none !important",
            },
            ".cm-underline": {
                textDecoration: "none !important",
            },
            ".cm-mergeView, .cm-mergeViewEditor, .cm-editor, .cm-scroller, .cm-content": {
                backgroundColor: "var(--color-panel) !important",
            },
        },
        { dark },
    );
}

function isLightTheme(): boolean {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute("data-theme") === "light";
}

/** Shared look for the main editor and merge/diff views. */
export function shapeEditorChrome(): Extension[] {
    const light = isLightTheme();
    return [
        chromeTheme(!light),
        syntaxHighlighting(light ? lightHighlight : darkHighlight, { fallback: true }),
        EditorView.contentAttributes.of({
            spellcheck: "false",
            autocorrect: "off",
            autocapitalize: "off",
        }),
    ];
}
