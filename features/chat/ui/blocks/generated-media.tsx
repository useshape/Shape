"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function GeneratedMediaCard({
    kind,
    src,
    prompt,
    loading,
}: {
    kind: "svg" | "image" | "audio";
    src?: string;
    prompt?: string;
    credits?: string;
    loading?: boolean;
}) {
    const url = (src || "").trim();
    const [ready, setReady] = useState(() => url.startsWith("data:") || kind === "audio");
    const showShimmer = loading || (!!url && !ready && kind !== "audio");

    if (!url && !loading) {
        return (
            <div className="my-2 w-full max-w-[360px] overflow-hidden rounded-xl border border-border-subtle bg-surface-3">
                <div className="flex h-28 items-center justify-center px-3 text-center text-sm text-text-muted">
                    {kind === "svg" ? "SVG" : kind === "audio" ? "Audio" : "Image"} generation failed
                </div>
            </div>
        );
    }

    if (kind === "audio") {
        return (
            <div
                className={cn(
                    "relative my-2 w-full max-w-[360px] overflow-hidden rounded-xl border border-border-subtle",
                    "bg-linear-to-br from-accent/25 via-surface-3 to-surface-2 p-4",
                )}
            >
                <div
                    className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-accent/30 blur-3xl"
                    aria-hidden
                />
                <div
                    className="pointer-events-none absolute -bottom-12 -left-6 size-32 rounded-full bg-accent/15 blur-2xl"
                    aria-hidden
                />
                <div className="relative z-10 flex flex-col gap-3">
                    <div className="text-xs font-medium text-text-secondary">Generated audio</div>
                    {loading && !url ? (
                        <div className="preview-shimmer h-11 rounded-lg" aria-hidden>
                            <span className="preview-shimmer-blob" />
                        </div>
                    ) : (
                        <audio
                            controls
                            src={url}
                            className="w-full rounded-lg"
                            preload="metadata"
                            aria-label={prompt || "Generated audio"}
                        />
                    )}
                    {prompt ? (
                        <p className="line-clamp-2 text-xs text-text-muted">{prompt}</p>
                    ) : null}
                </div>
            </div>
        );
    }

    // SVG / image — fill the card; no letterbox bars.
    return (
        <div className="my-2 w-full max-w-[360px] overflow-hidden rounded-xl border border-border-subtle bg-surface-3">
            <div
                className={cn(
                    "relative w-full overflow-hidden bg-surface-2",
                    kind === "svg" ? "min-h-[120px]" : "aspect-square",
                )}
            >
                {showShimmer ? (
                    <div className="preview-shimmer absolute inset-0" aria-hidden>
                        <span className="preview-shimmer-blob" />
                    </div>
                ) : null}
                {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={url}
                        alt={prompt || (kind === "svg" ? "Generated SVG" : "Generated image")}
                        className={cn(
                            "relative z-10 block w-full transition-opacity duration-300",
                            kind === "svg"
                                ? "h-auto max-h-[420px] object-contain object-center p-2"
                                : "size-full object-cover",
                            ready ? "opacity-100" : "opacity-0",
                        )}
                        onLoad={() => setReady(true)}
                    />
                ) : null}
            </div>
        </div>
    );
}
