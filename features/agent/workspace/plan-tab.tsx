"use client";

import { useEffect, useState } from "react";
import { commands } from "@/lib/backend";
import { MarkdownPreview } from "@/features/editor/ui/markdown/markdown";

/** Plan markdown viewer for a right-workspace tab. */
export function PlanTabView({ path }: { path: string }) {
    const [content, setContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setContent(null);
        setError(null);
        void commands
            .readFile(path)
            .then((text) => {
                if (!cancelled) setContent(text);
            })
            .catch((e) => {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : String(e));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [path]);

    if (error) {
        return (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-text-muted">
                {error}
            </div>
        );
    }
    if (content === null) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
                Loading…
            </div>
        );
    }

    return (
        <div className="h-full min-h-0 overflow-hidden bg-panel">
            <MarkdownPreview content={content} filePath={path} className="h-full" />
        </div>
    );
}
