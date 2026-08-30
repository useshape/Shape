"use client";

import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend";
import { getMonacoLanguage } from "@/features/editor/lsp/languages";
import { getShapeSyntaxTheme } from "@/lib/ui/syntax-theme";

const SyntaxHighlighter = lazy(() =>
    import("react-syntax-highlighter").then((m) => ({
        default: m.Prism as React.ComponentType<{
            language?: string;
            style?: Record<string, React.CSSProperties>;
            PreTag?: string;
            CodeTag?: string;
            customStyle?: React.CSSProperties;
            codeTagProps?: Record<string, unknown>;
            children: string;
        }>,
    })),
);

function lineCount(text: string) {
    if (!text) return 1;
    let n = 1;
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) n++;
    }
    return n;
}

/** Map path / Monaco id → Prism language id. */
function prismLanguage(path: string, monacoLang: string): string {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    switch (ext) {
        case "tsx":
            return "tsx";
        case "jsx":
            return "jsx";
        case "ts":
        case "mts":
        case "cts":
            return "typescript";
        case "js":
        case "mjs":
        case "cjs":
            return "javascript";
        case "json":
        case "jsonc":
            return "json";
        case "css":
            return "css";
        case "scss":
        case "sass":
            return "scss";
        case "html":
        case "htm":
        case "vue":
        case "svelte":
        case "astro":
            return "markup";
        case "md":
        case "mdx":
            return "markdown";
        case "py":
            return "python";
        case "rs":
            return "rust";
        case "go":
            return "go";
        case "java":
            return "java";
        case "rb":
            return "ruby";
        case "php":
            return "php";
        case "sh":
        case "bash":
        case "zsh":
            return "bash";
        case "ps1":
            return "powershell";
        case "yml":
        case "yaml":
            return "yaml";
        case "toml":
        case "ini":
        case "env":
            return "ini";
        case "sql":
            return "sql";
        case "graphql":
        case "gql":
            return "graphql";
        case "c":
        case "h":
            return "c";
        case "cpp":
        case "hpp":
        case "cc":
            return "cpp";
        case "cs":
            return "csharp";
        case "swift":
            return "swift";
        case "kt":
            return "kotlin";
        case "dart":
            return "dart";
        case "lua":
            return "lua";
        case "r":
            return "r";
        case "dockerfile":
            return "docker";
        default:
            break;
    }
    if (monacoLang === "plaintext" || monacoLang === "text") return "text";
    if (monacoLang === "shell") return "bash";
    if (monacoLang === "html") return "markup";
    return monacoLang || "text";
}

/**
 * Lightweight textarea editor with Prism overlay coloring — no Monaco, no LSP.
 * Keeps save / dirty-buffer behavior compatible with the rest of Shape.
 */
export function SimpleCodeEditor({
    path,
    content,
    setContent,
    savedContentRef,
    isDirtyRef,
    bufferVersionRef,
    isFirstLoadRef,
    readOnly = false,
}: {
    path: string;
    content: string;
    setContent: (v: string) => void;
    savedContentRef: React.MutableRefObject<string>;
    isDirtyRef: React.MutableRefObject<boolean>;
    bufferVersionRef: React.MutableRefObject<number>;
    isFirstLoadRef: React.MutableRefObject<boolean>;
    readOnly?: boolean;
}) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const gutterRef = useRef<HTMLDivElement>(null);
    const highlightRef = useRef<HTMLDivElement>(null);
    const language = useMemo(() => getMonacoLanguage(path), [path]);
    const prismLang = useMemo(() => prismLanguage(path, language), [path, language]);
    const lines = useMemo(() => lineCount(content), [content]);
    const highlightSource = content.endsWith("\n") ? `${content}\n` : content || " ";

    const syncScroll = useCallback(() => {
        const ta = textareaRef.current;
        const gutter = gutterRef.current;
        const highlight = highlightRef.current;
        if (!ta) return;
        if (gutter) gutter.scrollTop = ta.scrollTop;
        if (highlight) {
            highlight.scrollTop = ta.scrollTop;
            highlight.scrollLeft = ta.scrollLeft;
        }
    }, []);

    const persistDirty = useCallback(
        async (next: string) => {
            const dirty = next !== savedContentRef.current;
            isDirtyRef.current = dirty;
            try {
                await commands.markFileDirty(path, dirty);
            } catch {
                /* ignore */
            }
            const { saveDirtyBuffer, clearDirtyBuffer } = await import("@/lib/dirty-buffers");
            if (dirty) saveDirtyBuffer(path, next, savedContentRef.current);
            else clearDirtyBuffer(path);
        },
        [path, savedContentRef, isDirtyRef],
    );

    const onChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const next = e.target.value;
            bufferVersionRef.current += 1;
            isFirstLoadRef.current = false;
            setContent(next);
            void persistDirty(next);
        },
        [setContent, persistDirty, bufferVersionRef, isFirstLoadRef],
    );

    useEffect(() => {
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

        window.addEventListener("save-request", handleSave);
        return () => window.removeEventListener("save-request", handleSave);
    }, [path, content, savedContentRef, isDirtyRef]);

    const onKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key !== "Tab" || readOnly) return;
            e.preventDefault();
            const ta = e.currentTarget;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const insert = "  ";
            const next = content.slice(0, start) + insert + content.slice(end);
            bufferVersionRef.current += 1;
            setContent(next);
            void persistDirty(next);
            requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = start + insert.length;
            });
        },
        [content, readOnly, setContent, persistDirty, bufferVersionRef],
    );

    const onSelect = useCallback(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        const before = content.slice(0, ta.selectionStart);
        const line = before.split("\n").length;
        const column = before.length - before.lastIndexOf("\n");
        window.dispatchEvent(
            new CustomEvent("shape-editor-status", {
                detail: { language, line, column, insertSpaces: true, spaces: 2 },
            }),
        );
    }, [content, language]);

    const theme = useMemo(() => getShapeSyntaxTheme(), []);

    return (
        <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-editor font-mono text-sm">
            <div
                ref={gutterRef}
                aria-hidden
                className="shrink-0 select-none overflow-hidden border-r border-border-subtle/30 bg-editor px-2 py-3 text-right text-text-muted tabular-nums"
                style={{ minWidth: `${Math.max(2, String(lines).length) + 1}ch` }}
            >
                {Array.from({ length: lines }, (_, i) => (
                    <div key={i} className="leading-5">
                        {i + 1}
                    </div>
                ))}
            </div>
            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                <div
                    ref={highlightRef}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-hidden px-3 py-3"
                >
                    <Suspense fallback={null}>
                        <SyntaxHighlighter
                            language={prismLang}
                            style={theme}
                            PreTag="div"
                            CodeTag="code"
                            customStyle={{
                                margin: 0,
                                padding: 0,
                                background: "transparent",
                                fontSize: "inherit",
                                fontFamily: "inherit",
                                lineHeight: "1.25rem",
                                whiteSpace: "pre",
                                wordBreak: "normal",
                                overflow: "visible",
                            }}
                            codeTagProps={{
                                style: {
                                    fontFamily: "inherit",
                                    fontSize: "inherit",
                                    lineHeight: "1.25rem",
                                    whiteSpace: "pre",
                                },
                            }}
                        >
                            {highlightSource}
                        </SyntaxHighlighter>
                    </Suspense>
                </div>
                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={onChange}
                    onScroll={syncScroll}
                    onKeyDown={onKeyDown}
                    onKeyUp={onSelect}
                    onClick={onSelect}
                    onSelect={onSelect}
                    readOnly={readOnly}
                    spellCheck={false}
                    wrap="off"
                    aria-label={`Edit ${path}`}
                    data-language={language}
                    className={cn(
                        "absolute inset-0 min-h-0 min-w-0 resize-none overflow-auto bg-transparent px-3 py-3 leading-5 text-transparent outline-none",
                        "caret-accent custom-scrollbar selection:bg-accent/30 shape-smooth-scroll",
                        readOnly && "cursor-default",
                    )}
                />
            </div>
        </div>
    );
}
