"use client";

import React, { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { ChatCard } from "./chat-card";
import { GridReveal } from "./grid-reveal";

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
    return (
        /\.html?$/i.test(item.path)
        || item.path.startsWith("data:text/html")
        || /^\s*</.test(item.path)
    );
}

function htmlSrcDoc(path: string): string | undefined {
    const trimmed = path.trim();
    if (/^\s*</.test(trimmed)) return trimmed;
    if (!trimmed.startsWith("data:text/html")) return undefined;
    const comma = trimmed.indexOf(",");
    if (comma < 0) return undefined;
    const payload = trimmed.slice(comma + 1);
    if (/;base64/i.test(trimmed.slice(0, comma))) {
        try {
            return atob(payload);
        } catch {
            return undefined;
        }
    }
    try {
        return decodeURIComponent(payload);
    } catch {
        return payload;
    }
}

function resolveSrc(path: string): string {
    if (
        path.startsWith("data:")
        || path.startsWith("http")
        || path.startsWith("blob:")
        || path.startsWith("asset:")
    ) {
        return path;
    }
    try {
        return convertFileSrc(path);
    } catch {
        return path;
    }
}

/**
 * Compact in-chat preview. While the agent is still generating, the splitting
 * grid runs; the live iframe fades in on top once it loads.
 */
export function DesignPreviewGallery({
    previews,
    isGenerating,
}: {
    previews: DesignPreviewItem[];
    selectedId?: string;
    isGenerating?: boolean;
}) {
    const item = useMemo(() => {
        const valid = previews.filter((p) => Boolean(p.id?.trim()) && Boolean(p.path?.trim()));
        return valid[0] ?? null;
    }, [previews]);
    const [frameReady, setFrameReady] = useState(false);

    useEffect(() => {
        setFrameReady(false);
    }, [item?.path]);

    const html = item ? isHtmlPreview(item) : false;
    const srcDoc = item && html ? htmlSrcDoc(item.path) : undefined;
    const src = item ? resolveSrc(item.path) : "";
    const ratio =
        item && item.width > 0 && item.height > 0
            ? item.width / item.height
            : 16 / 9;
    const showGrid = Boolean(isGenerating) || !item || !frameReady;
    const imageSrc = item && !html ? src : null;

    if (!item && !isGenerating) return null;

    return (
        <ChatCard className="my-2 overflow-hidden">
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: ratio }}>
                {showGrid ? (
                    <GridReveal
                        src={imageSrc}
                        alt={item?.name || "Component preview"}
                        aspect={ratio}
                        caption={isGenerating || !item ? "Creating preview" : "Loading preview"}
                        estimatedDuration={8000}
                        className="absolute inset-0 z-10 h-full w-full rounded-none"
                        style={{ aspectRatio: "unset", height: "100%" }}
                        onRevealComplete={() => {
                            if (imageSrc) setFrameReady(true);
                        }}
                    />
                ) : null}
                {item && html ? (
                    <iframe
                        title={item.name || "Component preview"}
                        {...(srcDoc ? { srcDoc } : { src })}
                        scrolling="no"
                        className={cn(
                            "absolute inset-0 z-0 h-full w-full overflow-hidden border-0 bg-transparent transition-opacity duration-300",
                            frameReady && !isGenerating ? "opacity-100" : "opacity-0 pointer-events-none",
                        )}
                        sandbox="allow-scripts"
                        onLoad={() => setFrameReady(true)}
                    />
                ) : null}
                {item && !html && frameReady ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={src}
                        alt={item.name || "Preview"}
                        className="absolute inset-0 h-full w-full object-contain object-center"
                        draggable={false}
                    />
                ) : null}
            </div>
        </ChatCard>
    );
}
