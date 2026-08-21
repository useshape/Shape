"use client";

import { memo, useCallback, useState, type ReactNode, type HTMLAttributes } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getShapeSyntaxTheme } from "@/lib/ui/syntax-theme";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { isDiagramLanguage, MarkdownChart } from "./markdown-chart";

const LARGE_CODE_BLOCK_CHARS = 4_000;

const LANG_ALIASES: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    tsx: "tsx",
    jsx: "jsx",
    sh: "bash",
    zsh: "bash",
    shell: "bash",
    yml: "yaml",
    md: "markdown",
    rs: "rust",
    py: "python",
};

function resolveLang(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    return LANG_ALIASES[raw.toLowerCase()] ?? raw.toLowerCase();
}

export const MarkdownCodeBlock = memo(function MarkdownCodeBlock({
    language,
    code,
}: {
    language?: string;
    code: string;
}) {
    const [copied, setCopied] = useState(false);
    const lang = resolveLang(language);

    const copy = useCallback(() => {
        void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        });
    }, [code]);

    if (isDiagramLanguage(language)) {
        return <MarkdownChart source={code} />;
    }

    const usePlain = code.length > LARGE_CODE_BLOCK_CHARS;

    return (
        <div className="relative mb-4 overflow-hidden rounded-lg border border-border-subtle bg-surface-2" data-md-code>
            <div className="flex min-h-8 items-center justify-between gap-2 border-b border-border-subtle bg-surface-3/70 px-3">
                <span className="font-mono text-xs text-text-muted">{language || "text"}</span>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={copied ? "Copied" : "Copy"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={copy}
                >
                    <Icon name={copied ? "check" : "content_copy"} size={14} />
                </Button>
            </div>
            {usePlain || !lang ? (
                <pre className="m-0 overflow-x-auto bg-transparent p-3 font-mono text-[13px] leading-relaxed">
                    <code>{code}</code>
                </pre>
            ) : (
                <SyntaxHighlighter
                    style={getShapeSyntaxTheme()}
                    language={lang}
                    PreTag="div"
                    className="m-0 overflow-x-auto bg-transparent p-3 font-mono text-[13px] leading-relaxed"
                    customStyle={{
                        margin: 0,
                        padding: "12px 16px",
                        background: "transparent",
                        fontSize: "13px",
                        lineHeight: 1.55,
                    }}
                >
                    {code}
                </SyntaxHighlighter>
            )}
        </div>
    );
});

export function MarkdownInlineCode({
    children,
    className,
    ...props
}: {
    children?: ReactNode;
    className?: string;
} & HTMLAttributes<HTMLElement>) {
    return (
        <code className={cn("rounded-md bg-surface-2 px-[0.4em] py-[0.2em] font-mono text-[85%]", className)} {...props}>
            {children}
        </code>
    );
}
