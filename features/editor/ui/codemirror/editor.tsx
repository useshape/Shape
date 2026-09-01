"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLine,
    highlightActiveLineGutter,
    drawSelection,
    dropCursor,
    rectangularSelection,
    crosshairCursor,
} from "@codemirror/view";
import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab,
} from "@codemirror/commands";
import {
    foldGutter,
    foldKeymap,
    bracketMatching,
    indentOnInput,
    syntaxHighlighting,
    defaultHighlightStyle,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { commands } from "@/lib/backend";
import { languageForPath } from "./lang";

const shapeTheme = EditorView.theme(
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
            lineHeight: "1.6",
            overflow: "auto",
        },
        ".cm-content": {
            caretColor: "var(--color-text-primary)",
            padding: "10px 0 24px",
            minHeight: "100%",
        },
        ".cm-line": {
            padding: "0 12px 0 4px",
        },
        ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "var(--color-text-primary)",
        },
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
            backgroundColor: "color-mix(in srgb, var(--color-accent) 22%, transparent)",
        },
        ".cm-activeLine": {
            backgroundColor: "color-mix(in srgb, var(--color-panel-hover) 55%, transparent)",
        },
        ".cm-gutters": {
            backgroundColor: "var(--color-panel)",
            color: "var(--color-text-disabled, var(--color-text-muted))",
            border: "none",
            borderRight: "1px solid var(--color-border-subtle)",
            minWidth: "3rem",
        },
        ".cm-gutterElement": {
            padding: "0 8px 0 12px",
            fontSize: "12px",
        },
        ".cm-activeLineGutter": {
            backgroundColor: "transparent",
            color: "var(--color-text-secondary)",
        },
        ".cm-foldPlaceholder": {
            backgroundColor: "var(--color-surface-3)",
            border: "none",
            color: "var(--color-text-muted)",
        },
    },
    { dark: true },
);

export function CodeMirrorEditor({
    path,
    content,
    setContent,
    savedContentRef,
    isDirtyRef,
    bufferVersionRef,
    isFirstLoadRef,
}: {
    path: string;
    content: string;
    setContent: (v: string) => void;
    savedContentRef: React.MutableRefObject<string>;
    isDirtyRef: React.MutableRefObject<boolean>;
    bufferVersionRef: React.MutableRefObject<number>;
    isFirstLoadRef: React.MutableRefObject<boolean>;
}) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const pathRef = useRef(path);
    const setContentRef = useRef(setContent);
    setContentRef.current = setContent;

    // Mount editor once; recreate language when path changes.
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        const lang = languageForPath(path);
        const state = EditorState.create({
            doc: content,
            extensions: [
                lineNumbers(),
                highlightActiveLineGutter(),
                highlightActiveLine(),
                history(),
                foldGutter(),
                drawSelection(),
                dropCursor(),
                EditorState.allowMultipleSelections.of(true),
                indentOnInput(),
                bracketMatching(),
                closeBrackets(),
                autocompletion(),
                rectangularSelection(),
                crosshairCursor(),
                highlightSelectionMatches(),
                syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
                keymap.of([
                    ...closeBracketsKeymap,
                    ...defaultKeymap,
                    ...searchKeymap,
                    ...historyKeymap,
                    ...foldKeymap,
                    ...completionKeymap,
                    indentWithTab,
                ]),
                shapeTheme,
                ...(lang ? [lang] : []),
                EditorView.updateListener.of((update) => {
                    if (!update.docChanged) return;
                    const next = update.state.doc.toString();
                    setContentRef.current(next);
                    const dirty = next !== savedContentRef.current;
                    isDirtyRef.current = dirty;
                    bufferVersionRef.current += 1;
                    void commands.markFileDirty(pathRef.current, dirty);
                }),
                EditorView.domEventHandlers({
                    keydown(e) {
                        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                            e.preventDefault();
                            const view = viewRef.current;
                            if (!view) return true;
                            const text = view.state.doc.toString();
                            void (async () => {
                                try {
                                    await commands.saveFile(pathRef.current, text);
                                    savedContentRef.current = text;
                                    isDirtyRef.current = false;
                                    void commands.markFileDirty(pathRef.current, false);
                                } catch {
                                    /* ignore */
                                }
                            })();
                            return true;
                        }
                        return false;
                    },
                }),
            ],
        });

        const view = new EditorView({ state, parent: host });
        viewRef.current = view;
        pathRef.current = path;
        if (isFirstLoadRef.current) {
            isFirstLoadRef.current = false;
            savedContentRef.current = content;
        }

        return () => {
            view.destroy();
            viewRef.current = null;
        };
        // Recreate when path changes (language + dirty tracking).
        // eslint-disable-next-line react-hooks/exhaustive-deps -- content synced separately
    }, [path]);

    // External content updates (reload / undo from outside).
    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        const current = view.state.doc.toString();
        if (current === content) return;
        view.dispatch({
            changes: { from: 0, to: current.length, insert: content },
        });
    }, [content]);

    return <div ref={hostRef} className="h-full min-h-0 w-full overflow-hidden bg-editor" />;
}
