"use client";

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/**
 * Syntax palette — vivid tokens. Light/dark handled via CSS color-scheme + dual themes.
 */
const cssHighlight = HighlightStyle.define([
    { tag: t.comment, color: "var(--text-muted)", fontStyle: "italic" },
    { tag: t.lineComment, color: "var(--text-muted)", fontStyle: "italic" },
    { tag: t.blockComment, color: "var(--text-muted)", fontStyle: "italic" },
    { tag: t.docComment, color: "var(--text-muted)", fontStyle: "italic" },

    { tag: t.keyword, color: "var(--accent)" },
    { tag: t.controlKeyword, color: "var(--accent)" },
    { tag: t.moduleKeyword, color: "var(--accent)" },
    { tag: t.definitionKeyword, color: "var(--accent)" },
    { tag: t.operatorKeyword, color: "var(--accent)" },

    { tag: t.string, color: "var(--info)" },
    { tag: t.special(t.string), color: "var(--info)" },
    { tag: t.character, color: "var(--info)" },
    { tag: t.regexp, color: "var(--warning)" },
    { tag: t.escape, color: "var(--warning)" },

    { tag: t.number, color: "var(--warning)" },
    { tag: t.integer, color: "var(--warning)" },
    { tag: t.float, color: "var(--warning)" },
    { tag: t.bool, color: "var(--accent)" },
    { tag: t.null, color: "var(--text-muted)" },

    { tag: t.function(t.variableName), color: "var(--info)" },
    { tag: t.function(t.propertyName), color: "var(--info)" },
    { tag: t.definition(t.function(t.variableName)), color: "var(--info)" },
    { tag: t.labelName, color: "var(--info)" },

    { tag: t.typeName, color: "var(--accent)" },
    { tag: t.className, color: "var(--accent)" },
    { tag: t.namespace, color: "var(--accent)" },
    { tag: t.typeOperator, color: "var(--accent)" },

    { tag: t.propertyName, color: "var(--text-secondary)" },
    { tag: t.definition(t.propertyName), color: "var(--text-secondary)" },
    { tag: t.attributeName, color: "var(--warning)" },

    { tag: t.variableName, color: "var(--text-primary)" },
    { tag: t.definition(t.variableName), color: "var(--text-primary)" },
    { tag: t.local(t.variableName), color: "var(--text-primary)" },
    { tag: t.special(t.variableName), color: "var(--accent)" },

    { tag: t.operator, color: "var(--text-muted)" },
    { tag: t.compareOperator, color: "var(--text-muted)" },
    { tag: t.logicOperator, color: "var(--accent)" },
    { tag: t.arithmeticOperator, color: "var(--text-muted)" },
    { tag: t.punctuation, color: "var(--text-disabled)" },
    { tag: t.bracket, color: "var(--text-muted)" },
    { tag: t.paren, color: "var(--text-muted)" },
    { tag: t.squareBracket, color: "var(--text-muted)" },
    { tag: t.brace, color: "var(--text-muted)" },
    { tag: t.separator, color: "var(--text-disabled)" },

    { tag: t.tagName, color: "var(--accent)" },
    { tag: t.angleBracket, color: "var(--text-disabled)" },
    { tag: t.attributeValue, color: "var(--info)" },

    { tag: t.heading, color: "var(--accent)", fontWeight: "600" },
    { tag: t.heading1, color: "var(--accent)", fontWeight: "700" },
    { tag: t.heading2, color: "var(--accent)", fontWeight: "600" },
    { tag: t.link, color: "var(--info)", textDecoration: "underline" },
    { tag: t.url, color: "var(--info)" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strong, fontWeight: "700" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.quote, color: "var(--info)" },
    { tag: t.monospace, color: "var(--text-secondary)" },

    { tag: t.meta, color: "var(--text-muted)" },
    { tag: t.processingInstruction, color: "var(--text-muted)" },
    { tag: t.invalid, color: "var(--error)" },
]);

/** VS Code Dark+ token colors. The light theme keeps the semantic CSS palette. */
const darkHighlight = HighlightStyle.define([
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "#6A9955", fontStyle: "italic" },
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.operatorKeyword, t.modifier], color: "#569CD6" },
    { tag: [t.string, t.special(t.string), t.character, t.attributeValue], color: "#CE9178" },
    { tag: [t.regexp, t.escape], color: "#D7BA7D" },
    { tag: [t.number, t.integer, t.float], color: "#B5CEA8" },
    { tag: [t.bool, t.atom, t.self], color: "#569CD6" },
    { tag: t.null, color: "#569CD6" },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName)), t.labelName], color: "#DCDCAA" },
    { tag: [t.typeName, t.className, t.namespace, t.typeOperator], color: "#4EC9B0" },
    { tag: [t.propertyName, t.definition(t.propertyName), t.attributeName], color: "#9CDCFE" },
    { tag: [t.variableName, t.definition(t.variableName), t.local(t.variableName), t.special(t.variableName)], color: "#9CDCFE" },
    { tag: [t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator, t.punctuation, t.bracket, t.paren, t.squareBracket, t.brace, t.separator, t.angleBracket], color: "#D4D4D4" },
    { tag: t.tagName, color: "#569CD6" },
    { tag: [t.heading, t.heading1, t.heading2], color: "#569CD6", fontWeight: "600" },
    { tag: [t.link, t.url], color: "#569CD6" },
    { tag: t.emphasis, fontStyle: "italic", color: "#D4D4D4" },
    { tag: t.strong, fontWeight: "700", color: "#D4D4D4" },
    { tag: t.strikethrough, textDecoration: "line-through", color: "#D4D4D4" },
    { tag: t.quote, color: "#CE9178" },
    { tag: t.monospace, color: "#D4D4D4" },
    { tag: [t.meta, t.processingInstruction], color: "#6A9955" },
    { tag: t.invalid, color: "#F44747" },
]);

const CODE_FONT = 'Consolas, "Cascadia Mono", "Cascadia Code", ui-monospace, monospace';

function chromeTheme(dark: boolean) {
    return EditorView.theme(
        {
            "&": {
                height: "100%",
                fontSize: "var(--editor-font-size, 14px)",
                backgroundColor: "var(--panel)",
                color: dark ? "#D4D4D4" : "var(--text-primary)",
            },
            ".cm-scroller": {
                fontFamily: dark
                    ? CODE_FONT
                    : "var(--editor-font-family, var(--font-mono)), ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
                fontFeatureSettings: '"liga" 0, "calt" 0',
                lineHeight: dark ? "1.35" : "1.55",
                overflow: "auto",
                backgroundColor: "var(--panel)",
                color: dark ? "#D4D4D4" : "var(--text-primary)",
            },
            ".cm-content": {
                caretColor: dark ? "#AEAFAD" : "var(--text-primary)",
                color: dark ? "#D4D4D4" : "var(--text-primary)",
                padding: "12px 0 48px",
                minHeight: "100%",
                fontFamily: "inherit",
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
                borderLeftColor: dark ? "#AEAFAD" : "var(--text-primary)",
            },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
                {
                    backgroundColor: dark
                        ? "#264F78 !important"
                        : "color-mix(in srgb, var(--color-accent) 28%, transparent) !important",
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
                backgroundColor: "var(--panel)",
                color: dark ? "#858585" : "var(--text-disabled)",
                fontFamily: dark ? CODE_FONT : "inherit",
                border: "none",
                borderRight: "1px solid transparent",
                minWidth: "3.25rem",
                paddingLeft: "4px",
            },
            ".cm-gutter, .cm-lineNumbers": {
                backgroundColor: "var(--panel)",
            },
            ".cm-gutterElement": {
                padding: "0 10px 0 8px",
                fontSize: dark ? "13px" : "12px",
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
            ".cm-insertedLine, .cm-insertedChunk, .cm-changedLineGutter.cm-insertedLine": {
                backgroundColor: "color-mix(in srgb, var(--git-added, var(--success)) 14%, transparent) !important",
            },
            ".cm-deletedLine, .cm-deletedChunk, .cm-changedLineGutter.cm-deletedLine": {
                backgroundColor: "color-mix(in srgb, var(--git-deleted, var(--error)) 16%, transparent) !important",
            },
            ".cm-underline": {
                textDecoration: "none !important",
            },
            ".cm-mergeView, .cm-mergeViewEditor, .cm-editor, .cm-scroller, .cm-content": {
                backgroundColor: "var(--panel) !important",
                color: "var(--text-primary)",
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
        syntaxHighlighting(light ? cssHighlight : darkHighlight, { fallback: true }),
        EditorView.contentAttributes.of({
            spellcheck: "false",
            autocorrect: "off",
            autocapitalize: "off",
        }),
    ];
}
