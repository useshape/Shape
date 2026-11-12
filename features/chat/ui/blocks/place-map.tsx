"use client";

import { ImageBento, type GalleryImage } from "./image-bento";

export type ShownImage = GalleryImage;

export function parseShownImages(content?: string): { query: string; images: ShownImage[] } {
    try {
        const parsed = JSON.parse(content || "") as {
            query?: string;
            images?: { title?: string; url?: string; source?: string }[];
        };
        const images = (parsed.images || [])
            .filter((image) => image.url)
            .slice(0, 12)
            .map((image) => ({
                title: image.title || "",
                url: image.url || "",
                source: image.source || image.url || "",
            }));
        return { query: parsed.query || "", images };
    } catch {
        return { query: "", images: [] };
    }
}

export function ShownImages({ content }: { content?: string }) {
    const { images } = parseShownImages(content);
    return <ImageBento images={images} />;
}
