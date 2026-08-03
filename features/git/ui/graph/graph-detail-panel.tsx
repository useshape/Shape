"use client";

import { useEffect, useMemo, useState } from "react";
import { DiffEditor, loader } from "@monaco-editor/react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { FileIcon } from "@/components/ui/file-icon";
import { cn } from "@/lib/utils";
import { commands, type GitFileParams, type GitLogEntry } from "@/lib/backend";
import { defineShapeMonacoThemes, getMonacoEditorOptions } from "@/lib/ui/monaco-theme";
import { bindDiffEditorNativeUiToShape } from "@/lib/editor/suppress-monaco-native-ui";
import { getMonacoLanguage } from "@/features/editor/lsp/languages";
import { resolveGithubAvatarUrl } from "@/lib/git/github-avatar";
import { renderCommitMessage } from "./utils";
import { notify } from "@/features/notifications";

export type GraphDetailSelection =
    | { kind: "commit"; log: GitLogEntry }
    | { kind: "file"; log: GitLogEntry; file: GitFileParams };

function countDiffLines(original: string, modified: string): { added: number; removed: number } {
    const a = original.split("\n");
    const b = modified.split("\n");
    const aCounts = new Map<string, number>();
    for (const line of a) aCounts.set(line, (aCounts.get(line) ?? 0) + 1);
    let shared = 0;
    for (const line of b) {
        const n = aCounts.get(line) ?? 0;
        if (n > 0) {
            aCounts.set(line, n - 1);
            shared += 1;
        }
    }
    return {
        added: Math.max(0, b.length - shared),
        removed: Math.max(0, a.length - shared),
    };
}

function AuthorAvatar({ log, size = 20 }: { log: GitLogEntry; size?: number }) {
    const url = resolveGithubAvatarUrl(log.author_email, log.author, size * 2);
    if (!url) {
        return (
            <span
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-panel-hover text-[10px] font-medium text-text-muted"
                style={{ width: size, height: size }}
            >
                {(log.author || "?").slice(0, 1).toUpperCase()}
            </span>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={url}
            alt=""
            width={size}
            height={size}
            className="shrink-0 rounded-full"
            draggable={false}
        />
    );
}

/** Git Manager window never boots the main editor — wire Monaco the same way. */
function useGitManagerMonaco(): boolean {
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
                console.warn("[Git graph] Monaco bootstrap failed:", err);
                if (!cancelled) setReady(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    return ready;
}

export function GraphDetailPanel({
    selection,
    repoPath,
    onClose,
    onClearFile,
}: {
    selection: GraphDetailSelection | null;
    repoPath: string | null;
    onClose: () => void;
    onClearFile?: () => void;
}) {
    const monacoReady = useGitManagerMonaco();
    const log = selection?.log ?? null;
    const file = selection?.kind === "file" ? selection.file : null;

    const [original, setOriginal] = useState("");
    const [modified, setModified] = useState("");
    const [loadingDiff, setLoadingDiff] = useState(false);

    useEffect(() => {
        if (!file || !log || !repoPath) {
            setOriginal("");
            setModified("");
            return;
        }
        let cancelled = false;
        setLoadingDiff(true);
        void commands
            .gitGetCommitFileContent(repoPath, file.path, log.hash)
            .then(([orig, mod]) => {
                if (cancelled) return;
                setOriginal(orig);
                setModified(mod);
            })
            .catch((e) => {
                if (cancelled) return;
                notify.error("Git", e instanceof Error ? e.message : String(e));
                setOriginal("");
                setModified("");
            })
            .finally(() => {
                if (!cancelled) setLoadingDiff(false);
            });
        return () => {
            cancelled = true;
        };
    }, [file, log, repoPath]);

    const diffStats = useMemo(
        () => (file ? countDiffLines(original, modified) : null),
        [file, original, modified],
    );

    const fileName = file?.path.split(/[\\/]/).pop() || file?.path || "";

    if (!selection || !log) {
        return (
            <div className="workbench-panel flex h-full flex-col items-center justify-center gap-2 border border-border-subtle bg-editor px-6 text-center text-sm text-text-muted">
                <Icon name="commit" size={18} className="opacity-40" />
                <p>Select a commit</p>
            </div>
        );
    }

    return (
        <div className="workbench-panel flex h-full min-w-0 flex-col overflow-hidden border border-border-subtle bg-editor">
            {/* One clean meta line */}
            <div className="flex h-9 shrink-0 items-center gap-2 px-3">
                {file ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 p-0"
                        onClick={onClearFile}
                        title="Back to commit"
                    >
                        <Icon name="arrow_back" size={15} />
                    </Button>
                ) : null}
                <AuthorAvatar log={log} size={18} />
                <span className="shrink-0 text-sm text-text-primary">{log.author}</span>
                {file ? (
                    <>
                        <span className="text-text-disabled">·</span>
                        <FileIcon name={fileName} className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{fileName}</span>
                        {diffStats ? (
                            <span className="shrink-0 tabular-nums text-xs">
                                <span className="text-[var(--git-added)]">+{diffStats.added}</span>
                                {" "}
                                <span className="text-[var(--git-deleted)]">−{diffStats.removed}</span>
                            </span>
                        ) : null}
                    </>
                ) : (
                    <span className="min-w-0 flex-1" />
                )}
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 p-0"
                    onClick={onClose}
                >
                    <Icon name="close" size={15} />
                </Button>
            </div>

            <div className="relative shrink-0 border-b border-border-subtle/60">
                <div
                    className={cn(
                        "no-scrollbar max-h-[7.5rem] overflow-y-auto px-3 py-2.5",
                        "text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-text-primary",
                    )}
                >
                    {renderCommitMessage(log.message)}
                </div>
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-7"
                    style={{
                        background:
                            "linear-gradient(to bottom, transparent, var(--color-editor))",
                    }}
                />
            </div>

            {file ? (
                <div className="graph-diff-panel shape-editor-surface relative min-h-0 flex-1 overflow-hidden">
                    {!monacoReady || loadingDiff ? (
                        <div className="flex h-full items-center justify-center text-sm text-text-muted">
                            Loading diff…
                        </div>
                    ) : (
                        <DiffEditor
                            height="100%"
                            width="100%"
                            original={original}
                            modified={modified}
                            language={getMonacoLanguage(file.path)}
                            theme="shape-dark"
                            loading={<div className="h-full w-full bg-editor" />}
                            beforeMount={(monaco) => {
                                defineShapeMonacoThemes(monaco);
                            }}
                            onMount={(editor, monaco) => {
                                try {
                                    defineShapeMonacoThemes(monaco);
                                    monaco.editor.setTheme("shape-dark");
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const diff = editor as any;
                                    const opts = {
                                        guides: { indentation: false, highlightActiveIndentation: false },
                                        contextmenu: false,
                                        renderLineHighlight: "none" as const,
                                        occurrencesHighlight: "off" as const,
                                        selectionHighlight: false,
                                        renderValidationDecorations: "off" as const,
                                    };
                                    const orig = diff.getOriginalEditor?.();
                                    const mod = diff.getModifiedEditor?.();
                                    orig?.updateOptions?.(opts);
                                    mod?.updateOptions?.(opts);
                                    // Clear the bright default selection/current-line box.
                                    const empty = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
                                    orig?.setSelection?.(empty);
                                    mod?.setSelection?.(empty);
                                    bindDiffEditorNativeUiToShape(diff, monaco);
                                } catch {
                                    /* disposing */
                                }
                            }}
                            options={getMonacoEditorOptions({
                                readOnly: true,
                                originalEditable: false,
                                renderSideBySide: false,
                                automaticLayout: true,
                                contextmenu: false,
                                renderGutterMenu: false,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                stickyScroll: { enabled: false },
                                lineNumbers: "on",
                                folding: false,
                                renderOverviewRuler: false,
                                overviewRulerBorder: false,
                                overviewRulerLanes: 0,
                                hideCursorInOverviewRuler: true,
                                hideUnchangedRegions: { enabled: false },
                                renderLineHighlight: "none",
                                occurrencesHighlight: "off",
                                selectionHighlight: false,
                                padding: { top: 8, bottom: 8 },
                                fontSize: 13,
                                guides: { indentation: false, highlightActiveIndentation: false },
                            })}
                        />
                    )}
                </div>
            ) : (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-muted">
                    Expand the commit and open a file to preview its diff.
                </div>
            )}
        </div>
    );
}
