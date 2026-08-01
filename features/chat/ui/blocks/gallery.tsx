"use client";

import React, { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";

export type DesignPreviewItem = {
    id: string;
    name: string;
    style: string;
    path: string;
    width: number;
    height: number;
    renderMs?: number;
    kind?: "html" | "png";
};

function isHtmlPreview(item: DesignPreviewItem): boolean {
    if (item.kind === "html") return true;
    if (item.kind === "png") return false;
    return /\.html?$/i.test(item.path);
}

function resolveSrc(path: string): string {
    if (path.startsWith("data:") || path.startsWith("http") || path.startsWith("asset:")) {
        return path;
    }
    return convertFileSrc(path);
}

/**
 * Single interactive component preview, fixed in the chat column.
 * No lightbox, no multi-card picker, no Select — reply in chat to continue.
 */
export function DesignPreviewGallery({
    previews,
}: {
    previews: DesignPreviewItem[];
    selectedId?: string;
}) {
    const item = useMemo(() => {
        const valid = previews.filter((p) => Boolean(p.id?.trim()) && Boolean(p.path?.trim()));
        return valid[0] ?? null;
    }, [previews]);

    if (!item) return null;

    const html = isHtmlPreview(item);
    const src = resolveSrc(item.path);
    const frameW = Math.min(Math.max(item.width || 640, 280), 900);
    const frameH = Math.min(Math.max(item.height || 360, 160), 520);

    return (
        <div className="my-2 w-full max-w-full overflow-hidden rounded-lg border border-border-subtle bg-panel">
            {(item.name || item.style) && (
                <div className="flex items-baseline gap-2 border-b border-border-subtle px-2.5 py-1.5">
                    {item.name ? (
                        <span className="truncate text-xs font-medium text-text-primary">
                            {item.name}
                        </span>
                    ) : null}
                    {item.style ? (
                        <span className="truncate text-[11px] text-text-muted">{item.style}</span>
                    ) : null}
                </div>
            )}
            <div
                className={cn(
                    "relative w-full overflow-auto bg-white",
                    "max-h-[min(520px,55vh)]",
                )}
            >
                {html ? (
                    <iframe
                        title={item.name || "Component preview"}
                        src={src}
                        className="block border-0"
                        style={{
                            width: frameW,
                            height: frameH,
                            maxWidth: "100%",
                        }}
                        sandbox="allow-scripts allow-same-origin"
                    />
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={src}
                        alt={item.name || "Preview"}
                        className="block h-auto max-h-[min(520px,55vh)] w-full object-contain object-top"
                        draggable={false}
                    />
                )}
            </div>
        </div>
    );
}
