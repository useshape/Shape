"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { useEditorView } from "@/core/providers/editor";
import { useProjectState, commands } from "@/lib/backend";
import { diffLines } from "diff";
import { detectFrameworks } from "../../lsp/frameworks";
import type { ProjectFrameworks } from "../../lsp/frameworks";
import { MarkdownPreview } from "../markdown/markdown";
import { Panel } from "@/features/panels";
import { getMonacoLanguage } from "../../lsp/languages";
import { getFileExtension, isImageExtension, isFontExtension } from "../../lsp/image-types";

// UI Components
import { Breadcrumbs } from "./ui/breadcrumb";
import { PlanEditorHeader } from "./ui/plan-editor-header";
import { DiagnosticsIndicator } from "./ui/diagnostics";
import { ErrorView } from "./ui/error";
import { ImageView } from "./ui/image";
import { FontView } from "./ui/font";

// Hooks — load Monaco workers before pulling in @monaco-editor/react (via editor-view/diff).
import { getProposedEdit, clearProposedEdit, isFileResolvedForCurrentConversation } from "../../../chat/lib/proposed-edits";
import { useMonacoWorkers } from "./hooks/use-monaco-workers";
import { useFileContent } from "./hooks/use-file-content";
import { useImageLoader } from "./hooks/use-image-loader";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";

import type { EditorGroupId } from "@/core/providers/editor";
import { isPlanFilePath } from "@/lib/plan-file";

const CodeEditorView = React.lazy(() =>
    import("./ui/editor-view").then((m) => ({ default: m.CodeEditorView })),
);
const DiffView = React.lazy(() =>
    import("./ui/diff").then((m) => ({ default: m.DiffView })),
);

// Main file viewer component handling various file types (text, image, markdown)
export default function FileViewer({ path, group = "left" }: { path: string; group?: EditorGroupId }) {
    const { getViewMode } = useEditorView();
    // getFileExtension handles diff: prefixes and display-name suffixes like " (abc1234)"
    const ext = useMemo(() => getFileExtension(path), [path]);
    const isSvg = ext === "svg";
    const isFont = useMemo(() => isFontExtension(ext), [ext]);
    const isImage = useMemo(() => isImageExtension(ext), [ext]);
    const isRasterImage = isImage && !isSvg;
    const isMarkdown = /\.(md|mdx|markdown)$/i.test(path);
    const isPlanFile = isPlanFilePath(path);
    const defaultMode = isImage || isFont ? "preview" : "raw";
    const mode = getViewMode(path, defaultMode);
    const showImagePreview = isImage && (mode === "preview" || mode === "split");
    const showFontPreview = isFont && (mode === "preview" || mode === "split");
    const skipTextContent = isRasterImage || (isSvg && showImagePreview) || (isFont && showFontPreview);

    const { open_files, project_path } = useProjectState();
    const [frameworks, setFrameworks] = useState<ProjectFrameworks | null>(null);

    useEffect(() => {
        if (project_path) {
            detectFrameworks(project_path).then(setFrameworks);
        }
    }, [project_path]);

    const fileInfo = useMemo(() => open_files.find(f => f.path === path), [path, open_files]);
    const isDiff = fileInfo?.kind === 'diff';

    // Core Refs
    const savedContentRef = useRef<string>("");
    const bufferVersionRef = useRef(0);
    const isFirstLoadRef = useRef(true);
    const previewRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const isDirty = useMemo(() => open_files.find(f => f.path === path)?.is_dirty || false, [path, open_files]);
    const isDirtyRef = useRef(isDirty);
    const markdownUndoRef = useRef<string[]>([]);
    const markdownRedoRef = useRef<string[]>([]);

    useEffect(() => {
        isDirtyRef.current = isDirty;
    }, [isDirty]);

    useEffect(() => {
        markdownUndoRef.current = [];
        markdownRedoRef.current = [];
    }, [path]);

    // Handle initial path load race conditions
    const lastPathRef = useRef(path);
    useEffect(() => {
        if (path !== lastPathRef.current) {
            lastPathRef.current = path;
            isFirstLoadRef.current = true;
        }
    }, [path]);

    const [diffState, setDiffState] = useState<{
        original: string;
        replacement: string;
        snippetOriginal: string;
        snippetReplacement: string;
        /** Undo target for the unresolved edit chain. */
        baseline: string;
        path: string;
    } | null>(null);

    const { content, setContent, originalContent, error, loading } = useFileContent(
        path, skipTextContent, isDiff, savedContentRef, bufferVersionRef
    );

    useEffect(() => {
        const constructDiff = (origText: string, replText: string) => {
            if (!content) return { original: origText, replacement: replText };
            const nContent = content.replace(/\r\n/g, '\n');
            const nOrig = origText.replace(/\r\n/g, '\n');
            const nRepl = replText.replace(/\r\n/g, '\n');

            if (nOrig.trim() === "") {
                return { original: nContent, replacement: nRepl };
            }

            if (nContent.includes(nOrig)) {
                return { original: nContent, replacement: nContent.replace(nOrig, nRepl) };
            }

            const origTrimmed = nOrig.trim();
            if (origTrimmed && nContent.includes(origTrimmed)) {
                return { original: nContent, replacement: nContent.replace(origTrimmed, nRepl.trim()) };
            }

            // Case B: File is already in modified state (contains nRepl)
            if (nContent.includes(nRepl)) {
                return { original: nContent.replace(nRepl, nOrig), replacement: nContent };
            }

            const replTrimmed = nRepl.trim();
            if (replTrimmed && nContent.includes(replTrimmed)) {
                return { original: nContent.replace(replTrimmed, nOrig.trim()), replacement: nContent };
            }

            // Fallback sliding window fuzzy match
            const contentLines = nContent.split('\n');
            const origLines = nOrig.split('\n').map(l => l.trim()).filter(Boolean);
            if (origLines.length > 0) {
                const startIdx = contentLines.findIndex(l => l.trim() === origLines[0]);
                if (startIdx !== -1) {
                    // Try to see if next lines match roughly
                    const endIdx = startIdx + origLines.length;
                    const before = contentLines.slice(0, startIdx).join('\n');
                    const after = contentLines.slice(endIdx).join('\n');
                    return {
                        original: nContent,
                        replacement: (before ? before + '\n' : '') + nRepl + (after ? '\n' + after : '')
                    };
                }
            }

            return { original: nContent, replacement: nContent }; // Default to no-op if we really can't find it to avoid destroying file content
        };

        const applyDiffState = (
            origText: string,
            replText: string,
            snippetOriginal: string,
            snippetReplacement: string,
            baseline?: string,
        ) => {
            if (isFileResolvedForCurrentConversation(path, replText)) {
                setDiffState(null);
                return;
            }
            const diff = constructDiff(origText, replText);
            if (diff.original === diff.replacement) {
                setDiffState(null);
                return;
            }
            setDiffState({
                path,
                original: diff.original,
                replacement: diff.replacement,
                snippetOriginal,
                snippetReplacement,
                baseline: baseline ?? origText,
            });
        };

        const checkProposed = () => {
            const proposed = getProposedEdit(path);
            if (proposed) {
                applyDiffState(
                    proposed.original,
                    proposed.replacement,
                    proposed.original,
                    proposed.replacement,
                    proposed.baseline ?? proposed.original,
                );
            } else {
                setDiffState(null);
            }
        };

        checkProposed();

        const handleProposedChange = () => {
            checkProposed();
        };

        const handlePreviewDiff = (e: Event) => {
            const custom = e as CustomEvent<{ path: string; original: string; replacement: string }>;
            const eventPath = custom.detail.path.replace(/\\/g, '/').toLowerCase();
            const currentPath = path.replace(/\\/g, '/').toLowerCase();

            const eventBase = eventPath.split('/').pop() || '';
            const currentBase = currentPath.split('/').pop() || '';
            const pathsMatch = eventPath === currentPath
                || currentPath.endsWith('/' + eventPath)
                || eventPath.endsWith('/' + currentPath)
                || currentPath.endsWith(eventPath)
                || (eventBase === currentBase && eventBase.length > 0);

            if (pathsMatch) {
                if (
                    isFileResolvedForCurrentConversation(path, custom.detail.replacement)
                    || isFileResolvedForCurrentConversation(custom.detail.path, custom.detail.replacement)
                ) {
                    setDiffState(null);
                    return;
                }
                const proposed = getProposedEdit(path) || getProposedEdit(custom.detail.path);
                applyDiffState(
                    custom.detail.original,
                    custom.detail.replacement,
                    custom.detail.original,
                    custom.detail.replacement,
                    proposed?.baseline ?? custom.detail.original,
                );
            }
        };

        // Listen for dismiss-diff events from the pending edits panel
        const handleDismissDiff = (e: Event) => {
            const custom = e as CustomEvent<{ path: string; rawPath?: string }>;
            const eventPath = (custom.detail.path || '').replace(/\\/g, '/').toLowerCase();
            const rawPath = (custom.detail.rawPath || '').replace(/\\/g, '/').toLowerCase();
            const currentPath = path.replace(/\\/g, '/').toLowerCase();

            const eventBase = eventPath.split('/').pop() || '';
            const currentBase = currentPath.split('/').pop() || '';
            const pathsMatch = eventPath === currentPath
                || currentPath.endsWith('/' + eventPath)
                || eventPath.endsWith('/' + currentPath)
                || currentPath.endsWith(eventPath)
                || currentPath.endsWith('/' + rawPath)
                || rawPath.endsWith('/' + currentPath)
                || currentPath.endsWith(rawPath)
                || (eventBase === currentBase && eventBase.length > 0);

            if (pathsMatch) {
                setDiffState(null);
            }
        };

        window.addEventListener("shape-proposed-edits-changed", handleProposedChange);
        window.addEventListener("shape-editor-preview-diff", handlePreviewDiff as EventListener);
        window.addEventListener("shape-dismiss-diff", handleDismissDiff as EventListener);
        return () => {
            window.removeEventListener("shape-proposed-edits-changed", handleProposedChange);
            window.removeEventListener("shape-editor-preview-diff", handlePreviewDiff as EventListener);
            window.removeEventListener("shape-dismiss-diff", handleDismissDiff as EventListener);
        };
    }, [path, content]);

    const { additions, deletions } = useMemo(() => {
        if (!diffState) return { additions: 0, deletions: 0 };
        const changes = diffLines(diffState.original, diffState.replacement);
        let add = 0;
        let del = 0;
        changes.forEach(c => {
            if (c.added) add += c.value.split('\n').length - 1 || 1;
            if (c.removed) del += c.value.split('\n').length - 1 || 1;
        });
        return { additions: add, deletions: del };
    }, [diffState]);

    const monacoReady = useMonacoWorkers();
    const { imageSrc, svgContent, error: imageLoadError } = useImageLoader(path, showImagePreview);

    const [zoom, setZoom] = useState(1);
    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            setZoom(prev => Math.min(Math.max(prev + delta, 0.1), 10));
        }
    };

    // Preview-only markdown has no Monaco — wire Save / Undo / Redo here.
    // Must stay above early returns so hook order is stable across renders.
    useEffect(() => {
        if (!(isMarkdown && mode === "preview")) return;

        const handleSave = async () => {
            try {
                await commands.saveFile(path, content);
                savedContentRef.current = content;
                isDirtyRef.current = false;
                await commands.markFileDirty(path, false);
                const { clearDirtyBuffer } = await import("@/lib/dirty-buffers");
                clearDirtyBuffer(path);
            } catch (e) {
                const { notify } = await import("@/features/notifications");
                notify.error("Save Error", `Failed to save file: ${e instanceof Error ? e.message : String(e)}`, {
                    code: 4000,
                });
            }
        };

        const handleEditorAction = (event: Event) => {
            const action = (event as CustomEvent<{ action?: string }>).detail?.action;
            if (action === "undo") {
                const prev = markdownUndoRef.current.pop();
                if (prev === undefined) return;
                markdownRedoRef.current.push(content);
                setContent(prev);
                const dirty = prev !== savedContentRef.current;
                isDirtyRef.current = dirty;
                void commands.markFileDirty(path, dirty);
                void import("@/lib/dirty-buffers").then(({ saveDirtyBuffer, clearDirtyBuffer }) => {
                    if (dirty) saveDirtyBuffer(path, prev, savedContentRef.current);
                    else clearDirtyBuffer(path);
                });
            } else if (action === "redo") {
                const next = markdownRedoRef.current.pop();
                if (next === undefined) return;
                markdownUndoRef.current.push(content);
                setContent(next);
                const dirty = next !== savedContentRef.current;
                isDirtyRef.current = dirty;
                void commands.markFileDirty(path, dirty);
                void import("@/lib/dirty-buffers").then(({ saveDirtyBuffer, clearDirtyBuffer }) => {
                    if (dirty) saveDirtyBuffer(path, next, savedContentRef.current);
                    else clearDirtyBuffer(path);
                });
            }
        };

        window.addEventListener("save-request", handleSave);
        window.addEventListener("shape-editor-action", handleEditorAction as EventListener);
        return () => {
            window.removeEventListener("save-request", handleSave);
            window.removeEventListener("shape-editor-action", handleEditorAction as EventListener);
        };
    }, [isMarkdown, mode, path, content, setContent]);

    if (error) {
        return <ErrorView error={error} />;
    }

    if (showFontPreview) {
        return <FontView path={path.replace(/^diff:(un)?staged:/, "")} />;
    }

    if (showImagePreview) {
        return (
            <div className="flex h-full min-h-0 w-full flex-col bg-editor overflow-hidden relative">
                <div className="flex w-full items-center justify-between pr-2 min-h-[28px] shrink-0 gap-1 bg-editor">
                    <Breadcrumbs path={path} projectPath={project_path} isDiff={isDiff} isImage className="flex-1 min-w-0" />
                </div>
                <div className="relative min-h-0 w-full flex-1 overflow-hidden">
                    <ImageView
                        path={path}
                        imageSrc={imageSrc}
                        svgContent={svgContent}
                        loadError={imageLoadError}
                        zoom={zoom}
                        onZoomChange={setZoom}
                        containerRef={containerRef}
                        handleWheel={handleWheel}
                    />
                </div>
            </div>
        );
    }

    if (!monacoReady) {
        return <div className="flex-1 w-full h-full min-h-0 bg-background" />;
    }

    if (loading) {
        return <div className="flex-1 w-full h-full min-h-0 bg-editor" />;
    }

    const renderDiffEditor = () => {
        return (
            <React.Suspense fallback={<div className="flex-1 w-full h-full min-h-0 bg-editor" />}>
                <DiffView
                    path={path}
                    originalContent={originalContent}
                    content={content}
                    getLanguage={getMonacoLanguage}
                />
            </React.Suspense>
        );
    };

    const renderEditor = () => {
        if (isDiff) return renderDiffEditor();
        return (
            <div className="flex flex-col w-full h-full min-h-0 bg-editor overflow-hidden relative">
                {isPlanFile ? (
                    <PlanEditorHeader path={path} />
                ) : (
                    <div className="flex w-full items-center justify-between pr-2 min-h-[28px] shrink-0">
                        <DiagnosticsIndicator path={path} />
                        <Breadcrumbs path={path} projectPath={project_path} isDiff={isDiff} className="flex-1 min-w-0" />
                        <div className="flex items-center gap-1 shrink-0">
                    {diffState && (
                        <div className="flex items-center gap-2 pl-2 border-l border-border-subtle h-[28px] shrink-0">
                            <div className="flex items-center gap-1.5 font-sans text-xs font-medium mr-1">
                                <span className="text-success">+{additions}</span>
                                <span className="text-error">-{deletions}</span>
                            </div>
                            <span className="text-sm font-medium text-text-secondary">Reviewing changes</span>
                            <Button
                                variant="ghost"
                                size="xs"
                                onClick={async () => {
                                    try {
                                        window.dispatchEvent(new CustomEvent('shape-editor-edit-action', {
                                            detail: {
                                                path: diffState.path,
                                                action: 'rejected',
                                                replacement: diffState.replacement,
                                            }
                                        }));
                                        await commands.applyFileEdit(
                                            diffState.path,
                                            "",
                                            diffState.baseline || diffState.snippetOriginal,
                                        );
                                        clearProposedEdit(diffState.path);
                                        window.dispatchEvent(new CustomEvent('shape-dismiss-diff', {
                                            detail: { path: diffState.path, rawPath: diffState.path }
                                        }));
                                        setDiffState(null);
                                    } catch (e) { console.error("Failed to revert diff:", e) }
                                }}
                            >
                                Revert
                            </Button>
                            <Button
                                variant="default"
                                size="xs"
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('shape-editor-edit-action', {
                                        detail: {
                                            path: diffState.path,
                                            action: 'applied',
                                            replacement: diffState.replacement,
                                        }
                                    }));
                                    clearProposedEdit(diffState.path);
                                    window.dispatchEvent(new CustomEvent('shape-dismiss-diff', {
                                        detail: { path: diffState.path, rawPath: diffState.path }
                                    }));
                                    setDiffState(null);
                                }}
                            >
                                Accept
                            </Button>
                        </div>
                    )}
                    </div>
                </div>
                )}
                <div className="flex-1 w-full min-h-0 overflow-hidden relative">
                    <React.Suspense fallback={<div className="flex-1 w-full h-full min-h-0 bg-editor" />}>
                    <CodeEditorView
                        path={path}
                        group={group}
                        content={content}
                        setContent={setContent}
                        savedContentRef={savedContentRef}
                        isDirtyRef={isDirtyRef}
                        bufferVersionRef={bufferVersionRef}
                        isFirstLoadRef={isFirstLoadRef}
                        projectPath={project_path}
                        frameworks={frameworks}
                        monacoReady={monacoReady}
                        diffState={diffState}
                    />
                    </React.Suspense>
                </div>
            </div>
        );
    };

    const applyMarkdownContent = async (next: string) => {
        // Split view has Monaco — apply through the editor so Ctrl+Z uses its undo stack.
        if (mode === "split") {
            window.dispatchEvent(
                new CustomEvent("shape-markdown-apply-content", {
                    detail: { path, content: next },
                }),
            );
            return;
        }
        // Preview-only mode has no Monaco — keep a small local undo stack.
        const prev = content;
        if (prev !== next) {
            markdownUndoRef.current.push(prev);
            if (markdownUndoRef.current.length > 100) markdownUndoRef.current.shift();
            markdownRedoRef.current = [];
        }
        setContent(next);
        isDirtyRef.current = true;
        try {
            await commands.markFileDirty(path, true);
        } catch {
            /* ignore */
        }
        const { saveDirtyBuffer } = await import("@/lib/dirty-buffers");
        saveDirtyBuffer(path, next, savedContentRef.current);
    };

    if (isMarkdown && mode === "preview") {
        return (
            <div className="flex flex-col w-full h-full min-h-0 bg-editor overflow-hidden relative">
                {isPlanFile ? (
                    <PlanEditorHeader path={path} />
                ) : (
                    <div className="flex w-full items-center justify-between pr-2">
                        <Breadcrumbs path={path} projectPath={project_path} isDiff={isDiff} className="flex-1 min-w-0" />
                    </div>
                )}
                <div className="flex-1 w-full min-h-0 overflow-hidden relative border-t border-border-subtle/20">
                    <MarkdownPreview
                        ref={previewRef}
                        content={content}
                        filePath={path}
                        projectPath={project_path}
                        onApplyContent={(next) => void applyMarkdownContent(next)}
                    />
                </div>
            </div>
        );
    }

    if (isMarkdown && mode === "split") {
        return (
            <div className="flex-1 w-full h-full min-h-0 overflow-hidden outline-none focus:outline-none">
                <Panel
                    storageKey={`md-split-${path}`}
                    panes={[
                        {
                            id: "md-editor",
                            minSize: 150,
                            preferredSize: 500,
                            children: renderEditor(),
                        },
                        {
                            id: "md-preview",
                            minSize: 150,
                            flexible: true,
                            children: (
                                <MarkdownPreview
                                    ref={previewRef}
                                    content={content}
                                    filePath={path}
                                    projectPath={project_path}
                                    onApplyContent={(next) => void applyMarkdownContent(next)}
                                />
                            ),
                        },
                    ]}
                />
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden relative">
            {renderEditor()}
        </div>
    );
}
