"use client";

import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "@/lib/backend";
import { cn } from "@/lib/utils";

export function useBrowseWallpapers(): string[] {
    const [srcs, setSrcs] = useState<string[]>([]);
    useEffect(() => {
        let cancel = false;
        void commands
            .listBrowseWallpapers()
            .then((paths) => {
                if (cancel) return;
                setSrcs(paths.filter((path) => path.length > 0).map((path) => convertFileSrc(path)));
            })
            .catch(() => {
                if (!cancel) setSrcs([]);
            });
        return () => {
            cancel = true;
        };
    }, []);
    return srcs;
}

/** Full-bleed images behind the agent browser. An empty folder keeps the plain editor background. */
export function BrowseWallpaper() {
    const sources = useBrowseWallpapers();
    const [index, setIndex] = useState(0);
    const [reduce, setReduce] = useState(false);

    useEffect(() => {
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const apply = () => setReduce(media.matches);
        apply();
        media.addEventListener("change", apply);
        return () => media.removeEventListener("change", apply);
    }, []);

    useEffect(() => {
        if (reduce || sources.length < 2) return;
        const id = window.setInterval(() => {
            setIndex((current) => (current + 1) % sources.length);
        }, 18000);
        return () => window.clearInterval(id);
    }, [reduce, sources.length]);

    if (sources.length === 0) return null;
    const active = index % sources.length;

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {sources.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    key={src}
                    src={src}
                    alt=""
                    draggable={false}
                    className={cn(
                        "absolute inset-0 h-full w-full object-cover transition-opacity duration-1000",
                        i === active ? "opacity-100" : "opacity-0",
                    )}
                />
            ))}
            <div className="absolute inset-0 bg-editor/45" />
        </div>
    );
}
