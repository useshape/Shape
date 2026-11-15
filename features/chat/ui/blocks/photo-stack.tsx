"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MediaLightbox } from "./lightbox";

export type StackPhoto = {
    src: string;
    alt?: string;
    mediaId?: string;
    model?: string;
};

/**
 * One shared frame for a burst of photos.
 * A single photo keeps its own shape. Several share a rounded frame with a hairline gutter,
 * the way a messaging thread groups a burst instead of stacking identical cards.
 */
export function PhotoStack({
    photos,
    align = "start",
    onOpen,
}: {
    photos: StackPhoto[];
    align?: "start" | "end";
    onOpen?: (photo: StackPhoto, index: number) => void;
}) {
    const items = photos.filter((photo) => photo.src.trim());
    const [viewer, setViewer] = useState<number | null>(null);
    const [hidden, setHidden] = useState<number[]>([]);
    const visible = items.flatMap((photo, index) => (hidden.includes(index) ? [] : [{ photo, index }]));
    if (visible.length === 0) return null;

    const open = (index: number) => {
        const at = visible.findIndex((item) => item.index === index);
        setViewer(at >= 0 ? at : 0);
        const photo = items[index];
        if (photo) onOpen?.(photo, index);
    };
    const hide = (index: number) => {
        setHidden((current) => (current.includes(index) ? current : [...current, index]));
    };

    return (
        <>
            <div className={cn("w-fit max-w-[280px]", align === "end" && "ml-auto")}>
                {visible.length === 1 ? (
                    <PhotoCell photo={visible[0].photo} cover={false} onClick={() => open(visible[0].index)} onFail={() => hide(visible[0].index)} />
                ) : (
                    <div
                        className={cn(
                            "grid gap-px overflow-hidden rounded-[18px] bg-panel",
                            gridClass(visible.length),
                        )}
                    >
                        {visible.map(({ photo, index }, slot) => (
                            <PhotoCell
                                key={`${photo.mediaId || photo.src}-${index}`}
                                photo={photo}
                                cover
                                className={cellClass(visible.length, slot)}
                                onClick={() => open(index)}
                                onFail={() => hide(index)}
                            />
                        ))}
                    </div>
                )}
            </div>
            <MediaLightbox
                open={viewer != null}
                onClose={() => setViewer(null)}
                images={visible.map(({ photo }) => ({ src: photo.src, title: photo.alt }))}
                initialIndex={viewer ?? 0}
            />
        </>
    );
}

function gridClass(count: number) {
    if (count === 2) return "h-[148px] grid-cols-2";
    if (count === 3) return "h-[210px] grid-cols-2 grid-rows-2";
    if (count === 4) return "h-[220px] grid-cols-2 grid-rows-2";
    return "grid-cols-3 auto-rows-[92px]";
}

function cellClass(count: number, index: number) {
    if (count === 3 && index === 0) return "row-span-2";
    return "";
}

function PhotoCell({
    photo,
    cover,
    className,
    onClick,
    onFail,
}: {
    photo: StackPhoto;
    cover: boolean;
    className?: string;
    onClick: () => void;
    onFail: () => void;
}) {
    const [ready, setReady] = useState(() => photo.src.startsWith("data:"));

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "relative block overflow-hidden bg-surface-3 text-left",
                cover ? "size-full min-h-0" : "rounded-[18px]",
                className,
            )}
        >
            {!ready ? (
                <span
                    className={cn("preview-shimmer block", cover ? "absolute inset-0" : "h-40 w-[220px]")}
                    aria-hidden
                >
                    <span className="preview-shimmer-blob" />
                </span>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={photo.src}
                alt={photo.alt || ""}
                draggable={false}
                className={cn(
                    "transition-opacity duration-300",
                    cover
                        ? "size-full object-cover"
                        : "block max-h-[380px] max-w-[280px] object-contain",
                    ready ? "opacity-100" : "absolute opacity-0",
                )}
                onLoad={() => setReady(true)}
                onError={onFail}
            />
        </button>
    );
}
