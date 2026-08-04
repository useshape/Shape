"use client";

import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/backend";
import { openProjectFile } from "@/lib/open-project-file";
import { FileIcon } from "@/components/ui/file-icon";

export type GitMarkdownCtx = {
    owner?: string;
    repo?: string;
    /** Branch or commit SHA for blob fallbacks */
    ref?: string;
};

/** Strip noise bots leave in bodies so comments read like GitHub. */
export function preprocessGitHubBody(content: string): string {
    return content
        .replace(/\r\n/g, "\n")
        // HTML comments (CodeRabbit / Vercel metadata)
        .replace(/<!--[\s\S]*?-->/g, "")
        // Zero-width / BOM junk
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim();
}

export async function openGitHubHref(
    href: string,
    ctx?: GitMarkdownCtx,
): Promise<void> {
    const raw = href.trim();
    if (!raw || raw.startsWith("#")) return;

    if (/^https?:\/\//i.test(raw) || raw.startsWith("mailto:")) {
        await commands.openUrlExternal(raw);
        return;
    }
    if (raw.startsWith("//")) {
        await commands.openUrlExternal(`https:${raw}`);
        return;
    }
    // Site-absolute GitHub paths: /owner/repo/pull/1
    if (raw.startsWith("/") && !raw.startsWith("//")) {
        await commands.openUrlExternal(`https://github.com${raw}`);
        return;
    }

    // Repo-relative file path → IDE, else GitHub blob
    const rel = raw.replace(/^\.\//, "");
    const opened = await openProjectFile(rel);
    if (opened) return;

    if (ctx?.owner && ctx?.repo) {
        const ref = ctx.ref || "HEAD";
        await commands.openUrlExternal(
            `https://github.com/${ctx.owner}/${ctx.repo}/blob/${encodeURIComponent(ref)}/${rel
                .split("/")
                .map(encodeURIComponent)
                .join("/")}`,
        );
    }
}

function LinkEl({
    href,
    children,
    ctx,
    className,
}: {
    href?: string;
    children?: ReactNode;
    ctx?: GitMarkdownCtx;
    className?: string;
}) {
    if (!href) return <span className={className}>{children}</span>;

    const looksLocal =
        !/^https?:\/\//i.test(href) &&
        !href.startsWith("mailto:") &&
        !href.startsWith("#") &&
        !href.startsWith("/") &&
        !href.startsWith("//");

    if (looksLocal) {
        const name = href.split(/[\\/]/).pop() || href;
        return (
            <button
                type="button"
                title={href}
                className={cn(
                    "mx-0.5 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border-subtle bg-panel px-2 py-0.5 align-middle text-sm text-text-primary transition-colors hover:bg-panel-hover",
                    className,
                )}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void openGitHubHref(href, ctx);
                }}
            >
                <FileIcon name={name} className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate">{children || name}</span>
            </button>
        );
    }

    return (
        <a
            href={href}
            className={cn(
                "wrap-break-word text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent",
                className,
            )}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void openGitHubHref(href, ctx);
            }}
        >
            {children}
        </a>
    );
}

function createComponents(ctx?: GitMarkdownCtx): Components {
    return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        a: ({ href, children }: any) => <LinkEl href={href} ctx={ctx}>{children}</LinkEl>,

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        img: ({ src, alt }: any) => {
            if (!src) return null;
            // Tiny status badges / emoji images from bots
            const isBadge =
                /\/badge|shields\.io|camo\.githubusercontent|github\.com\/.*\.svg/i.test(
                    src,
                ) || (alt?.length ?? 0) < 40;
            return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt={alt || ""}
                    loading="lazy"
                    className={cn(
                        "inline-block max-w-full object-contain",
                        isBadge
                            ? "my-0.5 max-h-5 align-middle"
                            : "my-2 max-h-80 rounded-lg border border-border-subtle",
                    )}
                />
            );
        },

        // Bot “buttons” are often <a class="btn"> — also catch bare <button>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        button: ({ children, ...rest }: any) => {
            return (
                <button
                    type="button"
                    className="my-1 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border-subtle bg-panel px-2.5 py-1.5 text-sm text-text-primary hover:bg-panel-hover"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const el = e.currentTarget.querySelector("a[href]");
                        const href = el?.getAttribute("href");
                        if (href) void openGitHubHref(href, ctx);
                    }}
                    {...rest}
                >
                    {children}
                </button>
            );
        },

        details: ({ children }) => (
            <details className="my-2 overflow-hidden rounded-lg border border-border-subtle bg-panel/30 open:bg-panel/50">
                {children}
            </details>
        ),
        summary: ({ children }) => (
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-text-primary marker:content-none [&::-webkit-details-marker]:hidden hover:bg-panel-hover/50">
                <span className="inline-flex items-center gap-1.5">{children}</span>
            </summary>
        ),

        table: ({ children }) => (
            <div className="my-3 max-w-full overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-max min-w-full border-collapse text-left text-sm">
                    {children}
                </table>
            </div>
        ),
        thead: ({ children }) => (
            <thead className="bg-panel-hover/60 text-text-muted">{children}</thead>
        ),
        tbody: ({ children }) => (
            <tbody className="divide-y divide-border-subtle/60">{children}</tbody>
        ),
        tr: ({ children }) => <tr className="align-top">{children}</tr>,
        th: ({ children }) => (
            <th className="whitespace-nowrap px-3 py-1.5 text-2xs font-medium uppercase tracking-wide">
                {children}
            </th>
        ),
        td: ({ children }) => (
            <td className="max-w-[28rem] wrap-break-word px-3 py-1.5 text-sm text-text-secondary">
                {children}
            </td>
        ),

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input: (props: any) => {
            if (props.type === "checkbox") {
                return (
                    <input
                        type="checkbox"
                        checked={!!props.checked}
                        disabled
                        readOnly
                        className="mr-1.5 align-middle accent-[var(--accent)]"
                        aria-disabled
                    />
                );
            }
            return null;
        },

        p: ({ children }) => (
            <p className="mb-2 last:mb-0 text-sm leading-relaxed text-text-primary">
                {children}
            </p>
        ),
        ul: ({ children }) => (
            <ul className="mb-2 ml-4 list-outside list-disc space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
            <ol className="mb-2 ml-4 list-outside list-decimal space-y-1">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => (
            <h1 className="mb-2 mt-3 text-lg font-semibold text-text-primary">{children}</h1>
        ),
        h2: ({ children }) => (
            <h2 className="mb-1.5 mt-3 text-base font-semibold text-text-primary">{children}</h2>
        ),
        h3: ({ children }) => (
            <h3 className="mb-1 mt-2 text-sm font-semibold text-text-primary">{children}</h3>
        ),
        h4: ({ children }) => (
            <h4 className="mb-1 mt-2 text-sm font-medium text-text-primary">{children}</h4>
        ),
        strong: ({ children }) => (
            <strong className="font-semibold text-text-primary">{children}</strong>
        ),
        em: ({ children }) => (
            <em className="italic text-text-secondary">{children}</em>
        ),
        hr: () => <hr className="my-3 border-border-subtle" />,
        blockquote: ({ children }) => (
            <blockquote className="my-2 rounded-r-lg border-l-2 border-accent/50 bg-panel/30 py-1 pl-3 text-text-muted">
                {children}
            </blockquote>
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        code: ({ className, children }: any) => {
            const text = String(children).replace(/\n$/, "");
            const isBlock = className?.includes("language-") || text.includes("\n");
            if (isBlock) {
                return (
                    <pre className="my-2 max-w-full overflow-x-auto rounded-lg border border-border-subtle bg-panel p-3 font-mono text-[12px] leading-relaxed text-text-secondary">
                        <code>{text}</code>
                    </pre>
                );
            }
            return (
                <code className="rounded border border-border-subtle bg-panel px-1 py-0.5 font-mono text-[12px] text-text-primary">
                    {children}
                </code>
            );
        },
        pre: ({ children }) => <>{children}</>,
        script: () => null,
        style: () => null,
        iframe: () => null,
    };
}

/** GFM + raw HTML (bot comments) for GitHub issue/PR/release bodies. */
export function GitMarkdown({
    content,
    className,
    ctx,
}: {
    content: string;
    className?: string;
    ctx?: GitMarkdownCtx;
}) {
    const cleaned = preprocessGitHubBody(content);
    if (!cleaned) return null;

    return (
        <div
            className={cn(
                "git-markdown prose-compact max-w-none min-w-0 overflow-x-auto wrap-break-word text-sm leading-relaxed text-text-primary select-text",
                className,
            )}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={createComponents(ctx)}
            >
                {cleaned}
            </ReactMarkdown>
        </div>
    );
}
