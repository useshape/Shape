"use client";

import { useEffect, useState } from "react";
import type { WebSearchResultItem } from "../md/renderer";
import { ImageBento } from "./image-bento";

const VISUAL = /\b(photo|picture|looks like|look like|skyline|landmark|animal|species|building|map)\b/i;

function useExampleImage(topic: string | null): string | null {
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
        if (!topic) return;
        const title = topic.split(/[–—\-|]/)[0]?.trim() ?? "";
        if (title.length < 3 || title.length > 80) return;
        const ctrl = new AbortController();
        void fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
            signal: ctrl.signal,
            headers: { Accept: "application/json" },
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((data: { thumbnail?: { source?: string } } | null) => {
                const thumb = data?.thumbnail?.source;
                if (thumb) setSrc(thumb);
            })
            .catch(() => {});
        return () => ctrl.abort();
    }, [topic]);
    return src;
}

function hostLabel(url: string, title: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return title || "Source";
    }
}

/** Numbered sources under an answer. Only render when a search actually returned hits. */
export function CitedSources({ results }: { results: WebSearchResultItem[] }) {
    const sources = results.filter((r) => r.url || r.title).slice(0, 8);
    const images = sources.filter((source) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(source.url)).slice(0, 8);
    const visualTopic = images.length > 0
        ? null
        : (sources.find((source) => VISUAL.test(`${source.title} ${source.snippet}`))?.title || null);
    const example = useExampleImage(visualTopic);
    if (sources.length === 0) return null;
    return (
        <div className="mt-3 flex flex-col gap-2">
            {images.length > 0 ? (
                <ImageBento images={images.map((source) => ({ url: source.url, source: source.url, title: source.title }))} />
            ) : example ? (
                <ImageBento images={[{ url: example, source: example }]} />
            ) : null}
            <div className="chat-text text-text-muted">
                {sources.length} {sources.length === 1 ? "source" : "sources"}
            </div>
            <div className="flex flex-wrap gap-1.5">
                {sources.map((source, index) => (
                    <a
                        key={`${source.url}-${index}`}
                        href={source.url || undefined}
                        title={source.title}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border-subtle bg-surface-3 px-2 py-1 chat-text text-text-secondary hover:text-text-primary"
                        onClick={(event) => {
                            if (!source.url) event.preventDefault();
                        }}
                    >
                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-panel-hover text-[10px] tabular-nums text-text-muted">
                            {index + 1}
                        </span>
                        <span className="truncate">{hostLabel(source.url, source.title)}</span>
                    </a>
                ))}
            </div>
        </div>
    );
}
