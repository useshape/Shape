"use client";

import React, { useRef, useCallback, useState, useEffect } from "react";
import { DiffEditor } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuTrigger,
} from "@/components/ui/context";
import { defineShapeMonacoThemes, getMonacoEditorOptions } from "@/lib/ui/monaco-theme";
import { useProjectState } from "@/lib/backend";
import { resolveRepoForFile } from "@/lib/git/repos";
import {
    DiffHunkToolbar,
    parseDiffTabPath,
    useDiffHunkState,
} from "@/features/git/ui/shared/diff-hunks";
import { bindDiffEditorNativeUiToShape } from "@/lib/editor/suppress-monaco-native-ui";

interface DiffViewProps {
    path: string;
    originalContent: string;
    content: string;
    getLanguage: (path: string) => string;
}

export function DiffView({ path, originalContent, content, getLanguage }: DiffViewProps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monacoRef = useRef<any>(null);
    const [mounted, setMounted] = useState(true);
    const [modifiedEditor, setModifiedEditor] = useState<MonacoEditor.ICodeEditor | null>(null);
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
    const { project_path } = useProjectState();
    const [repoPath, setRepoPath] = useState<string | null>(null);

    const { mode, filePath: realPath } = parseDiffTabPath(path);
    const displayPath =
        path.startsWith("diff:commit:")
            ? (() => {
                  const match = path.match(/^diff:commit:([^:]+):(.+)$/);
                  return match ? match[2] : path.split(":").slice(3).join(":");
              })()
            : realPath;

    useEffect(() => {
        if (!project_path || !mode) {
            setRepoPath(null);
            return;
        }
        let cancelled = false;
        void resolveRepoForFile(project_path, displayPath).then((resolved) => {
            if (!cancelled) setRepoPath(resolved ?? project_path);
        });
        return () => {
            cancelled = true;
        };
    }, [project_path, displayPath, mode]);

    const hunkState = useDiffHunkState(repoPath, displayPath, mode, modifiedEditor);

    const handleEditorAction = useCallback((action: string) => {
        const editor = editorRef.current;
        if (!editor || !mounted) return;

        try {
            switch (action) {
                case "copy": editor.focus(); document.execCommand('copy'); break;
                case "selectAll": {
                    const mod = editor.getModifiedEditor?.();
                    if (!mod) return;
                    const model = mod.getModel?.();
                    if (!model || model.isDisposed?.()) return;
                    mod.setSelection(model.getFullModelRange());
                    break;
                }
                case "commandPalette": {
                    window.dispatchEvent(new CustomEvent("shape-command-palette"));
                    break;
                }
            }
        } catch {
            // Editor model may already be disposed during tab switches.
        }
    }, [mounted]);

    if (!mounted) {
        return <div className="flex-1 w-full h-full bg-background" />;
    }

    return (
        <div ref={setContainerEl} className="shape-editor-surface relative flex h-full w-full flex-col">
        {mode && repoPath && hunkState.hunks.length > 0 && (
            <DiffHunkToolbar
                repoPath={repoPath}
                filePath={displayPath}
                mode={mode}
                hunks={hunkState.hunks}
                activeHunkIndex={hunkState.activeHunkIndex}
                selectedNewLines={hunkState.selectedNewLines}
                modifiedEditor={modifiedEditor}
                containerEl={containerEl}
                onDone={hunkState.reload}
            />
        )}
        <ContextMenu>
            <ContextMenuTrigger className="w-full h-full outline-none focus:outline-none">
                <DiffEditor
                    key={path}
                    height="100%"
                    original={originalContent}
                    modified={content}
                    language={getLanguage(displayPath)}
                    theme="shape-dark"
                    loading={<div className="flex-1 w-full h-full bg-background" />}
                    beforeMount={(monaco) => {
                        monacoRef.current = monaco;
                        defineShapeMonacoThemes(monaco);
                    }}
                    onMount={(editor, monaco) => {
                        editorRef.current = editor;
                        monacoRef.current = monaco;
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const diffEditor = editor as any;
                            const originalEditor = diffEditor.getOriginalEditor?.();
                            const mod = diffEditor.getModifiedEditor?.() ?? null;
                            setModifiedEditor(mod);
                            const guideOptions = {
                                guides: { indentation: false, highlightActiveIndentation: false },
                                contextmenu: false,
                            };
                            originalEditor?.updateOptions?.(guideOptions);
                            mod?.updateOptions?.(guideOptions);
                            defineShapeMonacoThemes(monaco);
                            bindDiffEditorNativeUiToShape(diffEditor, monaco);
                        } catch {
                            // Diff editor may already be disposing.
                        }
                        const handleActionsRequest = () => {
                            if (!editorRef.current) return;
                            const mod = editor.getModifiedEditor?.();
                            if (!mod) return;
                            const supported = mod.getSupportedActions?.() || [];
                            const editorActions = supported.map((a: { id: string; label: string; run: () => void }) => ({
                                id: a.id,
                                label: a.label || a.id,
                                keybindings: [],
                                run: () => { mod.focus(); a.run(); },
                            }));
                            window.dispatchEvent(
                                new CustomEvent("shape-command-palette-actions-response", {
                                    detail: editorActions,
                                })
                            );
                        };
                        window.addEventListener("shape-command-palette-actions-request", handleActionsRequest);
                        editor.onDidDispose(() => {
                            editorRef.current = null;
                            setModifiedEditor(null);
                            setMounted(false);
                            window.removeEventListener("shape-command-palette-actions-request", handleActionsRequest);
                        });
                    }}
                    options={getMonacoEditorOptions({
                        renderSideBySide: false,
                        automaticLayout: true,
                        readOnly: true,
                        contextmenu: false,
                        renderGutterMenu: false,
                        guides: { indentation: false, highlightActiveIndentation: false },
                    })}
                />
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={() => handleEditorAction("copy")}>
                    Copy
                    <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleEditorAction("selectAll")}>
                    Select All
                    <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleEditorAction("commandPalette")}>
                    Command Palette
                    <ContextMenuShortcut>Ctrl+Shift+P</ContextMenuShortcut>
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
        </div>
    );
}
