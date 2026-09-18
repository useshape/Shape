"use client";

import { RiCheckLine, RiClipboardLine } from "@remixicon/react";
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getShapeSyntaxTheme } from "@/lib/ui/syntax-theme";
import { FileIcon } from "@/components/ui/file-icon";
import { openProjectFile } from "@/lib/window/open-project-file";
import { Icon } from "@/components/ui/icon";
import { SyntaxHighlighter } from "@/lib/ui/syntax-highlight";
import { looksLikeProseMarkdown, preprocessChatMarkdown } from "./stream";
import { ChatLinkChip } from "./link-chip";

function CodeBlock({ language, code, ...rest }: { language: string; code: string; [k: string]: unknown }) {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
        });
    };

    return (
        <div className="my-1 overflow-hidden rounded-xl border border-border-subtle bg-surface-3">
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="text-sm font-medium text-text-muted">{language}</span>
                <button
                    type="button"
                    onClick={copy}
                    aria-label={copied ? "Copied" : "Copy code"}
                    className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-hover hover:text-text-primary"
                >
                    <Icon icon={copied ? RiCheckLine : RiClipboardLine} />
                </button>
            </div>
            <SyntaxHighlighter
                    style={getShapeSyntaxTheme()}
                    language={language}
                    PreTag="div"
                    customStyle={{ margin: 0, padding: "0 0.75rem 0.75rem", background: "transparent" }}
                    {...rest}
                >
                    {code}
                </SyntaxHighlighter>
        </div>
    );
}

function createMarkdownComponents(options?: { nested?: boolean }) {
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
                    <pre className="my-1 overflow-x-auto rounded-xl border border-border-subtle bg-surface-3 p-3 chat-text font-mono leading-relaxed">
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
                        className="mx-0.5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle bg-panel px-2 py-0.5 align-middle font-sans chat-text text-text-primary transition-colors hover:bg-panel-hover"
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
                    className="rounded border border-border-subtle bg-panel px-1.5 py-0.5 font-mono chat-text text-accent-text"
                    {...rest}
                >
                    {children}
                </code>
            );
        },
        p: ({ children }: { children?: React.ReactNode }) => (
            <p className="mb-2 font-sans chat-text font-medium text-text-primary last:mb-0">{children}</p>
        ),
        ul: ({ children }: { children?: React.ReactNode }) => (
            <ul className="mb-2 ml-4 list-outside list-disc space-y-1 font-sans chat-text">{children}</ul>
        ),
        ol: ({ children }: { children?: React.ReactNode }) => (
            <ol className="mb-2 ml-4 list-outside list-decimal space-y-1 font-sans chat-text">{children}</ol>
        ),
        li: ({ children }: { children?: React.ReactNode }) => (
            <li className="pl-0.5 font-sans chat-text font-normal leading-relaxed">{children}</li>
        ),
        h1: ({ children }: { children?: React.ReactNode }) => (
            <h1 className="mb-2 mt-4 font-sans chat-text font-medium text-text-primary">{children}</h1>
        ),
        h2: ({ children }: { children?: React.ReactNode }) => (
            <h2 className="mb-1.5 mt-3 font-sans chat-text font-medium text-text-primary">{children}</h2>
        ),
        h3: ({ children }: { children?: React.ReactNode }) => (
            <h3 className="mb-1 mt-2 font-sans chat-text font-medium text-text-primary">{children}</h3>
        ),
        strong: ({ children }: { children?: React.ReactNode }) => (
            <strong className="chat-text font-medium text-text-primary">{children}</strong>
        ),
        em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
        del: ({ children }: { children?: React.ReactNode }) => (
            <del className="text-text-muted">{children}</del>
        ),
        hr: () => <hr className="my-3 border-border-subtle" />,
        a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
            <ChatLinkChip href={href}>{children}</ChatLinkChip>
        ),
        blockquote: ({ children }: { children?: React.ReactNode }) => (
            <blockquote className="my-1 rounded-r border-l-2 border-accent/50 bg-panel/30 py-0.5 pl-3 font-sans chat-text font-normal italic text-text-muted">
                {children}
            </blockquote>
        ),
        table: ({ children }: { children?: React.ReactNode }) => (
            <div className="my-2 overflow-x-auto rounded-xl border border-border-subtle">
                <table className="w-full min-w-50 border-collapse text-left">{children}</table>
            </div>
        ),
        thead: ({ children }: { children?: React.ReactNode }) => (
            <thead className="bg-surface-3">{children}</thead>
        ),
        th: ({ children }: { children?: React.ReactNode }) => (
            <th className="border-b border-border-subtle px-2.5 py-1.5 font-sans chat-text font-medium text-text-primary">{children}</th>
        ),
        td: ({ children }: { children?: React.ReactNode }) => (
            <td className="border-b border-border-subtle px-2.5 py-1.5 font-sans chat-text text-text-secondary">{children}</td>
        ),
        input: (props: React.InputHTMLAttributes<HTMLInputElement>) => {
            if (props.type !== "checkbox") return <input {...props} />;
            return (
                <input
                    {...props}
                    readOnly
                    className="mr-2 align-middle accent-accent"
                />
            );
        },
    };
}

/** Fast catch-up typewriter over the raw markdown string (survives re-parses). */
function useRevealText(full: string, live: boolean): string {
    const len = full.length;
    const [shown, setShown] = useState(() => (live ? Math.min(24, len) : len));
    const shownRef = useRef(shown);
    shownRef.current = shown;
    const wasLive = useRef(live);
    if (live) wasLive.current = true;

    useEffect(() => {
        // Finished message that never streamed in this mount — show fully.
        if (!live && !wasLive.current) {
            setShown(len);
            return;
        }
        if (shownRef.current > len) {
            setShown(len);
            return;
        }
        if (shownRef.current >= len) return;

        let raf = 0;
        let last = performance.now();
        const tick = (now: number) => {
            const cur = shownRef.current;
            if (cur >= len) return;
            const dt = Math.min(32, now - last);
            last = now;
            const behind = len - cur;
            // Sprint on dumps; cruise near the tip. Stay under ~0.5s for big chunks.
            let cps: number;
            if (behind > 800) cps = 1400;
            else if (behind > 300) cps = 900;
            else if (behind > 80) cps = 480;
            else cps = live ? 180 : 320;
            const step = Math.max(1, Math.ceil((cps * dt) / 1000));
            const next = Math.min(len, cur + step);
            setShown(next);
            if (next < len) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [len, live, shown < len]);

    return full.slice(0, shown);
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
    // Keep revealing briefly after generation ends so a late dump still types in.
    const [hold, setHold] = useState(false);
    useEffect(() => {
        if (isGenerating && isLast) {
            setHold(true);
            return;
        }
        if (!hold) return;
        const t = window.setTimeout(() => setHold(false), 700);
        return () => window.clearTimeout(t);
    }, [isGenerating, isLast, hold]);

    const live = !nested && !!isLast && (!!isGenerating || hold);
    const visible = useRevealText(content, live);

    const components = React.useMemo(
        () => createMarkdownComponents({ nested }),
        [nested],
    );

    const processed = React.useMemo(
        () => preprocessChatMarkdown(visible, { streaming: live, trim: !live }),
        [visible, live],
    );

    return (
        <div className="font-sans chat-markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {processed}
            </ReactMarkdown>
        </div>
    );
});
ChatMarkdown.displayName = "ChatMarkdown";

/** @deprecated Use ChatMarkdown */
export const StreamingMarkdown = ChatMarkdown;
