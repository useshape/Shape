"use client";

import { Checkmark20Regular } from "@fluentui/react-icons/headless/svg/checkmark";
import { Clipboard20Regular } from "@fluentui/react-icons/headless/svg/clipboard";
import { DataTrending20Regular } from "@fluentui/react-icons/headless/svg/data-trending";



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
import { Button } from "@/components/ui/button";
import { commands, getProjectPath } from "@/lib/backend";
import { resolveProjectFilePath } from "@/lib/path/utils";
import { ChatMermaid } from "./mermaid";
import { ChatKeyedRowsTable, MarkdownTableShell } from "./data-table";
import { parseKeyedRows, tableCellModelId } from "@/lib/chat/fence-tables";
import { providerIcon } from "@/lib/ui/provider-icon";

const PATH_IN_PROSE =
    /(?:^|(?<=\s))((?:\.{1,2}[\\/])?(?:[\w.-]+[\\/])+[\w.-]+\.[A-Za-z0-9]{1,12})(?=$|[\s,;:)\]"'`])/g;

function ProjectPathLink({ path }: { path: string }) {
    return (
        <button
            type="button"
            className="text-accent-text underline decoration-accent-text/40 underline-offset-2 hover:decoration-accent-text"
            title={path}
            onClick={() => {
                void openProjectFile(path);
            }}
        >
            {path}
        </button>
    );
}

function linkifyText(text: string): React.ReactNode {
    PATH_IN_PROSE.lastIndex = 0;
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    let i = 0;
    while ((match = PATH_IN_PROSE.exec(text)) !== null) {
        const full = match[1];
        if (!full || full.includes("://") || full.startsWith("http")) continue;
        const start = match.index + (match[0].startsWith(full) ? 0 : match[0].length - full.length);
        if (start > last) nodes.push(text.slice(last, start));
        nodes.push(<ProjectPathLink key={`p-${i++}-${start}`} path={full} />);
        last = start + full.length;
    }
    if (last === 0) return text;
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
}

function withCites(text: string): React.ReactNode {
    const bits = text.split(/(\[\d+\])/g);
    if (bits.length === 1) return linkifyText(text);
    return bits.map((bit, index) => {
        const mark = bit.match(/^\[(\d+)\]$/);
        if (!mark) return <React.Fragment key={index}>{linkifyText(bit)}</React.Fragment>;
        return (
            <sup
                key={index}
                className="mx-0.5 inline-flex size-4 items-center justify-center rounded-full bg-panel-hover align-super text-[10px] text-text-muted"
            >
                {mark[1]}
            </sup>
        );
    });
}

type RevealState = { seen: Set<string>; seq: { n: number; fresh: number } };

function revealText(text: string, reveal: RevealState | null): React.ReactNode {
    if (!reveal) return withCites(text);
    const parts = text.split(/(\s+)/);
    return parts.map((part, index) => {
        if (part === "" || /^\s+$/.test(part)) return part;
        const id = `w${reveal.seq.n++}`;
        const fresh = !reveal.seen.has(id);
        reveal.seen.add(id);
        return (
            <span
                key={`${id}-${index}`}
                className={fresh ? "chat-reveal-word" : undefined}
            >
                {withCites(part)}
            </span>
        );
    });
}

function linkifyChildren(children: React.ReactNode, reveal: RevealState | null = null): React.ReactNode {
    return React.Children.map(children, (child) => {
        if (typeof child === "string") return revealText(child, reveal);
        return child;
    });
}

function CodeBlock({ language, code, ...rest }: { language: string; code: string; [k: string]: unknown }) {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
        });
    };

    return (
        <div className="my-1 overflow-hidden squircle-2xl bg-surface-3">
            <div className="flex items-center justify-between gap-2 pl-3 pr-2 py-1.5">
                <span className="text-sm font-medium text-text-muted">{language}</span>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={copy}
                    aria-label={copied ? "Copied" : "Copy code"}
                >
                    <Icon icon={copied ? Checkmark20Regular : Clipboard20Regular} />
                </Button>
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

function createMarkdownComponents(options?: { nested?: boolean; reveal?: RevealState | null; plain?: boolean }) {
    const nested = options?.nested;
    const reveal = options?.reveal ?? null;
    const plain = options?.plain;
    const linked = (children?: React.ReactNode) => linkifyChildren(children, reveal);

    return {
        ...(plain
            ? {
                table: () => null,
                thead: () => null,
                tbody: () => null,
                tr: () => null,
                th: () => null,
                td: () => null,
                h1: ({ children }: { children?: React.ReactNode }) => <p>{linked(children)}</p>,
                h2: ({ children }: { children?: React.ReactNode }) => <p>{linked(children)}</p>,
                h3: ({ children }: { children?: React.ReactNode }) => <p>{linked(children)}</p>,
            }
            : {}),
        pre: ({ children }: { children?: React.ReactNode }) => (plain ? <p className="whitespace-pre-wrap">{children}</p> : <>{children}</>),
        code(props: { className?: string; children?: React.ReactNode }) {
            const { className, children, ...rest } = props;
            if (plain) return <span>{children}</span>;
            const match = /language-([a-z0-9-]+)/i.exec(className || "");
            const codeContent = String(children).replace(/\n$/, "");
            if (codeContent === "undefined") return null;

            if (match) {
                const language = match[1]!.toLowerCase();
                if (language === "mermaid") {
                    return <ChatMermaid source={codeContent} />;
                }
                if (language === "filter-table" || language === "records") {
                    const rows = parseKeyedRows(codeContent);
                    if (!rows) {
                        return <CodeBlock language={language} code={codeContent} {...rest} />;
                    }
                    return <ChatKeyedRowsTable rows={rows} />;
                }
                if (language === "chart" || language === "insight" || language === "stats") return null;
                return <CodeBlock language={language} code={codeContent} {...rest} />;
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
                        className="mx-0.5 inline-flex cursor-pointer items-center gap-1.5 squircle-lg  bg-panel-hover px-2 py-0.5 align-middle font-sans chat-text text-text-primary transition-colors hover:bg-panel-hover"
                        title={children as string}
                        onClick={() => {
                            void openProjectFile(children as string, name);
                        }}
                    >
                        <FileIcon name={name} className="h-4 w-4" />
                        {name}
                    </span>
                );
            }

            return (
                <code
                    className="squircle-lg bg-panel-hover px-1.5 py-0.5 font-mono chat-text text-accent-text"
                    {...rest}
                >
                    {children}
                </code>
            );
        },
        p: ({ children }: { children?: React.ReactNode }) => (
            <p className="mb-2 font-sans chat-text font-medium text-text-primary last:mb-0">{linked(children)}</p>
        ),
        ul: ({ children }: { children?: React.ReactNode }) => (
            <ul className="mb-2 ml-4 list-outside list-disc space-y-1 font-sans chat-text">{children}</ul>
        ),
        ol: ({ children }: { children?: React.ReactNode }) => (
            <ol className="mb-2 ml-4 list-outside list-decimal space-y-1 font-sans chat-text">{children}</ol>
        ),
        li: ({ children }: { children?: React.ReactNode }) => (
            <li className="pl-0.5 font-sans chat-text font-normal leading-relaxed">{linked(children)}</li>
        ),
        h1: ({ children }: { children?: React.ReactNode }) => (
            <h1 className="mb-2 mt-4 font-sans chat-text font-medium text-text-primary">{linked(children)}</h1>
        ),
        h2: ({ children }: { children?: React.ReactNode }) => (
            <h2 className="mb-1.5 mt-3 font-sans chat-text font-medium text-text-primary">{linked(children)}</h2>
        ),
        h3: ({ children }: { children?: React.ReactNode }) => (
            <h3 className="mb-1 mt-2 font-sans chat-text font-medium text-text-primary">{linked(children)}</h3>
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
            <blockquote className="rounded-r border-l-2 border-base/50 bg-panel/30 pl-3 font-sans chat-text font-normal italic text-text-muted">
                {children}
            </blockquote>
        ),
        table: ({ children }: { children?: React.ReactNode }) => (
            <MarkdownTableShell>
                <table className="w-full min-w-50 border-collapse text-left">{children}</table>
            </MarkdownTableShell>
        ),
        thead: ({ children }: { children?: React.ReactNode }) => (
            <thead>{children}</thead>
        ),
        th: ({ children }: { children?: React.ReactNode }) => (
            <th className="px-2.5 py-1.5 font-sans chat-text font-medium text-text-primary">{children}</th>
        ),
        td: ({ children }: { children?: React.ReactNode }) => {
            const text = React.Children.toArray(children)
                .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : ""))
                .join("");
            const modelId = tableCellModelId(text);
            return (
                <td className="px-2.5 py-1.5 font-sans chat-text text-text-secondary">
                    {modelId ? (
                        <span className="inline-flex items-center gap-1.5">
                            {providerIcon(modelId, 14)}
                            {children}
                        </span>
                    ) : (
                        children
                    )}
                </td>
            );
        },
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

/**
 * Fast catch-up typewriter over the raw markdown string.
 * The cursor only moves forward. When this block is no longer the live tail
 * (a tool run started after it, or generation finished), show the whole string
 * immediately so a mid-word slice cannot stick around until the turn ends.
 */
function useRevealText(full: string, live: boolean): string {
    const len = full.length;
    const [shown, setShown] = useState(() => (live ? Math.min(24, len) : len));
    const shownRef = useRef(shown);
    shownRef.current = shown;

    useEffect(() => {
        if (!live || shownRef.current > len) {
            if (shownRef.current !== len) setShown(len);
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
            if (behind > 1600) {
                setShown(len);
                return;
            }
            let cps: number;
            if (behind > 800) cps = 2200;
            else if (behind > 300) cps = 1200;
            else if (behind > 80) cps = 640;
            else cps = 240;
            const step = Math.max(1, Math.ceil((cps * dt) / 1000));
            const next = Math.min(len, cur + step);
            setShown(next);
            if (next < len) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [len, live]);

    return full.slice(0, Math.min(shown, len));
}

export const ChatMarkdown = React.memo(({
    content,
    nested,
    isGenerating,
    isLast,
    plain,
}: {
    content: string;
    nested?: boolean;
    isGenerating?: boolean;
    isLast?: boolean;
    plain?: boolean;
}) => {
    // After generation ends, keep typing for a moment if this paragraph is
    // still the tail. A paragraph that a tool run has moved off the tail
    // is not live, so useRevealText shows it in full.
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
    const visible = useRevealText(content, plain ? false : live);
    const seenWords = useRef(new Set<string>());
    const wordSeq = useRef({ n: 0, fresh: 0 });
    wordSeq.current.n = 0;
    wordSeq.current.fresh = 0;

    const components = React.useMemo(
        () => createMarkdownComponents({
            nested,
            plain,
            reveal: live && visible.length < 280 ? { seen: seenWords.current, seq: wordSeq.current } : null,
        }),
        [nested, live, plain],
    );

    const processed = React.useMemo(
        () => preprocessChatMarkdown(visible, { streaming: live, trim: !live }),
        [visible, live],
    );

    return (
        <div className="font-sans chat-markdown-body" data-live={live ? "true" : undefined}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {processed}
            </ReactMarkdown>
        </div>
    );
});
ChatMarkdown.displayName = "ChatMarkdown";

/** @deprecated Use ChatMarkdown */
export const StreamingMarkdown = ChatMarkdown;
