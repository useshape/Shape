"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getShapeSyntaxTheme } from "@/lib/ui/syntax-theme";
import { FileIcon } from "@/components/ui/file-icon";
import { openProjectFile } from "@/lib/open-project-file";
import { commands } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { looksLikeProseMarkdown, preprocessChatMarkdown } from "./stream";

function createMarkdownComponents(options?: { nested?: boolean; isGenerating?: boolean; isLast?: boolean }) {
    const nested = options?.nested;

    return {
        pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
        code(props: { className?: string; children?: React.ReactNode }) {
            const { className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className || "");
            const codeContent = String(children).replace(/\n$/, "");
            if (codeContent === "undefined") return null;

            if (match) {
                return (
                    <div className="my-4 rounded-lg overflow-hidden border border-border-subtle bg-panel">
                        <div className="flex items-center justify-between px-4 py-1.5 bg-panel border-b border-border-subtle">
                            <span className="text-sm font-medium text-text-muted">{match[1]}</span>
                        </div>
                        <SyntaxHighlighter
                            style={getShapeSyntaxTheme()}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{ margin: 0, padding: "1rem", background: "transparent" }}
                            {...rest}
                        >
                            {codeContent}
                        </SyntaxHighlighter>
                    </div>
                );
            }

            const isBlock = codeContent.includes("\n");
            if (isBlock && !nested && looksLikeProseMarkdown(codeContent)) {
                return <ChatMarkdown content={codeContent} nested />;
            }

            if (isBlock) {
                return (
                    <pre className="my-3 overflow-x-auto rounded-lg border border-border-subtle bg-panel p-3 text-sm font-mono leading-relaxed">
                        <code className="block whitespace-pre-wrap text-text-primary" {...rest}>
                            {children}
                        </code>
                    </pre>
                );
            }

            const isFilePath =
                typeof children === "string" &&
                !children.includes("\n") &&
                !children.includes(" ") &&
                (children.includes("/") || children.includes("\\") || /\.[a-z0-9]+$/i.test(children));

            if (isFilePath) {
                const name = (children as string).split(/[\\/]/).pop() || (children as string);
                return (
                    <span
                        className="inline-flex items-center gap-1.5 text-sm bg-panel hover:bg-panel-hover px-2 py-0.5 rounded-lg border border-border-subtle text-text-primary cursor-pointer transition-colors mx-0.5 align-middle font-sans"
                        title={children as string}
                        onClick={() => {
                            void openProjectFile(children as string, name);
                        }}
                    >
                        <FileIcon name={name} className="w-3.5 h-3.5" />
                        {name}
                    </span>
                );
            }

            return (
                <code
                    className="rounded border border-border-subtle bg-panel px-1.5 py-0.5 text-sm font-sans text-text-primary"
                    {...rest}
                >
                    {children}
                </code>
            );
        },
        p: ({ children }: { children?: React.ReactNode }) => (
            <p className="mb-2 last:mb-0 font-sans text-sm font-medium text-text-primary">
                {children}
            </p>
        ),
        ul: ({ children }: { children?: React.ReactNode }) => (
            <ul className="mb-2 ml-4 list-disc list-outside space-y-1 font-sans">{children}</ul>
        ),
        ol: ({ children }: { children?: React.ReactNode }) => (
            <ol className="mb-2 ml-4 list-decimal list-outside space-y-1 font-sans">{children}</ol>
        ),
        li: ({ children }: { children?: React.ReactNode }) => (
            <li className="leading-relaxed pl-0.5 font-normal font-sans">{children}</li>
        ),
        h1: ({ children }: { children?: React.ReactNode }) => (
            <h1 className="text-lg font-medium mt-4 mb-2 text-text-primary font-sans">{children}</h1>
        ),
        h2: ({ children }: { children?: React.ReactNode }) => (
            <h2 className="text-base font-medium mt-3 mb-1.5 text-text-primary font-sans">{children}</h2>
        ),
        h3: ({ children }: { children?: React.ReactNode }) => (
            <h3 className="text-sm font-medium mt-2 mb-1 text-text-primary font-sans">{children}</h3>
        ),
        strong: ({ children }: { children?: React.ReactNode }) => (
            <strong className="font-medium text-text-primary">{children}</strong>
        ),
        hr: () => null,
        a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
            const isLocalFile = href && !href.startsWith("http") && !href.startsWith("mailto:") && !href.startsWith("#");
            if (isLocalFile) {
                const name = href.split(/[\\/]/).pop() || href;
                return (
                    <span
                        className="inline-flex items-center gap-1.5 text-sm bg-panel hover:bg-panel-hover px-2 py-0.5 rounded border border-border-subtle text-text-primary cursor-pointer transition-colors mx-0.5 align-middle font-sans"
                        title={href}
                        onClick={() => {
                            void openProjectFile(href, name);
                        }}
                    >
                        <FileIcon name={name} className="w-3.5 h-3.5" />
                        {children || name}
                    </span>
                );
            }
            return (
                <a
                    href={href}
                    className="text-accent underline hover:text-accent/80 transition-colors font-normal font-sans cursor-pointer"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (href) void commands.openUrlExternal(href);
                    }}
                >
                    {children}
                </a>
            );
        },
        blockquote: ({ children }: { children?: React.ReactNode }) => (
            <blockquote className="border-l-2 border-accent/50 pl-3 py-0.5 my-1 text-text-muted italic bg-panel/30 rounded-r font-normal font-sans">
                {children}
            </blockquote>
        ),
    };
}

export const ChatMarkdown = React.memo(({
    content,
    nested,
    isGenerating,
    isLast,
}: {
    content: string;
    nested?: boolean;
    isGenerating?: boolean;
    isLast?: boolean;
}) => {
    const [displayed, setDisplayed] = React.useState(content);
    const lastUpdateRef = React.useRef(0);

    React.useEffect(() => {
        if (!isGenerating) {
            setDisplayed(content);
            return;
        }
        if (!lastUpdateRef.current) lastUpdateRef.current = Date.now();
        const now = Date.now();
        if (now - lastUpdateRef.current > 80 || content.length - displayed.length > 400) {
            setDisplayed(content);
            lastUpdateRef.current = now;
        } else {
            const t = setTimeout(() => {
                setDisplayed(content);
                lastUpdateRef.current = Date.now();
            }, 80);
            return () => clearTimeout(t);
        }
    }, [content, isGenerating, displayed.length]);

    const processed = React.useMemo(
        () => preprocessChatMarkdown(displayed, { streaming: !!isGenerating, trim: !isGenerating }),
        [displayed, isGenerating],
    );

    return (
        <div
            className={cn(
                "font-sans chat-markdown-body",
                isGenerating && isLast && "chat-stream-fade-in",
            )}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={createMarkdownComponents({ nested, isGenerating, isLast })}
            >
                {processed}
            </ReactMarkdown>
        </div>
    );
});
ChatMarkdown.displayName = "ChatMarkdown";

/** @deprecated Use ChatMarkdown */
export const StreamingMarkdown = ChatMarkdown;
