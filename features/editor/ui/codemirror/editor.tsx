"use client";

import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    drawSelection,
    dropCursor,
    rectangularSelection,
    crosshairCursor,
    scrollPastEnd,
} from "@codemirror/view";
import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab,
    indentMore,
    indentLess,
    undo,
    redo,
    selectAll,
} from "@codemirror/commands";
import {
    foldGutter,
    foldKeymap,
    bracketMatching,
    indentOnInput,
    indentUnit,
} from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap, SearchQuery, setSearchQuery, findNext, findPrevious } from "@codemirror/search";
import {
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap,
} from "@codemirror/autocomplete";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { commands } from "@/lib/backend";
import { languageForPath } from "./lang";
import { shapeSyntaxLinter } from "./syntax-lint";
import { SHAPE_CLIP_CODE, rememberShapeClip } from "@/features/chat/lib/shape-clip";
import { shapeEditorChrome } from "./theme";
import { lintGutter } from "@codemirror/lint";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context";

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

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        const lang = languageForPath(path);
        const langCompartment = new Compartment();
        const state = EditorState.create({
            doc: content,
            extensions: [
                ...shapeEditorChrome(),
                search({ top: false }),
                lineNumbers(),
                highlightActiveLineGutter(),
                highlightActiveLine(),
                highlightSpecialChars(),
                history(),
                foldGutter({
                    openText: "▾",
                    closedText: "▸",
                }),
                drawSelection({ cursorBlinkRate: 1100 }),
                dropCursor(),
                scrollPastEnd(),
                EditorState.allowMultipleSelections.of(true),
                EditorState.tabSize.of(4),
                indentUnit.of("    "),
                indentOnInput(),
                bracketMatching({ brackets: "()[]{}«»‹›" }),
                closeBrackets(),
                autocompletion({
                    activateOnTyping: true,
                    maxRenderedOptions: 12,
                    defaultKeymap: true,
                }),
                rectangularSelection(),
                crosshairCursor(),
                highlightSelectionMatches({ highlightWordAroundCursor: true }),
                indentationMarkers({
                    highlightActiveBlock: true,
                    markerType: "codeOnly",
                    thickness: 1,
                    activeThickness: 1.5,
                    colors: {
                        light: "rgba(0,0,0,0.08)",
                        dark: "rgba(255,255,255,0.07)",
                        activeLight: "rgba(0,0,0,0.18)",
                        activeDark: "rgba(255,255,255,0.16)",
                    },
                }),
                keymap.of([
                    ...closeBracketsKeymap,
                    ...defaultKeymap,
                    ...searchKeymap.filter((binding) => binding.key !== "Mod-f"),
                    ...historyKeymap,
                    ...foldKeymap,
                    ...completionKeymap,
                    indentWithTab,
                    { key: "Mod-]", run: indentMore },
                    { key: "Mod-[", run: indentLess },
                ]),
                langCompartment.of(lang ? [lang, shapeSyntaxLinter(path), lintGutter()] : []),
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
                    dragstart(event, view) {
                        const sel = view.state.selection.main;
                        if (sel.empty) return false;
                        const text = view.state.sliceDoc(sel.from, sel.to);
                        if (!text) return false;
                        const path = pathRef.current;
                        event.dataTransfer?.setData(
                            SHAPE_CLIP_CODE,
                            JSON.stringify({ path, text }),
                        );
                        event.dataTransfer?.setData("text/plain", text);
                        rememberShapeClip({ kind: "code", text, label: path });
                        return false;
                    },
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
        const fileName = path.split(/[\\/]/).pop() || path;
        const described = LanguageDescription.matchFilename(languages, fileName);
        if (described) {
            void described.load().then((support) => {
                if (viewRef.current !== view) return;
                view.dispatch({
                    effects: langCompartment.reconfigure([support, shapeSyntaxLinter(path), lintGutter()]),
                });
            }).catch(() => {});
        }
        const onSearch = (event: Event) => {
            const detail = (event as CustomEvent<{
                path?: string;
                query?: string;
                caseSensitive?: boolean;
                regexp?: boolean;
                nav?: "next" | "prev";
            }>).detail;
            if (!detail || detail.path !== pathRef.current) return;
            const query = new SearchQuery({
                search: detail.query || "",
                caseSensitive: Boolean(detail.caseSensitive),
                regexp: Boolean(detail.regexp),
            });
            view.dispatch({ effects: setSearchQuery.of(query) });
            if (detail.nav === "next") findNext(view);
            if (detail.nav === "prev") findPrevious(view);
            let count = 0;
            if (detail.query && query.valid) {
                const cursor = query.getCursor(view.state);
                for (let step = cursor.next(); !step.done; step = cursor.next()) count += 1;
            }
            window.dispatchEvent(
                new CustomEvent("shape-editor-search-count", { detail: { path: pathRef.current, count } }),
            );
        };
        window.addEventListener("shape-editor-search", onSearch as EventListener);
        if (isFirstLoadRef.current) {
            isFirstLoadRef.current = false;
            savedContentRef.current = content;
        }

        return () => {
            window.removeEventListener("shape-editor-search", onSearch as EventListener);
            view.destroy();
            viewRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- content synced separately
    }, [path]);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        const current = view.state.doc.toString();
        if (current === content) return;
        view.dispatch({
            changes: { from: 0, to: current.length, insert: content },
        });
    }, [content]);

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div ref={hostRef} className="h-full min-h-0 w-full overflow-hidden bg-panel" />
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-44">
                <ContextMenuItem
                    onClick={() => {
                        const v = viewRef.current;
                        if (v) undo(v);
                    }}
                >
                    Undo
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => {
                        const v = viewRef.current;
                        if (v) redo(v);
                    }}
                >
                    Redo
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    onClick={() => {
                        const v = viewRef.current;
                        if (!v) return;
                        const sel = v.state.selection.main;
                        const text = v.state.sliceDoc(sel.from, sel.to);
                        if (!text) return;
                        void navigator.clipboard.writeText(text).then(() => {
                            v.dispatch({ changes: { from: sel.from, to: sel.to, insert: "" } });
                        });
                    }}
                >
                    Cut
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => {
                        const v = viewRef.current;
                        if (!v) return;
                        const sel = v.state.selection.main;
                        const text = v.state.sliceDoc(sel.from, sel.to);
                        if (text) void navigator.clipboard.writeText(text);
                    }}
                >
                    Copy
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => {
                        const v = viewRef.current;
                        if (!v) return;
                        void navigator.clipboard.readText().then((text) => {
                            v.dispatch(v.state.replaceSelection(text));
                        });
                    }}
                >
                    Paste
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => {
                        const v = viewRef.current;
                        if (v) selectAll(v);
                    }}
                >
                    Select All
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
