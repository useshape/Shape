"use client";

import React, { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useDesignPreviewSession } from "@/lib/design-preview-store";

function isHtmlPreview(path: string, kind?: string): boolean {
    if (kind === "html") return true;
    if (kind === "png") return false;
    return /\.html?$/i.test(path);
}

function resolvePreviewSrc(path: string): string {
    if (path.startsWith("data:") || path.startsWith("http") || path.startsWith("asset:")) {
        return path;
    }
    return convertFileSrc(path);
}

/** Optional editor-hosted preview (legacy path). Primary UX is the in-chat canvas. */
export function DesignPreviewView({ sessionId }: { sessionId: string }) {
    const session = useDesignPreviewSession(sessionId);
    const items = session?.items ?? [];
    const item = useMemo(() => items[0], [items]);

    if (!items.length || !item) {
        return (
            <div className="flex h-full items-center justify-center bg-editor text-sm text-text-muted">
                Preview is no longer available.
            </div>
        );
    }

    const html = isHtmlPreview(item.path, item.kind);
    const src = resolvePreviewSrc(item.path);

    return (
        <div className="flex h-full min-h-0 w-full flex-col bg-editor p-2">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-subtle bg-transparent">
                <div className="relative min-h-0 flex-1 bg-transparent">
                    {html ? (
                        <iframe
                            title={item.name || "Component preview"}
                            src={src}
                            className="h-full w-full border-0 bg-transparent"
                            sandbox="allow-scripts allow-same-origin"
                        />
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={src}
                            alt={item.name || "Preview"}
                            className="h-full w-full object-contain object-top"
                            draggable={false}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
