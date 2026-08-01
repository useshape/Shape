"use client";

import React, { useCallback, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from "@/lib/utils";
import { convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "@/lib/backend";
import { notificationStore } from "@/features/notifications";
import { MarkdownToolbar, type MarkdownSelection } from "./markdown-toolbar";
import {
    applyInlineMarkdownFormat,
    applyMarkdownBlock,
    applyMarkdownList,
    replaceMarkdownText,
    selectionToSourceRange,
    type MarkdownBlockKind,
    type MarkdownInlineFormat,
} from "./lib/markdown-format";
import { remarkSourcePositions } from "./lib/remark-source-positions";

interface MarkdownPreviewProps {
    content: string;
    className?: string;
    filePath?: string;
    projectPath?: string | null;
    /** When provided, selecting text shows a formatting toolbar that edits the source. */
    onApplyContent?: (next: string) => void;
}

const LARGE_MARKDOWN_CHARS = 80_000;
const LARGE_CODE_BLOCK_CHARS = 4_000;

function isExternalHref(href: string): boolean {
    return /^(https?:|mailto:|tel:)/i.test(href);
}

export const MarkdownPreview = React.forwardRef<HTMLDivElement, MarkdownPreviewProps>
    (({ content, className, filePath, projectPath, onApplyContent }, ref) => {
        const [selection, setSelection] = useState<MarkdownSelection | null>(null);
        const scrollRef = useRef<HTMLDivElement | null>(null);
        const contentRef = useRef(content);
        contentRef.current = content;
        const isHugeDoc = content.length > LARGE_MARKDOWN_CHARS;

        const setRefs = useCallback((node: HTMLDivElement | null) => {
            scrollRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
        }, [ref]);

        const handleMouseUp = useCallback(() => {
            if (!onApplyContent) return;
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
                setSelection(null);
                return;
            }
            const text = sel.toString().trim();
            if (!text) {
                setSelection(null);
                return;
            }
            const anchor = sel.anchorNode;
            if (anchor && scrollRef.current && !scrollRef.current.contains(anchor)) {
                setSelection(null);
                return;
            }
            const r = sel.getRangeAt(0).getBoundingClientRect();
            const sourceRange = scrollRef.current
                ? selectionToSourceRange(contentRef.current, sel, scrollRef.current)
                : null;
            setSelection({
                text,
                rect: { top: r.top, left: r.left, width: r.width, height: r.height },
                sourceRange,
            });
        }, [onApplyContent]);

        const applyOrWarn = useCallback((next: string | null) => {
            if (next === null) {
                notificationStore.add(
                    "Could not locate the selected text in the source",
                    "warning",
                    undefined,
                    { autoHide: true },
                );
                return;
            }
            onApplyContent?.(next);
            setSelection(null);
            window.getSelection()?.removeAllRanges();
        }, [onApplyContent]);

        const handleFormat = useCallback((format: MarkdownInlineFormat) => {
            if (!selection) return;
            applyOrWarn(
                applyInlineMarkdownFormat(
                    contentRef.current,
                    selection.text,
                    format,
                    selection.sourceRange,
                ),
            );
        }, [applyOrWarn, selection]);

        const handleBlock = useCallback((block: MarkdownBlockKind) => {
            if (!selection) return;
            applyOrWarn(
                applyMarkdownBlock(
                    contentRef.current,
                    selection.text,
                    block,
                    selection.sourceRange,
                ),
            );
        }, [applyOrWarn, selection]);

        const handleList = useCallback((ordered: boolean) => {
            if (!selection) return;
            applyOrWarn(
                applyMarkdownList(
                    contentRef.current,
                    selection.text,
                    ordered,
                    selection.sourceRange,
                ),
            );
        }, [applyOrWarn, selection]);

        const handleReplaceText = useCallback((newText: string) => {
            if (!selection) return;
            applyOrWarn(
                replaceMarkdownText(
                    contentRef.current,
                    selection.text,
                    newText,
                    selection.sourceRange,
                ),
            );
        }, [applyOrWarn, selection]);

        const basePath = useMemo(() => {
            if (!filePath) return "";
            const parts = filePath.replace(/\\/g, "/").split("/");
            parts.pop();
            return parts.join("/");
        }, [filePath]);

        const resolveLocalHref = useCallback((href: string): string | null => {
            const raw = href.split("#")[0]?.split("?")[0] ?? "";
            if (!raw) return null;
            const clean = decodeURIComponent(raw.replace(/\\/g, "/"));
            const safeProjectPath = projectPath ? projectPath.replace(/\\/g, "/").replace(/\/$/, "") : "";

            if (/^[a-zA-Z]:\//.test(clean) || clean.startsWith("//")) return clean.replace(/\//g, "\\");
            if (clean.startsWith("/") && safeProjectPath) return `${safeProjectPath}${clean}`;
            if (basePath) return `${basePath}/${clean}`.replace(/\/+/g, "/");
            if (safeProjectPath) return `${safeProjectPath}/${clean}`.replace(/\/+/g, "/");
            return null;
        }, [basePath, projectPath]);

        const handleMarkdownLinkClick = useCallback((e: React.MouseEvent, href?: string | null) => {
            if (!href) return;
            const trimmed = href.trim();
            if (!trimmed || trimmed === "#") {
                e.preventDefault();
                return;
            }

            if (trimmed.startsWith("#")) {
                e.preventDefault();
                const id = decodeURIComponent(trimmed.slice(1));
                const root = scrollRef.current;
                const target =
                    root?.querySelector(`#${CSS.escape(id)}`)
                    ?? root?.querySelector(`[name="${CSS.escape(id)}"]`);
                target?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }

            if (isExternalHref(trimmed)) {
                e.preventDefault();
                e.stopPropagation();
                void commands.openUrlExternal(trimmed);
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            const localPath = resolveLocalHref(trimmed);
            if (!localPath) return;
            const name = localPath.split(/[\\/]/).pop() || localPath;
            void commands.openFile(localPath, name).catch(() => {
                notificationStore.add(`Could not open ${name}`, "warning", undefined, { autoHide: true });
            });
        }, [resolveLocalHref]);

        const baseUrlsToTry = useMemo(() => {
            return (src: string) => {
                if (!src) return [];
                if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
                    return [src];
                }

                const urlObj = new URL(src, "http://localhost");
                const cleanPath = decodeURIComponent(urlObj.pathname);

                const paths: string[] = [];
                const safeProjectPath = projectPath ? projectPath.replace(/\\/g, "/").replace(/\/$/, "") : "";

                if (cleanPath.startsWith("/") && safeProjectPath) {
                    paths.push(`${safeProjectPath}${cleanPath}`);
                    paths.push(`${safeProjectPath}/public${cleanPath}`);
                    paths.push(`${safeProjectPath}/static${cleanPath}`);
                    paths.push(`${safeProjectPath}/assets${cleanPath}`);
                    paths.push(`${safeProjectPath}/src/assets${cleanPath}`);
                } else if (filePath && !cleanPath.startsWith("/") && !cleanPath.includes(":")) {
                    paths.push(`${basePath}/${cleanPath}`);
                    if (safeProjectPath) {
                        paths.push(`${safeProjectPath}/${cleanPath}`);
                    }
                }

                if (paths.length === 0) return [src];

                return paths.map(p => {
                    try {
                        if (p.startsWith('diff:')) return p;
                        return convertFileSrc(p);
                    } catch {
                        return p;
                    }
                });
            };
        }, [projectPath, filePath, basePath]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SmartImage = ({ src, alt, ...props }: any) => {
            const urls = useMemo(() => baseUrlsToTry(src || ""), [src]);
            const [urlIndex, setUrlIndex] = React.useState(0);

            if (!urls.length) return null;

            const currentSrc = urlIndex < urls.length ? urls[urlIndex] : urls[urls.length - 1];

            return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={currentSrc}
                    alt={alt}
                    onError={() => {
                        if (urlIndex < urls.length - 1) {
                            setUrlIndex(urlIndex + 1);
                        }
                    }}
                    {...props}
                />
            );
        };

        return (
            <div
                ref={setRefs}
                onMouseUp={handleMouseUp}
                onClickCapture={(e) => {
                    const el = e.target;
                    if (!(el instanceof Element)) return;
                    const anchor = el.closest("a");
                    if (!anchor || !scrollRef.current?.contains(anchor)) return;
                    const href = anchor.getAttribute("href");
                    if (!href) return;
                    handleMarkdownLinkClick(e as unknown as React.MouseEvent, href);
                }}
                className={cn(
                    "h-full overflow-auto p-12 bg-editor border-l border-border text-text-primary custom-scrollbar selection:bg-accent/10",
                    className
                )}
            >
                {selection && onApplyContent && (
                    <MarkdownToolbar
                        selection={selection}
                        scrollRoot={scrollRef.current}
                        onFormat={handleFormat}
                        onBlock={handleBlock}
                        onList={handleList}
                        onReplaceText={handleReplaceText}
                        onClose={() => setSelection(null)}
                        onRectChange={(rect) => {
                            setSelection((prev) => (prev ? { ...prev, rect } : prev));
                        }}
                    />
                )}
                <div className={cn(
                    "w-full max-w-3xl mx-auto text-md leading-relaxed font-sans text-text-primary break-words select-text cursor-text",
                    "[&>p]:mb-1",
                    "[&>h1]:text-3xl [&>h1]:font-bold [&>h1]:mb-6 [&>h1]:mt-8 [&>h1]:pb-2 [&>h1]:border-b [&>h1]:border-border-subtle",
                    "[&>h2]:text-2xl [&>h2]:font-bold [&>h2]:mb-4 [&>h2]:mt-6 [&>h2]:pb-2 [&>h2]:border-b [&>h2]:border-border-subtle",
                    "[&>h3]:text-xl [&>h3]:font-bold [&>h3]:mb-3 [&>h3]:mt-5",
                    "[&>h4]:text-lg [&>h4]:font-bold [&>h4]:mb-3 [&>h4]:mt-4",
                    "[&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4 [&>ul>li]:mb-1",
                    "[&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:mb-4 [&>ol>li]:mb-1",
                    "[&>blockquote]:border-l-4 [&>blockquote]:border-accent [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-text-muted [&>blockquote]:my-4 [&>blockquote]:bg-editor/50 [&>blockquote]:py-1 [&>blockquote]:rounded-r-lg",
                    "[&>hr]:border-border-subtle [&>hr]:my-8",
                    "[&_a]:text-accent [&_a]:hover:underline [&_a]:transition-colors [&_a]:cursor-pointer",
                    "[&>table]:w-full [&>table]:mb-4 [&>table]:border-collapse",
                    "[&_th]:border [&_th]:border-border-subtle [&_th]:px-4 [&_th]:py-2 [&_th]:bg-editor [&_th]:font-semibold [&_th]:text-left",
                    "[&_td]:border [&_td]:border-border-subtle [&_td]:px-4 [&_td]:py-2",
                    "[&_[align=center]]:text-center",
                    "[&_[align=right]]:text-right",
                    "[&_[align=center]_img]:mx-auto [&_[align=center]_img]:inline-block",
                    "[&_[style*='text-align:center']_img]:mx-auto",
                    "[&_img]:max-w-full [&_img]:h-auto [&_img]:my-2",
                    "*:first:mt-0 *:last:mb-0"
                )}>
                    {isHugeDoc ? (
                        <pre className="whitespace-pre-wrap break-words font-mono text-sm text-text-secondary">
                            {content.slice(0, LARGE_MARKDOWN_CHARS)}
                            {"\n\n… Preview truncated for performance. Open the source tab to edit the full file."}
                        </pre>
                    ) : (
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkSourcePositions]}
                        rehypePlugins={[rehypeRaw]}
                        components={{
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode;[key: string]: any }) {
                                const match = /language-(\w+)/.exec(className || '');
                                const codeText = String(children).replace(/\n$/, '');
                                if (!inline && match) {
                                    const usePlain = codeText.length > LARGE_CODE_BLOCK_CHARS;
                                    return (
                                    <div className="my-4 rounded-lg overflow-hidden border border-border-subtle bg-editor">
                                        <div className="flex items-center justify-between px-3 py-1">
                                            <span className="text-sm font-medium text-text-muted">{match[1]}</span>
                                        </div>
                                        {usePlain ? (
                                            <pre
                                                className="m-0 overflow-x-auto p-5 font-mono text-[13px] text-text-primary whitespace-pre"
                                                {...props}
                                            >
                                                {codeText}
                                            </pre>
                                        ) : (
                                        <SyntaxHighlighter
                                            style={oneDark as { [key: string]: React.CSSProperties }}
                                            language={match[1]}
                                            PreTag="div"
                                            customStyle={{ margin: 0, padding: '1.25rem', background: 'transparent', fontSize: '13px' }}
                                            {...props}
                                        >
                                            {codeText}
                                        </SyntaxHighlighter>
                                        )}
                                    </div>
                                    );
                                }
                                return (
                                    <code className="bg-surface-2 px-1.5 py-0.5 rounded-md text-[0.875em] border border-border-subtle text-text-primary font-mono" {...props}>
                                        {children}
                                    </code>
                                );
                            },
                            a: ({ href, children, ...props }) => (
                                <a
                                    href={href}
                                    className="text-accent hover:underline transition-colors cursor-pointer"
                                    {...props}
                                >
                                    {children}
                                </a>
                            ),
                            img: ({ src, alt, ...props }) => (
                                <SmartImage
                                    src={typeof src === "string" ? src : ""}
                                    alt={alt}
                                    className="max-w-full h-auto my-2"
                                    {...props}
                                />
                            )
                        }}
                    >
                        {content}
                    </ReactMarkdown>
                    )}
                </div>
            </div>
        );
    }
);

MarkdownPreview.displayName = "MarkdownPreview";
