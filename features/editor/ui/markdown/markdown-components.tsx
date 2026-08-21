"use client";

import React, { memo, useMemo, useState } from "react";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import { childText, headingSlug, layoutHtmlProps } from "./lib/html-props";
import { sourceRangeFromElement } from "./lib/markdown-format";
import { MarkdownCodeBlock, MarkdownInlineCode } from "./markdown-code";
import { isDiagramLanguage, MarkdownChart } from "./markdown-chart";
import { useMarkdownPreview } from "./markdown-context";

function isBadgeSrc(src: string, alt?: string): boolean {
    return (
        /shields\.io|\/badge\/|badge\.fury|img\.shields|github\.com\/.*\/actions\/workflows\/.*\/badge/i.test(src) ||
        (/\.svg(\?|$)/i.test(src) &&
            /workflow|build|coverage|license|npm|version|status|pass|fail/i.test(src + (alt || "")))
    );
}

const ALERT_CLASS: Record<string, string> = {
    NOTE: "border-info bg-info/10",
    TIP: "border-success bg-success/10",
    IMPORTANT: "border-accent bg-accent/10",
    WARNING: "border-warning bg-warning/10",
    CAUTION: "border-error bg-error/10",
};

const ALERT_LABELS: Record<string, string> = {
    NOTE: "Note",
    TIP: "Tip",
    IMPORTANT: "Important",
    WARNING: "Warning",
    CAUTION: "Caution",
};

const MdPre = memo(function MdPre({
    children,
    className,
    ...props
}: React.HTMLAttributes<HTMLPreElement>) {
    const { rest, style } = layoutHtmlProps(props as Record<string, unknown>);
    const child = React.Children.toArray(children)[0];
    if (isDiagramLanguage(className) || className?.includes("mermaid")) {
        const text = childText(children);
        return <MarkdownChart source={text} />;
    }
    if (React.isValidElement(child)) return <>{children}</>;
    return (
        <pre className={className} style={style} {...rest}>
            {children}
        </pre>
    );
});

const MdCode = memo(function MdCode({
    className,
    children,
    ...props
}: {
    className?: string;
    children?: React.ReactNode;
} & Record<string, unknown>) {
    const match = /language-(\w+)/.exec(className || "");
    const codeText = String(children).replace(/\n$/, "");
    const isBlock = Boolean(match) || className === "language-mermaid" || codeText.includes("\n");
    if (isBlock) {
        return <MarkdownCodeBlock language={match?.[1] || (className?.includes("mermaid") ? "mermaid" : undefined)} code={codeText} />;
    }
    const { rest } = layoutHtmlProps(props);
    return (
        <MarkdownInlineCode className={className} {...rest}>
            {children}
        </MarkdownInlineCode>
    );
});

const MdImg = memo(function MdImg({
    src,
    alt,
    className,
    ...props
}: {
    src?: string;
    alt?: string;
    className?: string;
} & Record<string, unknown>) {
    const api = useMarkdownPreview();
    const { rest, style } = layoutHtmlProps(props);
    const original = typeof src === "string" ? src : "";
    const urls = useMemo(
        () => (api ? api.resolveImageUrls(original) : original ? [original] : []),
        [api, original],
    );
    const [urlIndex, setUrlIndex] = useState(0);
    const currentSrc = urls[Math.min(urlIndex, Math.max(0, urls.length - 1))] ?? original;
    const badge = isBadgeSrc(original, alt);

    if (!original && !urls.length) return null;

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={currentSrc}
            alt={alt || ""}
            data-md-src={original}
            draggable={false}
            className={cn(
                "max-w-full bg-transparent align-middle",
                badge ? "my-0.5 inline-block max-h-5" : "inline-block h-auto",
                className,
            )}
            style={style}
            onError={() => {
                if (urlIndex < urls.length - 1) setUrlIndex((i) => i + 1);
            }}
            onClick={(e) => {
                if (!api?.editable) return;
                e.preventDefault();
                e.stopPropagation();
                api.selectImage(e.currentTarget);
            }}
            {...rest}
        />
    );
});

const MdA = memo(function MdA({
    href,
    children,
    className,
    ...props
}: {
    href?: string;
    children?: React.ReactNode;
    className?: string;
} & Record<string, unknown>) {
    const { rest, style } = layoutHtmlProps(props);
    return (
        <a
            href={href}
            className={cn("text-accent-text no-underline hover:text-accent-text-hover hover:underline", className)}
            style={style}
            {...rest}
        >
            {children}
        </a>
    );
});

const HEADING_CLASS: Record<string, string> = {
    h1: "mt-6 mb-4 border-b border-border-subtle pb-[0.3em] text-[2em] font-semibold leading-tight text-text-primary first:mt-0",
    h2: "mt-6 mb-4 border-b border-border-subtle pb-[0.3em] text-[1.5em] font-semibold leading-tight text-text-primary first:mt-0",
    h3: "mt-6 mb-4 text-[1.25em] font-semibold leading-tight text-text-primary first:mt-0",
    h4: "mt-6 mb-4 text-[1em] font-semibold leading-tight text-text-primary first:mt-0",
    h5: "mt-6 mb-4 text-[0.875em] font-semibold leading-tight text-text-primary first:mt-0",
    h6: "mt-6 mb-4 text-[0.85em] font-semibold leading-tight text-text-secondary first:mt-0",
};

function MdHeading(tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
    return function Heading({
        children,
        className,
        ...props
    }: React.HTMLAttributes<HTMLHeadingElement>) {
        const { rest, style } = layoutHtmlProps(props as Record<string, unknown>);
        const id = headingSlug(childText(children));
        const Tag = tag;
        return (
            <Tag id={id || undefined} className={cn(HEADING_CLASS[tag], className)} style={style} {...rest}>
                {children}
            </Tag>
        );
    };
}

function MdFlow({
    tag: Tag,
    children,
    className,
    ...props
}: {
    tag: "p" | "div" | "span" | "section" | "article";
    children?: React.ReactNode;
    className?: string;
} & Record<string, unknown>) {
    const { rest, style } = layoutHtmlProps(props);
    return (
        <Tag
            className={cn(
                Tag === "p" && "mt-0 mb-4 empty:min-h-6 has-[>br:only-child]:min-h-6 last:mb-0",
                className,
            )}
            style={style}
            {...rest}
        >
            {children}
        </Tag>
    );
}

const MdTable = memo(function MdTable({
    children,
    className,
    ...props
}: {
    children?: React.ReactNode;
    className?: string;
} & Record<string, unknown>) {
    const { rest, style } = layoutHtmlProps(props);
    return (
        <div className="mb-4 max-w-full overflow-x-auto">
            <table
                className={cn("w-max max-w-full border-collapse border-spacing-0", className)}
                style={style}
                {...rest}
            >
                {children}
            </table>
        </div>
    );
});

const MdBlockquote = memo(function MdBlockquote({
    children,
    className,
    ...props
}: {
    children?: React.ReactNode;
    className?: string;
} & Record<string, unknown>) {
    const { rest, style } = layoutHtmlProps(props);
    const kind = typeof rest["data-md-alert"] === "string" ? String(rest["data-md-alert"]) : undefined;
    return (
        <blockquote
            className={cn(
                "mb-4 border-l-[0.25em] border-border py-0 pl-4 text-text-secondary *:first:mt-0 *:last:mb-0",
                kind && cn("rounded-r-lg px-3 py-2 text-text-primary", ALERT_CLASS[kind]),
                className,
            )}
            style={style}
            {...rest}
        >
            {kind && ALERT_LABELS[kind] ? (
                <div className="mb-1.5 flex items-center gap-1.5 text-[0.9em] font-semibold">{ALERT_LABELS[kind]}</div>
            ) : null}
            {children}
        </blockquote>
    );
});

const MdInput = memo(function MdInput(props: Record<string, unknown>) {
    const api = useMarkdownPreview();
    const { rest } = layoutHtmlProps(props);
    if (rest.type !== "checkbox") return null;
    const checked = Boolean(rest.checked);
    return (
        <input
            type="checkbox"
            checked={checked}
            readOnly={!api?.editable}
            className="mt-0 mr-[0.4em] mb-[0.15em] -ml-[1.4em] align-middle accent-accent"
            onChange={(e) => {
                if (!api?.editable) return;
                const range = sourceRangeFromElement(
                    e.currentTarget,
                    e.currentTarget.closest("[data-md-body]") as HTMLElement | null,
                    api.content.length,
                );
                if (range) api.toggleTask(range);
            }}
            onClick={(e) => e.stopPropagation()}
        />
    );
});

export const markdownComponents = {
    pre: MdPre,
    code: MdCode,
    img: MdImg,
    a: MdA,
    p: (p: React.HTMLAttributes<HTMLParagraphElement>) => <MdFlow tag="p" {...p} />,
    div: (p: React.HTMLAttributes<HTMLDivElement>) => <MdFlow tag="div" {...p} />,
    span: (p: React.HTMLAttributes<HTMLSpanElement>) => <MdFlow tag="span" {...p} />,
    h1: MdHeading("h1"),
    h2: MdHeading("h2"),
    h3: MdHeading("h3"),
    h4: MdHeading("h4"),
    h5: MdHeading("h5"),
    h6: MdHeading("h6"),
    table: MdTable,
    thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...props}>{children}</thead>,
    tbody: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
        <tbody {...props}>{children}</tbody>
    ),
    tr: ({ children, className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
        <tr className={cn("even:bg-surface-2/55", className)} {...props}>{children}</tr>
    ),
    th: ({ children, className, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => {
        const { rest, style } = layoutHtmlProps(props as Record<string, unknown>);
        return (
            <th
                className={cn("border border-border-subtle bg-surface-2 px-3 py-1.5 text-left font-semibold", className)}
                style={style}
                {...rest}
            >
                {children}
            </th>
        );
    },
    td: ({ children, className, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => {
        const { rest, style } = layoutHtmlProps(props as Record<string, unknown>);
        return (
            <td className={cn("border border-border-subtle px-3 py-1.5", className)} style={style} {...rest}>
                {children}
            </td>
        );
    },
    ul: ({ children, className, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
        <ul
            className={cn(
                "mt-0 mb-4 list-disc pl-8 [&>li+li]:mt-1 [&_li>p]:mb-0 [&_ul]:list-[circle] [&_ul_ul]:list-[square]",
                className,
            )}
            {...props}
        >
            {children}
        </ul>
    ),
    ol: ({ children, className, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
        <ol className={cn("mt-0 mb-4 list-decimal pl-8 [&>li+li]:mt-1 [&_li>p]:mb-0", className)} {...props}>
            {children}
        </ol>
    ),
    li: ({ children, className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
        <li className={cn("[&.task-list-item]:list-none", className)} {...props}>{children}</li>
    ),
    hr: ({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) => (
        <hr className={cn("my-6 h-1 border-0 bg-border-subtle", className)} {...props} />
    ),
    strong: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <strong className={cn("font-semibold text-text-primary", className)} {...props}>{children}</strong>
    ),
    em: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <em className={cn("italic", className)} {...props}>{children}</em>
    ),
    del: ({ children, className, ...props }: React.HTMLAttributes<HTMLModElement>) => (
        <del className={cn("text-text-secondary line-through", className)} {...props}>{children}</del>
    ),
    mark: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <mark className={cn("rounded bg-accent-text-bg px-1 py-px text-accent-text", className)} {...props}>
            {children}
        </mark>
    ),
    kbd: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <kbd
            className={cn(
                "inline-block rounded-md border border-border-subtle border-b-border bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] leading-none text-text-primary shadow-[inset_0_-1px_0_var(--border)]",
                className,
            )}
            {...props}
        >
            {children}
        </kbd>
    ),
    details: ({ children, className, ...props }: React.HTMLAttributes<HTMLDetailsElement>) => (
        <details className={cn("mb-4 rounded-lg border border-border-subtle bg-panel px-4 py-2", className)} {...props}>
            {children}
        </details>
    ),
    summary: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <summary className={cn("cursor-pointer font-semibold", className)} {...props}>{children}</summary>
    ),
    blockquote: MdBlockquote,
    input: MdInput,
    script: () => null,
    style: () => null,
} as unknown as Components;
