"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type MermaidApi = {
    initialize: (opts: Record<string, unknown>) => void;
    render: (id: string, source: string) => Promise<{ svg: string }>;
};

let mermaidPromise: Promise<MermaidApi | null> | null = null;
let mermaidReady = false;

function loadMermaid(): Promise<MermaidApi | null> {
    if (mermaidPromise) return mermaidPromise;
    mermaidPromise = import("mermaid")
        .then((mod) => {
            const api = (mod.default ?? mod) as MermaidApi;
            return api;
        })
        .catch(() => null);
    return mermaidPromise;
}

export function MarkdownChart({ source, className }: { source: string; className?: string }) {
    const hostRef = useRef<HTMLDivElement>(null);
    const reactId = useId().replace(/:/g, "");
    const [fallback, setFallback] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const src = source.trim();
        if (!src) return;

        void (async () => {
            const mermaid = await loadMermaid();
            if (cancelled) return;
            if (!mermaid) {
                setFallback(src);
                return;
            }
            try {
                if (!mermaidReady) {
                    mermaid.initialize({
                        startOnLoad: false,
                        securityLevel: "strict",
                        theme: "dark",
                        fontFamily: "inherit",
                        themeVariables: {
                            darkMode: true,
                            background: "transparent",
                            primaryTextColor: "var(--text-primary)",
                            primaryColor: "var(--surface-3)",
                            lineColor: "var(--border)",
                            secondaryColor: "var(--surface-2)",
                            tertiaryColor: "var(--panel)",
                        },
                    });
                    mermaidReady = true;
                }
                const id = `shape-md-mmd-${reactId}-${Math.random().toString(36).slice(2, 8)}`;
                const { svg } = await mermaid.render(id, src);
                if (cancelled || !hostRef.current) return;
                hostRef.current.innerHTML = svg;
                setFallback(null);
            } catch {
                if (!cancelled) setFallback(src);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [source, reactId]);

    return (
        <div
            className={cn(
                "mb-4 overflow-x-auto rounded-lg border border-border-subtle bg-surface-2 p-4 text-center [&_svg]:h-auto [&_svg]:max-w-full",
                className,
            )}
            data-md-chart
        >
            {fallback ? (
                <pre className="whitespace-pre-wrap text-left font-mono text-[13px] text-text-secondary">{fallback}</pre>
            ) : (
                <div ref={hostRef} />
            )}
        </div>
    );
}

export function isDiagramLanguage(lang: string | undefined): boolean {
    if (!lang) return false;
    const l = lang.toLowerCase();
    return l === "mermaid" || l === "chart" || l === "flowchart";
}
