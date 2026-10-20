"use client";

import { useSyncExternalStore, useState } from "react";
import { cn } from "@/lib/utils";
import { getSelectedTalkMediaId, setSelectedTalkMediaId, subscribeTalkMedia } from "@/lib/chat/talk-media";

function modelAlias(model?: string) {
    if (!model) return "";
    if (model.includes("9b") || model === "klein9") return "@klein9";
    if (model.includes("mini") || model === "mini") return "@mini";
    if (model.includes("klein") || model === "klein" || model.includes("flux")) return "@klein";
    return `@${model}`;
}

export function GeneratedMediaCard({
    kind,
    src,
    prompt,
    loading,
    mediaId,
    model,
    failed,
    selectable,
}: {
    kind: "svg" | "image" | "audio";
    src?: string;
    prompt?: string;
    credits?: string;
    loading?: boolean;
    mediaId?: string;
    model?: string;
    failed?: boolean;
    selectable?: boolean;
}) {
    const url = (src || "").trim();
    const [ready, setReady] = useState(() => url.startsWith("data:") || kind === "audio");
    const showShimmer = loading || (!!url && !ready && kind !== "audio");
    const selected = useSyncExternalStore(subscribeTalkMedia, getSelectedTalkMediaId, () => null);
    const alias = modelAlias(model);
    const isSelected = Boolean(selectable && mediaId && selected === mediaId);

    if ((!url && !loading) || failed) {
        return (
            <div className="my-2 w-full max-w-[360px] overflow-hidden rounded-xl border border-border-subtle bg-surface-3">
                <div className="flex h-28 flex-col items-center justify-center gap-2 px-3 text-center text-sm text-text-muted">
                    <span>{kind === "svg" ? "SVG" : kind === "audio" ? "Audio" : "Image"} generation failed{alias ? ` (${alias})` : ""}</span>
                    {prompt ? (
                        <button
                            type="button"
                            className="rounded-full bg-panel-hover px-3 py-1 text-xs text-text-primary"
                            onClick={() => {
                                window.dispatchEvent(
                                    new CustomEvent("shape-retry-image", {
                                        detail: { prompt, model, mediaId },
                                    }),
                                );
                            }}
                        >
                            Retry
                        </button>
                    ) : null}
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
                </div>
            </div>
        );
    }

    return (
        <button
            type="button"
            disabled={!selectable || !mediaId}
            onClick={() => {
                if (mediaId) setSelectedTalkMediaId(isSelected ? null : mediaId);
            }}
            className={cn(
                "my-2 w-full max-w-[360px] overflow-hidden rounded-xl border bg-surface-3 text-left",
                isSelected ? "border-accent" : "border-border-subtle",
            )}
        >
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
            {alias ? (
                <div className="px-3 py-1.5 text-xs text-text-muted">{alias}</div>
            ) : null}
        </button>
    );
}
