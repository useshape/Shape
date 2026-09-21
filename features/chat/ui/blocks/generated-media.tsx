"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function GeneratedMediaCard({
    kind,
    src,
    prompt,
    credits,
    loading,
}: {
    kind: "svg" | "image";
    src?: string;
    prompt?: string;
    credits?: string;
    loading?: boolean;
}) {
    const url = (src || "").trim();
    const [ready, setReady] = useState(false);
    const showShimmer = loading || (!!url && !ready);

    if (!url && !loading) {
        return (
            <div className="my-2 w-full max-w-[340px] overflow-hidden rounded-xl border border-border bg-surface-3">
                <div className="flex h-32 items-center justify-center px-3 text-center text-sm text-text-muted">
                    {kind === "svg" ? "SVG" : "Image"} generation failed
                </div>
            </div>
        );
    }

    return (
        <div className="my-2 w-full max-w-[340px] overflow-hidden rounded-xl border border-border bg-surface-3">
            <div className="relative aspect-4/3 bg-surface-2">
                {showShimmer ? (
                    <div className="preview-shimmer absolute inset-0" aria-hidden />
                ) : null}
                {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={url}
                        alt={prompt || (kind === "svg" ? "Generated SVG" : "Generated image")}
                        className={cn(
                            "relative z-10 size-full object-contain p-3 transition-opacity duration-300",
                            ready ? "opacity-100" : "opacity-0",
                        )}
                        onLoad={() => setReady(true)}
                    />
                ) : null}
            </div>
            {prompt || credits ? (
                <div className="flex items-start justify-between gap-2 px-3 py-2">
                    <p className="min-w-0 truncate text-xs text-text-secondary">{prompt}</p>
                    {credits ? (
                        <span className="shrink-0 text-xs tabular-nums text-text-muted">{credits}</span>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
