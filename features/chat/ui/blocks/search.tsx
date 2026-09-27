"use client";

import React from "react";
import { ICON_SIZE_MD, ICON_SIZE_SM, SolarIcon } from "@/components/ui/icon";
import { Favicon } from "@/components/ui/favicon";
import { cn } from "@/lib/utils";
import { Collapse } from "./collapse";
import { hostnameOf } from "@/lib/ui/favicon";
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

type Brand = {
    id: string;
    label: string;
    slug: string;
    color: string;
    invert?: boolean;
    posts?: boolean;
    test: RegExp;
};

const BRANDS: Brand[] = [
    { id: "reddit", label: "Reddit", slug: "reddit", color: "FF4500", posts: true, test: /(^|\.)reddit\.com|\breddit\b/i },
    { id: "x", label: "X", slug: "x", color: "000000", invert: true, posts: true, test: /(^|\.)(x|twitter)\.com|\bx\b|\btwitter\b/i },
    { id: "github", label: "GitHub", slug: "github", color: "181717", invert: true, test: /(^|\.)github\.com|\bgithub\b/i },
    { id: "linkedin", label: "LinkedIn", slug: "linkedin", color: "0A66C2", test: /(^|\.)linkedin\.com|\blinkedin\b/i },
    { id: "figma", label: "Figma", slug: "figma", color: "F24E1E", test: /(^|\.)figma\.com|\bfigma\b/i },
    { id: "notion", label: "Notion", slug: "notion", color: "000000", invert: true, test: /(^|\.)notion\.(so|com)|\bnotion\b/i },
    { id: "youtube", label: "YouTube", slug: "youtube", color: "FF0000", test: /(^|\.)(youtube\.com|youtu\.be)|\byoutube\b/i },
    { id: "stackoverflow", label: "Stack Overflow", slug: "stackoverflow", color: "F58025", test: /(^|\.)stackoverflow\.com/i },
    { id: "wikipedia", label: "Wikipedia", slug: "wikipedia", color: "000000", invert: true, test: /(^|\.)wikipedia\.org/i },
    { id: "hackernews", label: "Hacker News", slug: "ycombinator", color: "FF6600", posts: true, test: /(^|\.)news\.ycombinator\.com|\bhacker news\b/i },
];

function brandFromText(text: string): Brand | null {
    const value = text.trim();
    if (!value) return null;
    return BRANDS.find((brand) => brand.test.test(value)) ?? null;
}

function brandForStep(query: string, sources: WebSearchResult[]): Brand | null {
    const hosts = sources.map((source) => hostnameOf(source.url)).filter(Boolean);
    if (hosts.length > 0) {
        const matched = hosts.map((host) => brandFromText(host));
        const first = matched[0];
        if (first && matched.every((brand) => brand?.id === first.id)) return first;
        return null;
    }
    return brandFromText(query);
}

function SiteMark({ url, brand, size = 14 }: { url?: string; brand?: Brand | null; size?: number }) {
    const resolved = brand ?? (url ? brandFromText(hostnameOf(url)) : null);
    if (resolved) {
        return (
            <span className={cn("inline-flex shrink-0", resolved.invert && "dark:invert")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={`https://cdn.simpleicons.org/${resolved.slug}/${resolved.color}`}
                    alt=""
                    width={size}
                    height={size}
                    className="shrink-0 object-contain"
                    style={{ width: size, height: size }}
                    draggable={false}
                />
            </span>
        );
    }
    if (url) return <Favicon url={url} size={size} />;
    return <SolarIcon name="global" size={size} className="shrink-0 text-text-muted" />;
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
            <span className="flex size-4 shrink-0 items-center justify-center">
                <SiteMark url={result.url} size={14} />
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

const MARK_CAP = 6;

function SourceStack({ sources }: { sources: WebSearchResult[] }) {
    const shown = sources.slice(0, MARK_CAP);
    const rest = sources.length - shown.length;
    return (
        <span className="inline-flex items-center">
            {shown.map((source, index) => {
                const host = hostnameOf(source.url);
                const mark = (
                    <span
                        className="relative flex size-4 items-center justify-center rounded-full bg-surface-2 ring-2 ring-panel transition-transform duration-[var(--transition-fast)] hover:z-20 hover:-translate-y-0.5"
                        style={{ marginLeft: index === 0 ? 0 : -6, zIndex: shown.length - index }}
                    >
                        <SiteMark url={source.url} size={12} />
                    </span>
                );
                return (
                    <Tooltip key={`${source.url}-${index}`} content={host ? `${source.title} · ${host}` : source.title}>
                        {source.url ? (
                            <a href={source.url} target="_blank" rel="noopener noreferrer" className="relative">
                                {mark}
                            </a>
                        ) : (
                            <span className="relative">{mark}</span>
                        )}
                    </Tooltip>
                );
            })}
            {rest > 0 ? <span className="ml-1.5 text-xs text-text-muted">+{rest}</span> : null}
        </span>
    );
}

function SourcesBranch({ sources }: { sources: WebSearchResult[] }) {
    const [open, setOpen] = React.useState(true);
    return (
        <div className="shape-row-in mt-1 pl-5">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex w-full items-center gap-2 text-left chat-text text-text-secondary hover:text-text-primary"
            >
                <span>Sources</span>
                {open ? null : <SourceStack sources={sources} />}
                <SolarIcon
                    name="alt-arrow-down"
                    size={ICON_SIZE_SM}
                    className={cn("text-text-muted transition-transform duration-200", open && "rotate-180")}
                />
            </button>
            <Collapse open={open}>
                <div className="mt-0.5 flex flex-col">
                    {sources.map((result, index) => (
                        <SourceRow key={`${result.url}-${index}`} result={result} />
                    ))}
                </div>
            </Collapse>
        </div>
    );
}

export type TrailBlock = {
    type: string;
    query?: string;
    content?: string;
    visitUrl?: string;
    visitHost?: string;
    visitTitle?: string;
};

type TrailStep = {
    kind: "search" | "visit";
    query: string;
    brand: Brand | null;
    sources: WebSearchResult[];
};

function stepQuery(block: TrailBlock): string {
    if (block.type === "web_search") return (block.query || block.content || "").trim();
    return (block.query || "").trim();
}

export function buildTrailSteps(blocks: TrailBlock[]): TrailStep[] {
    const steps: TrailStep[] = [];
    for (const block of blocks) {
        if (block.type === "web_visit") {
            const query = (block.visitTitle || block.visitHost || "page").trim();
            steps.push({
                kind: "visit",
                query,
                brand: brandFromText(block.visitHost || block.visitUrl || query),
                sources: [],
            });
            continue;
        }
        if (block.type === "web_search") {
            const query = stepQuery(block);
            if (!query) continue;
            steps.push({ kind: "search", query, brand: null, sources: [] });
            continue;
        }
        if (block.type === "web_result") {
            const hits = parseWebSearchHits(block.content || "");
            const query = stepQuery(block);
            const prev = [...steps].reverse().find((step) => step.kind === "search" && (!query || step.query === query));
            if (prev) {
                const seen = new Set(prev.sources.map((hit) => hit.url || hit.title));
                for (const hit of hits) {
                    const key = hit.url || hit.title;
                    if (!key || seen.has(key)) continue;
                    seen.add(key);
                    prev.sources.push(hit);
                }
                continue;
            }
            if (query || hits.length > 0) {
                steps.push({ kind: "search", query, brand: null, sources: hits });
            }
        }
    }
    for (const step of steps) {
        if (step.kind === "search") step.brand = brandForStep(step.query, step.sources);
    }
    return steps;
}

function resultMeta(step: TrailStep): string | null {
    const count = step.sources.length;
    if (count === 0) return null;
    const noun = step.brand?.posts ? (count === 1 ? "post" : "posts") : (count === 1 ? "result" : "results");
    return `${count} ${noun}`;
}

function TrailStepRow({ step }: { step: TrailStep }) {
    const meta = resultMeta(step);
    const verb = step.kind === "visit"
        ? "Opened"
        : step.brand
            ? `Searched ${step.brand.label} for`
            : "Searching for";
    const icon = step.brand ? <SiteMark brand={step.brand} size={14} /> : null;
    return (
        <div className="py-0.5">
            <div className="flex w-full min-w-0 items-center gap-1.5 chat-text text-text-secondary">
                {icon ? <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span> : null}
                <span className="min-w-0 flex-1 truncate">
                    {verb}
                    {step.query ? <span className="text-text-primary"> {step.query}</span> : null}
                </span>
                {meta ? <span className="shrink-0 text-text-muted">{meta}</span> : null}
            </div>
            {step.sources.length > 0 ? <SourcesBranch sources={step.sources} /> : null}
        </div>
    );
}

/** Research trail: each query is a step, and a step with hits branches once into Sources. */
export function WebSearchTrail({
    blocks,
    isActive,
}: {
    blocks: TrailBlock[];
    isActive?: boolean;
}) {
    const steps = buildTrailSteps(blocks);
    const searches = steps.filter((step) => step.kind === "search").length;

    if (steps.length === 0) {
        if (!isActive) return null;
        return (
            <div className="flex items-center gap-1.5 py-0.5 chat-text text-text-muted">
                <GeneratingIndicator label="Searching" showTimer={false} />
            </div>
        );
    }

    const grouped = searches > 1;
    return (
        <div className="py-0.5">
            {grouped ? (
                <div className="flex items-center gap-1.5 chat-text text-text-secondary">
                    <span>Ran {searches} searches</span>
                </div>
            ) : null}
            {steps.map((step, index) => (
                <TrailStepRow key={`${step.kind}-${step.query}-${index}`} step={step} />
            ))}
            {isActive ? <GeneratingIndicator label="Searching" showTimer={false} /> : null}
        </div>
    );
}

export function WebSearchBlock({
    query,
    results,
    isActive,
}: {
    query?: string;
    results: WebSearchResult[];
    isActive?: boolean;
    searches?: number;
}) {
    const hits = results
        .map((result) => `### ${result.title}\nURL: ${result.url}\n${result.snippet}`)
        .join("\n---\n");
    return (
        <WebSearchTrail
            isActive={isActive}
            blocks={[
                { type: "web_search", query: query || "", content: query || "" },
                ...(hits ? [{ type: "web_result", query: query || "", content: hits }] : []),
            ]}
        />
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
                        <SolarIcon name="global" size={ICON_SIZE_MD} />
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
