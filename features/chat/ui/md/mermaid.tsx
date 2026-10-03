"use client";

import React, { useEffect, useState } from "react";

export function ChatMermaid({ source }: { source: string }) {
    const [svg, setSvg] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setFailed(false);
        setSvg(null);
        void (async () => {
            try {
                const mermaid = (await import("mermaid")).default;
                mermaid.initialize({
                    startOnLoad: false,
                    securityLevel: "strict",
                    theme: "neutral",
                });
                const id = `mmd-${Math.random().toString(36).slice(2, 10)}`;
                const { svg: rendered } = await mermaid.render(id, source);
                if (!cancelled) setSvg(rendered);
            } catch {
                if (!cancelled) setFailed(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [source]);

    if (failed) {
        return (
            <pre className="my-1 overflow-x-auto squircle-2xl border border-border-subtle bg-surface-3 p-3 chat-text font-mono text-text-secondary">
                {source}
            </pre>
        );
    }
    if (!svg) {
        return <div className="my-1 h-16 squircle-2xl bg-surface-3" aria-hidden />;
    }
    return (
        <div
            className="my-1 overflow-x-auto squircle-2xl bg-surface-3 p-3 text-text-primary [&_svg]:mx-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}
