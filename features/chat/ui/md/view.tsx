"use client";

import React, { lazy, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getShapeSyntaxTheme } from "@/lib/ui/syntax-theme";
import { FileIcon } from "@/components/ui/file-icon";
import { openProjectFile } from "@/lib/open-project-file";
import { cn } from "@/lib/utils";
import { looksLikeProseMarkdown, preprocessChatMarkdown } from "./stream";
import { ChatLinkChip } from "./link-chip";

const SyntaxHighlighter = lazy(() =>
    import("react-syntax-highlighter").then((m) => ({ default: m.Prism as React.ComponentType<any> })),
);

function CodeBlock({ language, code, ...rest }: { language: string; code: string; [k: string]: unknown }) {
    return (
        <div className="my-4 overflow-hidden rounded-lg border border-border-subtle bg-panel">
            <div className="flex items-center justify-between border-b border-border-subtle bg-panel px-4 py-1.5">
                <span className="text-sm font-medium text-text-muted">{language}</span>
            </div>
            <Suspense
                fallback={
                    <pre className="m-0 overflow-x-auto p-4 text-sm font-mono text-text-primary">
                        <code>{code}</code>
                    </pre>
                }
            >
                <SyntaxHighlighter
                    style={getShapeSyntaxTheme()}
                    language={language}
                    PreTag="div"
                    customStyle={{ margin: 0, padding: "1rem", background: "transparent" }}
                    {...rest}
                >
                    {code}
                </SyntaxHighlighter>
            </Suspense>
        </div>
    );
}

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
                return <CodeBlock language={match[1]!} code={codeContent} {...rest} />;
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
                typeof children === "string"
                && !children.includes("\n")
                && !children.includes(" ")
                && (children.includes("/") || children.includes("\\") || /\.[a-z0-9]+$/i.test(children));

            if (isFilePath) {
                const name = (children as string).split(/[\\/]/).pop() || (children as string);
                return (
                    <span
                        className="mx-0.5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle bg-panel px-2 py-0.5 align-middle font-sans text-sm text-text-primary transition-colors hover:bg-panel-hover"
                        title={children as string}
                        onClick={() => {
                            void openProjectFile(children as string, name);
                        }}
                    >
                        <FileIcon name={name} className="h-3.5 w-3.5" />
                        {name}
                    </span>
                );
            }

            return (
                <code
                    className="rounded border border-border-subtle bg-panel px-1.5 py-0.5 font-mono text-sm text-accent-text"
                    {...rest}
                >
                    {children}
                </code>
            );
        },
        p: ({ children }: { children?: React.ReactNode }) => (
            <p className="mb-2 font-sans text-sm font-medium text-text-primary last:mb-0">
                {children}
            </p>
        ),
        ul: ({ children }: { children?: React.ReactNode }) => (
            <ul className="mb-2 ml-4 list-outside list-disc space-y-1 font-sans text-sm">{children}</ul>
        ),
        ol: ({ children }: { children?: React.ReactNode }) => (
            <ol className="mb-2 ml-4 list-outside list-decimal space-y-1 font-sans text-sm">{children}</ol>
        ),
        li: ({ children }: { children?: React.ReactNode }) => (
            <li className="pl-0.5 font-sans text-sm font-normal leading-relaxed">{children}</li>
        ),
        h1: ({ children }: { children?: React.ReactNode }) => (
            <h1 className="mb-2 mt-4 font-sans text-sm font-medium text-text-primary">{children}</h1>
        ),
        h2: ({ children }: { children?: React.ReactNode }) => (
            <h2 className="mb-1.5 mt-3 font-sans text-sm font-medium text-text-primary">{children}</h2>
        ),
        h3: ({ children }: { children?: React.ReactNode }) => (
            <h3 className="mb-1 mt-2 font-sans text-sm font-medium text-text-primary">{children}</h3>
        ),
        strong: ({ children }: { children?: React.ReactNode }) => (
            <strong className="text-sm font-medium text-text-primary">{children}</strong>
        ),
        hr: () => null,
        a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
            <ChatLinkChip href={href}>{children}</ChatLinkChip>
        ),
        blockquote: ({ children }: { children?: React.ReactNode }) => (
            <blockquote className="my-1 rounded-r border-l-2 border-accent/50 bg-panel/30 py-0.5 pl-3 font-sans text-sm font-normal italic text-text-muted">
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
