"use client";

import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { getSelectedTalkMediaId, subscribeTalkMedia } from "@/lib/chat/talk-media";
import { RefineBar } from "./generated-media";
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
    const selected = useSyncExternalStore(subscribeTalkMedia, getSelectedTalkMediaId, () => null);
    if (items.length === 0) return null;
    const picked = items.find((photo) => photo.mediaId && photo.mediaId === selected);

    const open = (index: number) => {
        setViewer(index);
        const photo = items[index];
        if (photo) onOpen?.(photo, index);
    };

    return (
        <>
            <div className={cn("w-fit max-w-[280px]", align === "end" && "ml-auto")}>
                {items.length === 1 ? (
                    <PhotoCell photo={items[0]} cover={false} onClick={() => open(0)} />
                ) : (
                    <div
                        className={cn(
                            "grid gap-px overflow-hidden rounded-[18px] bg-panel",
                            gridClass(items.length),
                        )}
                    >
                        {items.map((photo, index) => (
                            <PhotoCell
                                key={`${photo.mediaId || photo.src}-${index}`}
                                photo={photo}
                                cover
                                className={cellClass(items.length, index)}
                                onClick={() => open(index)}
                            />
                        ))}
                    </div>
                )}
            </div>
            {picked ? (
                <div className="mt-1 w-full max-w-[280px] overflow-hidden rounded-xl border border-border-subtle bg-surface-3">
                    <RefineBar kind="image" mediaId={picked.mediaId} prompt={picked.alt} model={picked.model} />
                </div>
            ) : null}
            <MediaLightbox
                open={viewer != null}
                onClose={() => setViewer(null)}
                images={items.map((photo) => ({ src: photo.src, title: photo.alt }))}
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
}: {
    photo: StackPhoto;
    cover: boolean;
    className?: string;
    onClick: () => void;
}) {
    const [ready, setReady] = useState(() => photo.src.startsWith("data:"));
    const [failed, setFailed] = useState(false);

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
            {!ready && !failed ? (
                <span
                    className={cn("preview-shimmer block", cover ? "absolute inset-0" : "h-40 w-[220px]")}
                    aria-hidden
                >
                    <span className="preview-shimmer-blob" />
                </span>
            ) : null}
            {failed ? (
                <span className="flex h-28 w-[180px] items-center justify-center px-3 text-center text-xs text-text-muted">
                    Couldn&apos;t load
                </span>
            ) : (
                // eslint-disable-next-line @next/next/no-img-element
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
                    onError={() => setFailed(true)}
                />
            )}
        </button>
    );
}
