"use client";

import { ImageBento, type GalleryImage } from "./image-bento";
import { commands } from "@/lib/backend";

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

type PlacePin = { name: string; lat: number; lng: number };

function parsePlaces(content?: string): PlacePin[] {
    try {
        const parsed = JSON.parse(content || "") as {
            places?: { name?: string; lat?: number; lng?: number }[];
        };
        return (parsed.places || [])
            .map((place) => ({
                name: (place.name || "").trim(),
                lat: Number(place.lat),
                lng: Number(place.lng),
            }))
            .filter((place) => place.name && Number.isFinite(place.lat) && Number.isFinite(place.lng))
            .slice(0, 6);
    } catch {
        return [];
    }
}

export function PlaceMap({ content }: { content?: string }) {
    const places = parsePlaces(content);
    if (places.length === 0) return null;
    return (
        <div className="my-2 flex w-full flex-col gap-1">
            {places.map((place) => (
                <button
                    key={`${place.name}-${place.lat}-${place.lng}`}
                    type="button"
                    className="flex w-fit max-w-full items-baseline gap-2 py-0.5 text-left text-sm text-text-secondary hover:text-text-primary"
                    onClick={() => {
                        const url = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=14/${place.lat}/${place.lng}`;
                        void commands.openUrlExternal(url);
                    }}
                >
                    <span className="min-w-0 truncate">{place.name}</span>
                    <span className="shrink-0 tabular-nums text-text-muted">
                        {place.lat.toFixed(2)}, {place.lng.toFixed(2)}
                    </span>
                </button>
            ))}
        </div>
    );
}
