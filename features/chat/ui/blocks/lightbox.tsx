"use client";

import React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { SHAPE_OVERLAY_CLASS } from "@/lib/ui/modal-overlay";
import type { DesignPreviewItem } from "./gallery";

function resolveSrc(path: string): string {
    if (path.startsWith("data:") || path.startsWith("http") || path.startsWith("asset:")) {
        return path;
    }
    return convertFileSrc(path);
}

function isHtml(item: { path: string; kind?: string }): boolean {
    if (item.kind === "html") return true;
    if (item.kind === "png") return false;
    return /\.html?$/i.test(item.path);
}

/**
 * Simple media / design preview viewer.
 * Designs: fullscreen image/iframe + 3-dot pager only (select lives in chat).
 */
export function MediaLightbox({
    open,
    onClose,
    src,
    title,
    kind = "image",
    designs,
    initialIndex = 0,
}: {
    open: boolean;
    onClose: () => void;
    src?: string;
    title?: string;
    kind?: "image" | "html";
    designs?: DesignPreviewItem[];
    initialIndex?: number;
}) {
    const [index, setIndex] = React.useState(initialIndex);

    React.useEffect(() => {
        if (open) setIndex(initialIndex);
    }, [open, initialIndex, designs]);

    React.useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    const design = designs?.[index];
    const resolved = design
        ? resolveSrc(design.path)
        : src
          ? src.startsWith("data:") || src.startsWith("http") || src.startsWith("asset:")
              ? src
              : convertFileSrc(src)
          : "";
    if (!resolved) return null;

    const showHtml = design ? isHtml(design) : kind === "html";
    const label = design?.name || title || "Preview";

    return (
        <div
            className={cn(
                "fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 p-6",
                SHAPE_OVERLAY_CLASS,
            )}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onClick={onClose}
        >
            <div
                className="relative flex max-h-[85vh] max-w-[92vw] flex-col overflow-hidden rounded-xl bg-white shadow-md"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-md bg-black/55 text-white hover:bg-black/70"
                    onClick={onClose}
                    aria-label="Close"
                >
                    <Icon name="close" size={18} />
                </button>

                {showHtml ? (
                    <iframe
                        key={design?.id || resolved}
                        title={label}
                        src={resolved}
                        className="h-[min(80vh,900px)] w-[min(92vw,1200px)] border-0 bg-white"
                        sandbox="allow-scripts"
                    />
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        key={design?.id || resolved}
                        src={resolved}
                        alt={label}
                        className="max-h-[80vh] max-w-[92vw] object-contain"
                        draggable={false}
                    />
                )}
            </div>

            {design ? (
                <p className="max-w-[90vw] truncate text-sm text-white/90" onClick={(e) => e.stopPropagation()}>
                    {design.name}
                </p>
            ) : null}

            {designs && designs.length > 1 ? (
                <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                    {designs.map((item, i) => (
                        <button
                            key={item.id}
                            type="button"
                            aria-label={`Show ${item.name}`}
                            aria-current={i === index}
                            className={cn(
                                "size-2 rounded-full transition-colors",
                                i === index ? "bg-white" : "bg-white/35 hover:bg-white/55",
                            )}
                            onClick={() => setIndex(i)}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}
