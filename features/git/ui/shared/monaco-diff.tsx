"use client";

import { useEffect, useRef, useState } from "react";
import { DiffEditor, loader } from "@monaco-editor/react";
import { defineShapeMonacoThemes, getMonacoEditorOptions, shapeMonacoThemeFromColorTheme } from "@/lib/ui/monaco-theme";
import { bindDiffEditorNativeUiToShape } from "@/lib/editor/suppress-monaco-native-ui";
import { getMonacoLanguage } from "@/features/editor/lsp/languages";
import { useSettings } from "@/lib/settings";

/** Bootstrap Monaco for Git Manager windows (main editor never loads there). */
export function useGitManagerMonaco(): boolean {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                type Env = {
                    MonacoEnvironment?: {
                        getWorkerUrl?: (_id: string, label: string) => string;
                        getWorker?: (_id: string, label: string) => Worker;
                    };
                };
                const env = self as typeof globalThis & Env;
                const workerFile = (label: string) => {
                    if (label === "json") return "json.worker.js";
                    if (label === "css" || label === "scss" || label === "less") return "css.worker.js";
                    if (label === "html" || label === "handlebars" || label === "razor") return "html.worker.js";
                    if (label === "typescript" || label === "javascript") return "ts.worker.js";
                    return "editor.worker.js";
                };
                env.MonacoEnvironment = {
                    getWorkerUrl(_id, label) {
                        return `/monaco/${workerFile(label)}`;
                    },
                    getWorker(_id, label) {
                        return new Worker(`/monaco/${workerFile(label)}`);
                    },
                };

                const monaco = await import("monaco-editor");
                loader.config({ monaco });
                const { registerBundledMonacoLanguages } = await import(
                    "@/lib/editor/register-monaco-languages"
                );
                await registerBundledMonacoLanguages();
                defineShapeMonacoThemes(monaco);
                if (!cancelled) setReady(true);
            } catch (err) {
                console.warn("[Git Manager] Monaco bootstrap failed:", err);
                if (!cancelled) setReady(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    return ready;
}

export function ManagerDiffEditor({
    original,
    modified,
    path,
    sideBySide = false,
    active = true,
}: {
    original: string;
    modified: string;
    path: string;
    sideBySide?: boolean;
    /**
     * When false, unmount DiffEditor so Monaco widgets/overlays are disposed and
     * cannot paint over other Git Manager sections (visibility:hidden is not enough).
     */
    active?: boolean;
}) {
    const monacoReady = useGitManagerMonaco();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const diffRef = useRef<any>(null);
    const settings = useSettings();
    const monacoTheme = shapeMonacoThemeFromColorTheme(settings.appearance?.colorTheme);

    useEffect(() => {
        try {
            diffRef.current?.updateOptions?.({ renderSideBySide: sideBySide });
        } catch {
            /* disposing */
        }
    }, [sideBySide]);

    if (!active) return null;
    if (!monacoReady) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
                Loading editor…
            </div>
        );
    }

    return (
        <div className="graph-diff-panel shape-editor-surface relative h-full min-h-0 w-full overflow-hidden">
            <DiffEditor
                key={sideBySide ? "side-by-side" : "inline"}
                height="100%"
                width="100%"
                original={original}
                modified={modified}
                language={getMonacoLanguage(path)}
                theme={monacoTheme}
                loading={<div className="h-full w-full bg-editor" />}
                beforeMount={(monaco) => defineShapeMonacoThemes(monaco)}
                onMount={(editor, monaco) => {
                    try {
                        diffRef.current = editor;
                        defineShapeMonacoThemes(monaco);
                        monaco.editor.setTheme(monacoTheme);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const diff = editor as any;
                        const opts = {
                            guides: { indentation: false, highlightActiveIndentation: false },
                            contextmenu: false,
                            renderLineHighlight: "none" as const,
                            occurrencesHighlight: "off" as const,
                            selectionHighlight: false,
                            renderSideBySide: sideBySide,
                        };
                        diff.updateOptions?.({ renderSideBySide: sideBySide });
                        diff.getOriginalEditor?.()?.updateOptions?.(opts);
                        diff.getModifiedEditor?.()?.updateOptions?.(opts);
                        const empty = {
                            startLineNumber: 1,
                            startColumn: 1,
                            endLineNumber: 1,
                            endColumn: 1,
                        };
                        diff.getOriginalEditor?.()?.setSelection?.(empty);
                        diff.getModifiedEditor?.()?.setSelection?.(empty);
                        bindDiffEditorNativeUiToShape(diff, monaco);
                    } catch {
                        /* disposing */
                    }
                }}
                options={getMonacoEditorOptions({
                    readOnly: true,
                    originalEditable: false,
                    renderSideBySide: sideBySide,
                    automaticLayout: true,
                    contextmenu: false,
                    renderGutterMenu: false,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    stickyScroll: { enabled: false },
                    folding: false,
                    renderOverviewRuler: false,
                    overviewRulerBorder: false,
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    renderLineHighlight: "none",
                    occurrencesHighlight: "off",
                    selectionHighlight: false,
                    padding: { top: 8, bottom: 8 },
                    fontSize: 13,
                    guides: { indentation: false, highlightActiveIndentation: false },
                })}
            />
        </div>
    );
}
