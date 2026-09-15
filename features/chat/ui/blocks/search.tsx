"use client";

import { RiGlobalLine, RiLightbulbLine } from "@remixicon/react";
import React from "react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { Favicon } from "@/components/ui/favicon";
import { cn } from "@/lib/utils";
import { hostnameOf } from "@/lib/favicon";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import type { WebSearchResultItem } from "../md/renderer";
import { GeneratingIndicator } from "./generating";

type WebSearchResult = WebSearchResultItem;

export function parseWebSearchHits(content: string): WebSearchResult[] {
    const results: WebSearchResult[] = [];
    for (const part of content.split("---").filter(Boolean)) {
        const titleMatch = part.match(/### (.*)/);
        const urlMatch = part.match(/URL:\s*(.*)/);
        const text = part.replace(/### .*/, "").replace(/URL:.*/, "").trim();
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

function searchSourceLabel(query: string, results: WebSearchResult[]): string {
    const blob = `${query} ${results.map((r) => r.url).join(" ")}`.toLowerCase();
    if (blob.includes("reddit.com") || blob.includes("r/")) return "Reddit";
    if (blob.includes("x.com") || blob.includes("twitter.com")) return "X";
    if (blob.includes("github.com")) return "GitHub";
    if (blob.includes("stackoverflow.com")) return "Stack Overflow";
    return "web";
}

function resultCountLabel(source: string, count: number): string {
    if (source === "Reddit") return `${count} thread${count === 1 ? "" : "s"}`;
    if (source === "X") return `${count} post${count === 1 ? "" : "s"}`;
    return `${count} result${count === 1 ? "" : "s"}`;
}

function SourceRow({ result }: { result: WebSearchResult }) {
    const host = hostnameOf(result.url);
    return (
        <a
            href={result.url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "flex min-w-0 items-center gap-2 py-0.5",
                result.url ? "hover:text-text-primary" : "pointer-events-none",
            )}
        >
            <span className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm">
                {host ? (
                    <Favicon url={result.url || host} size={14} />
                ) : (
                    <Icon icon={RiGlobalLine} size={ICON_SIZE_SM} className="text-text-muted" />
                )}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                {result.title || host || "Source"}
            </span>
            {host ? (
                <span className="max-w-[42%] shrink-0 truncate text-sm text-text-muted">
                    {host}
                </span>
            ) : null}
        </a>
    );
}

/** Sources list + search trail, matching the chat transcript style. */
export function WebSearchBlock({
    query,
    results,
    isActive,
    searches,
}: {
    query?: string;
    results: WebSearchResult[];
    isActive?: boolean;
    searches?: number;
}) {
    const source = searchSourceLabel(query || "", results);
    const searchCount = searches && searches > 0 ? searches : query ? 1 : 0;

    return (
        <div className="my-1 flex w-full flex-col gap-0.5">
            {results.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                    {results.slice(0, 8).map((result, i) => (
                        <SourceRow key={`${result.url}-${i}`} result={result} />
                    ))}
                </div>
            ) : null}
            {query || isActive ? (
                isActive && results.length === 0 ? (
                    <GeneratingIndicator label="Searching the web" showTimer={false} />
                ) : (
                    <div className="flex min-w-0 items-center gap-2 py-0.5 text-sm text-text-secondary">
                        <Icon icon={RiGlobalLine} size={ICON_SIZE_SM} className="shrink-0 text-text-muted" />
                        <span className="min-w-0 truncate">
                            Searched {source} for{" "}
                            <span className="text-text-primary">{query}</span>
                        </span>
                        {results.length > 0 ? (
                            <span className="ml-auto shrink-0 text-sm text-text-muted">
                                {resultCountLabel(source, results.length)}
                            </span>
                        ) : null}
                    </div>
                )
            ) : null}
            {searchCount > 1 && !query ? (
                <div className="flex items-center gap-2 py-0.5 text-sm text-text-secondary">
                    <Icon icon={RiGlobalLine} size={ICON_SIZE_SM} className="text-text-muted" />
                    <span>
                        Ran {searchCount} search{searchCount === 1 ? "" : "es"}
                    </span>
                </div>
            ) : null}
            {isActive && results.length > 0 ? (
                <div className="flex min-w-0 items-center gap-2 py-0.5 text-sm text-text-secondary">
                    <Icon icon={RiLightbulbLine} size={ICON_SIZE_SM} className="shrink-0 text-text-muted" />
                    <span>Reading the strongest sources</span>
                </div>
            ) : null}
        </div>
    );
}

export function WebSourcesMenu({ results }: { results: WebSearchResult[] }) {
    if (results.length === 0) return null;

    return (
        <DropdownMenu>
            <Tooltip content={`${results.length} sources`} side="bottom">
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="rounded-md p-1 text-text-muted hover:bg-panel-hover hover:text-text-secondary"
                        aria-label={`${results.length} web sources`}
                    >
                        <Icon icon={RiGlobalLine} />
                    </button>
                </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-80 p-1.5">
                <div className="px-1.5 py-1 text-xs font-medium text-text-muted">Sources</div>
                {results.map((result, i) => (
                    <SourceRow key={`${result.url}-${i}`} result={result} />
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
