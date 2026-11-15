"use client";

import { useEffect, useRef, useState } from "react";
import { justifyImageRows } from "@/lib/chat/justify-images";
import { MediaLightbox } from "./lightbox";

export type GalleryImage = {
    url: string;
    /** Page or original file. The picture itself is `url`. */
    source?: string;
    title?: string;
};

type Measured = GalleryImage & { w: number; h: number };

function measure(images: GalleryImage[]): Promise<Measured[]> {
    return Promise.all(
        images.map(
            (image) =>
                new Promise<Measured | null>((resolve) => {
                    const el = new Image();
                    el.onload = () => {
                        if (el.naturalWidth > 0 && el.naturalHeight > 0) {
                            resolve({ ...image, w: el.naturalWidth, h: el.naturalHeight });
                            return;
                        }
                        resolve(null);
                    };
                    el.onerror = () => resolve(null);
                    el.src = image.url;
                }),
        ),
    ).then((rows) => rows.filter((row): row is Measured => row !== null));
}

/** Justified gallery. Tile size comes from each photo's real aspect ratio. */
export function ImageBento({ images }: { images: GalleryImage[] }) {
    const frame = useRef<HTMLDivElement>(null);
    const imagesRef = useRef(images);
    imagesRef.current = images;
    const [width, setWidth] = useState(0);
    const [measured, setMeasured] = useState<Measured[]>([]);
    const [settled, setSettled] = useState(false);
    const [viewer, setViewer] = useState<number | null>(null);
    const key = images.map((image) => `${image.url}|${image.source || ""}`).join("\n");

    useEffect(() => {
        const node = frame.current;
        if (!node) return;
        const update = () => setWidth(node.clientWidth);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        let cancel = false;
        const list = imagesRef.current.filter((image) => image.url).slice(0, 12);
        setSettled(false);
        void measure(list).then((rows) => {
            if (!cancel) {
                setMeasured(rows);
                setSettled(true);
            }
        });
        return () => {
            cancel = true;
        };
    }, [key]);

    const targetHeight = Math.max(112, Math.min(176, width * 0.34));
    const rows = justifyImageRows(measured, width, { gap: 6, targetHeight });
    if (!images.some((image) => image.url) || (settled && measured.length === 0)) return null;

    return (
        <div ref={frame} className="flex w-full flex-col gap-1.5">
            {rows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex gap-1.5">
                    {row.map((image) => {
                        const index = measured.findIndex((item) => item.url === image.url);
                        return (
                        <button
                            key={image.url}
                            type="button"
                            className="block shrink-0 overflow-hidden rounded-xl"
                            style={{ width: image.width, height: image.height }}
                            onClick={() => setViewer(index >= 0 ? index : 0)}
                        >
                            <img
                                src={image.url}
                                alt={image.title || ""}
                                width={Math.round(image.width)}
                                height={Math.round(image.height)}
                                draggable={false}
                                className="block rounded-xl"
                                style={{ width: image.width, height: image.height }}
                            />
                        </button>
                        );
                    })}
                </div>
            ))}
            <MediaLightbox
                open={viewer != null}
                onClose={() => setViewer(null)}
                images={measured.map((image) => ({ src: image.url, title: image.title }))}
                initialIndex={viewer ?? 0}
            />
        </div>
    );
}
