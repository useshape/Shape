"use client";

import React from "react";
import { Icon } from "@/components/ui/icon";
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
import { WebSearchCard } from "./web-cards";

type WebSearchResult = WebSearchResultItem;

export function WebSearchBlock({ query, results, isActive }: {
    query: string;
    results: WebSearchResult[];
    isActive?: boolean;
}) {
    const content = results
        .map((result) => `### ${result.title}\nURL: ${result.url}\n${result.snippet}`)
        .join("\n---\n");
    return (
        <WebSearchCard
            query={query}
            content={content}
            isGenerating={isActive}
        />
    );
}

/** Footer control: web icon + dropdown of searched/visited sites with favicons. */
export function WebSourcesMenu({ results }: { results: WebSearchResult[] }) {
    if (results.length === 0) return null;

    return (
        <DropdownMenu>
            <Tooltip content={`${results.length} sources`} side="bottom">
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="text-text-muted hover:text-text-secondary transition-colors p-1 rounded-md hover:bg-panel-hover"
                        aria-label={`${results.length} web sources`}
                    >
                        <Icon name="language" size={14} />
                    </button>
                </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-72 max-h-64">
                <div className="px-2 py-1 text-xs font-medium text-text-muted">
                    Sources
                </div>
                {results.map((result, i) => {
                    const host = hostnameOf(result.url);
                    return (
                        <a
                            key={`${result.url}-${i}`}
                            href={result.url || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                "flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors",
                                result.url
                                    ? "hover:bg-panel-hover cursor-pointer"
                                    : "cursor-default opacity-70",
                            )}
                            onClick={(e) => {
                                if (!result.url) e.preventDefault();
                            }}
                        >
                            <div className="mt-0.5 w-4 h-4 rounded-sm border border-border-subtle bg-panel flex items-center justify-center overflow-hidden shrink-0">
                                {host ? (
                                    <Favicon url={result.url || host} size={12} />
                                ) : (
                                    <Icon name="language" size={10} className="text-text-muted" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-text-primary truncate">
                                    {result.title || host || "Source"}
                                </div>
                                {host ? (
                                    <div className="text-[11px] text-text-muted truncate">{host}</div>
                                ) : null}
                            </div>
                        </a>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
