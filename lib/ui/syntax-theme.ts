import type { CSSProperties } from "react";

/** Token-aware syntax highlighting theme for react-syntax-highlighter */
export function getShapeSyntaxTheme(): Record<string, CSSProperties> {
    return {
        'code[class*="language-"]': {
            color: "var(--text-primary)",
            background: "transparent",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-sm)",
        },
        pre: {
            color: "var(--text-primary)",
            background: "transparent",
            margin: 0,
            padding: 0,
        },
        comment: { color: "var(--text-muted)", fontStyle: "italic" },
        prolog: { color: "var(--text-muted)" },
        doctype: { color: "var(--text-muted)" },
        cdata: { color: "var(--text-muted)" },
        punctuation: { color: "var(--text-secondary)" },
        property: { color: "var(--info)" },
        tag: { color: "var(--accent)" },
        boolean: { color: "var(--accent)" },
        number: { color: "var(--accent-hover)" },
        constant: { color: "var(--accent-hover)" },
        symbol: { color: "var(--accent-hover)" },
        deleted: { color: "var(--git-deleted)" },
        selector: { color: "var(--success)" },
        "attr-name": { color: "var(--success)" },
        string: { color: "var(--success)" },
        char: { color: "var(--success)" },
        builtin: { color: "var(--info)" },
        inserted: { color: "var(--git-added)" },
        entity: { color: "var(--text-primary)" },
        url: { color: "var(--info)" },
        ".language-css .token.string": { color: "var(--accent)" },
        ".style .token.string": { color: "var(--accent)" },
        atrule: { color: "var(--accent)" },
        "attr-value": { color: "var(--success)" },
        keyword: { color: "var(--accent)" },
        function: { color: "var(--info)" },
        "class-name": { color: "var(--warning)" },
        regex: { color: "var(--warning)" },
        important: { color: "var(--error)" },
        variable: { color: "var(--text-primary)" },
        operator: { color: "var(--text-secondary)" },
    };
}

export function getGitStatusColor(status: string): string | undefined {
    if (status === "M") return "var(--git-modified)";
    if (status === "A" || status === "U") return "var(--git-added)";
    if (status === "D") return "var(--git-deleted)";
    return undefined;
}
