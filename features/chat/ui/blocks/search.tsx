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

type WebSearchResult = WebSearchResultItem;

export function WebSearchBlock({ query, results, isActive }: {
    query: string;
    results: WebSearchResult[];
    isActive?: boolean;
}) {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <div className="flex flex-col gap-1 my-2">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors group w-full text-left"
            >
                <Icon
                    name="expand_more"
                    size={14}
                    className={cn(
                        "text-text-muted transition-transform duration-[var(--transition-fast)]",
                        !isOpen && "-rotate-90"
                    )}
                />
                <Icon name="language" size={14} className="text-text-muted" />
                {isActive ? (
                    <span className="font-medium text-sm web-search-gradient-text">Searching the web...</span>
                ) : (
                    <span className="font-medium text-sm">Searched &quot;{query}&quot;</span>
                )}
                {isActive && (
                    <div className="w-2.5 h-2.5 border-[1.5px] border-accent border-t-transparent rounded-full animate-spin ml-1" />
                )}
            </button>

            {isOpen && (
                <div className="flex flex-col gap-2 ml-2 mt-1 pb-2">
                    {results.map((result, i) => {
                        const host = hostnameOf(result.url);
                        return (
                            <div key={i} className="mx-2 p-2 rounded">
                                <div className="flex items-center gap-2 mb-1">
                                    {host ? <Favicon url={result.url} size={14} /> : null}
                                    <span className="text-sm font-medium text-text-primary truncate">{result.title}</span>
                                </div>
                                <span className="text-sm text-text-muted block truncate mb-1">{result.url}</span>
                                <span className="text-sm text-text-muted leading-relaxed">{result.snippet}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <style jsx>{`
                .web-search-gradient-text {
                    background: linear-gradient(
                        90deg,
                        var(--text-muted) 0%,
                        var(--text-primary) 40%,
                        var(--text-muted) 80%
                    );
                    background-size: 200% 100%;
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    animation: web-search-gradient-swipe 2s ease-in-out infinite;
                }
                @keyframes web-search-gradient-swipe {
                    0% { background-position: 100% 0; }
                    100% { background-position: -100% 0; }
                }
            `}</style>
        </div>
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
