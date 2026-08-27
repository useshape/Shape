"use client";

import React from "react";
import { Icon } from "@/components/ui/icon";
import { Favicon } from "@/components/ui/favicon";
import { commands } from "@/lib/backend/commands";
import { ToolCard } from "./tool-card";
import { ActionPhrase } from "./chat-card";

type WebSearchResultItem = { title: string; url: string; snippet: string };

function parseHits(blockContent: string): WebSearchResultItem[] {
    const results: WebSearchResultItem[] = [];
    for (const part of blockContent.split("---").filter(Boolean)) {
        const titleMatch = part.match(/### (.*)/);
        const urlMatch = part.match(/URL: (.*)/);
        const text = part.replace(/### .*/, "").replace(/URL: .*/, "").trim();
        if (titleMatch || urlMatch) {
            results.push({
                title: titleMatch ? titleMatch[1].trim() : "Result",
                url: urlMatch ? urlMatch[1].trim() : "",
                snippet: text,
            });
        }
    }
    return results;
}

export function WebSearchCard({
    query,
    content,
    isGenerating,
}: {
    query?: string;
    content?: string;
    isGenerating?: boolean;
}) {
    const q = (query || "").trim();
    const hits = parseHits(content || "");
    const favicons = hits
        .map((h) => h.url)
        .filter(Boolean)
        .filter((url, i, arr) => arr.indexOf(url) === i)
        .slice(0, 4);
    const verb = isGenerating ? "Searching" : "Searched";
    const detail = q || (isGenerating ? undefined : "web");

    return (
        <ToolCard
            leading={<Icon name="language" size={14} className="text-text-muted" />}
            title={<ActionPhrase verb={verb} detail={detail} />}
            trailing={
                favicons.length > 0 ? (
                    <span className="inline-flex items-center -space-x-1 shrink-0">
                        {favicons.map((url) => (
                            <span
                                key={url}
                                className="inline-flex size-4 items-center justify-center overflow-hidden rounded-sm bg-panel"
                            >
                                <Favicon url={url} size={12} />
                            </span>
                        ))}
                    </span>
                ) : null
            }
            expandable={hits.length > 0}
        >
            <div className="flex w-[min(100%,20rem)] flex-col gap-1.5">
                {hits.map((hit) => (
                    <WebHitRow key={hit.url || hit.title} hit={hit} />
                ))}
            </div>
        </ToolCard>
    );
}

function WebHitRow({ hit }: { hit: WebSearchResultItem }) {
    return (
        <button
            type="button"
            className="flex min-w-0 flex-col items-start gap-0.5 text-left hover:opacity-80"
            onClick={() => {
                if (hit.url) void commands.openUrlExternal(hit.url);
            }}
        >
            <span className="flex min-w-0 items-center gap-1.5">
                {hit.url ? <Favicon url={hit.url} size={12} /> : null}
                <span className="truncate text-sm text-text-primary">{hit.title}</span>
            </span>
            {hit.snippet ? (
                <span className="line-clamp-2 text-xs text-text-muted">{hit.snippet}</span>
            ) : null}
        </button>
    );
}

export function WebVisitCard({
    host,
    url,
    isGenerating,
}: {
    host: string;
    url: string;
    isGenerating?: boolean;
}) {
    return (
        <ToolCard
            leading={
                url
                    ? <Favicon url={url} size={14} />
                    : <Icon name="language" size={14} className="text-text-muted" />
            }
            title={
                <ActionPhrase
                    verb={isGenerating ? "Visiting" : "Visited"}
                    detail={host}
                />
            }
            onClick={() => {
                if (url.startsWith("http")) void commands.openUrlExternal(url);
            }}
        />
    );
}
