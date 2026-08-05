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
 * Full-width preview card; iframe fills the card and the sandbox centers the component.
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
    const frameH = Math.min(Math.max(item.height || 360, 200), 480);

    return (
        <div
            className={cn(
                "my-2 w-full max-w-full overflow-hidden rounded-lg border border-border-subtle",
                "bg-zinc-950",
            )}
        >
            <div className="relative w-full overflow-hidden" style={{ height: frameH }}>
                {html ? (
                    <iframe
                        title={item.name || "Component preview"}
                        src={src}
                        className="absolute inset-0 h-full w-full border-0"
                        sandbox="allow-scripts allow-same-origin"
                    />
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={src}
                        alt={item.name || "Preview"}
                        className="absolute inset-0 h-full w-full object-contain object-center"
                        draggable={false}
                    />
                )}
            </div>
        </div>
    );
}
