"use client";

import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";


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
    images,
    initialIndex = 0,
}: {
    open: boolean;
    onClose: () => void;
    src?: string;
    title?: string;
    kind?: "image" | "html";
    designs?: DesignPreviewItem[];
    images?: { src: string; title?: string }[];
    initialIndex?: number;
}) {
    const [index, setIndex] = React.useState(initialIndex);

    const gallerySize = designs?.length || images?.length || 0;

    React.useEffect(() => {
        if (open) setIndex(initialIndex);
    }, [open, initialIndex, gallerySize]);

    React.useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowRight" && gallerySize > 1) {
                setIndex((current) => (current + 1) % gallerySize);
            }
            if (e.key === "ArrowLeft" && gallerySize > 1) {
                setIndex((current) => (current - 1 + gallerySize) % gallerySize);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose, gallerySize]);

    if (!open) return null;

    const design = designs?.[index];
    const galleryImage = !design ? images?.[index] : undefined;
    const rawSrc = design ? "" : galleryImage?.src || src || "";
    const resolved = design
        ? resolveSrc(design.path)
        : rawSrc
          ? rawSrc.startsWith("data:") || rawSrc.startsWith("http") || rawSrc.startsWith("asset:")
              ? rawSrc
              : convertFileSrc(rawSrc)
          : "";
    if (!resolved) return null;

    const showHtml = design ? isHtml(design) : kind === "html";
    const label = design?.name || galleryImage?.title || title || "Preview";

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
                    <Icon icon={Dismiss20Regular} />
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
                        key={`${index}-${design?.id || resolved}`}
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

            {gallerySize > 1 ? (
                <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                    {Array.from({ length: gallerySize }, (_, i) => (
                        <button
                            key={designs?.[i]?.id || images?.[i]?.src || i}
                            type="button"
                            aria-label={`Show photo ${i + 1}`}
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
