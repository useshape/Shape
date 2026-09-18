"use client";

import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

const Prism = lazy(() =>
    import("react-syntax-highlighter").then((m) => ({ default: m.Prism })),
);

export function SyntaxHighlighter({
    children,
    fallback,
    ...props
}: {
    children?: ReactNode;
    fallback?: ReactNode;
    [key: string]: unknown;
}) {
    const Highlight = Prism as unknown as ComponentType<Record<string, unknown>>;
    return (
        <Suspense fallback={fallback ?? <pre className="m-0 overflow-x-auto font-mono text-sm">{children}</pre>}>
            <Highlight {...props}>{children}</Highlight>
        </Suspense>
    );
}
