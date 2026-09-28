"use client";

import { ChevronRight20Regular } from "@fluentui/react-icons/headless/svg/chevron-right";




import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";


import { Collapse } from "./collapse";
import { BrowseStage } from "./browse-frame";
import { usePersonaReview, type PersonaLive } from "@/features/agent/browser/personas";

type PersonaCard = {
    id: string;
    name: string;
    profile: string;
    goal: string;
    status: string;
    score?: number | null;
    verdict?: string;
    first_impression?: string;
    friction?: string[];
    trust?: string[];
    marketing?: string[];
    fixes?: string[];
    notes?: string[];
    url?: string;
    image?: string;
};

function unescape(raw: string): string {
    return raw
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");
}

function strings(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).filter(Boolean);
}

function parseCards(raw: string): { url: string; personas: PersonaCard[] } {
    try {
        const data = JSON.parse(unescape(raw).trim()) as { url?: string; personas?: Array<Record<string, unknown>> };
        const personas = (data.personas || []).map((p) => ({
            id: String(p.id ?? ""),
            name: String(p.name ?? "Persona"),
            profile: String(p.profile ?? ""),
            goal: String(p.goal ?? ""),
            status: String(p.status ?? "running"),
            score: typeof p.score === "number" ? p.score : null,
            verdict: typeof p.verdict === "string" ? p.verdict : "",
            first_impression: typeof p.first_impression === "string" ? p.first_impression : "",
            friction: strings(p.friction),
            trust: strings(p.trust),
            marketing: strings(p.marketing),
            fixes: strings(p.fixes),
            notes: strings(p.notes),
            url: typeof p.url === "string" ? p.url : "",
            image: typeof p.image === "string" ? p.image : "",
        }));
        return { url: String(data.url ?? ""), personas };
    } catch {
        return { url: "", personas: [] };
    }
}

/** Merge the final card (from markup) with the live event state while running. */
function merge(card: PersonaCard, live: PersonaLive | undefined): PersonaCard {
    if (!live) return card;
    const report = (live.report || {}) as Record<string, unknown>;
    const done = card.status === "done" || card.status === "failed";
    return {
        ...card,
        status: done ? card.status : live.status,
        image: card.image || live.image,
        url: card.url || live.url,
        score: card.score ?? (typeof report.score === "number" ? report.score : null),
        verdict: card.verdict || (typeof report.verdict === "string" ? report.verdict : ""),
        first_impression:
            card.first_impression || (typeof report.first_impression === "string" ? report.first_impression : ""),
        friction: card.friction?.length ? card.friction : strings(report.friction),
        trust: card.trust?.length ? card.trust : strings(report.trust),
        marketing: card.marketing?.length ? card.marketing : strings(report.marketing),
        fixes: card.fixes?.length ? card.fixes : strings(report.fixes),
    };
}

function PersonaRow({ card, live }: { card: PersonaCard; live?: PersonaLive }) {
    const [open, setOpen] = useState(false);
    const running = card.status === "running";
    const image = live?.image || card.image;
    const note = running
        ? live?.note || "Opening the site…"
        : card.verdict || card.notes?.[0] || card.first_impression || "";

    return (
        <div className="py-0.5">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-fit max-w-full min-w-0 items-center gap-1.5 py-0.5 text-left chat-text font-normal text-text-primary"
            >
                <span className="shrink-0 text-text-muted">{running ? "Reviewing" : "Reviewed"}</span>
                <span className="min-w-0 truncate">{card.name}</span>
                <Icon
                    icon={ChevronRight20Regular}
                    className={cn("shrink-0 text-text-muted transition-transform duration-200", open && "rotate-90")}
                />
            </button>
            <Collapse open={open}>
                <div className="mt-1 flex flex-col gap-1.5">
                    {note ? <p className="chat-text leading-relaxed text-text-muted">{note}</p> : null}
                    {image ? (
                        <BrowseStage
                            frame={{ image, x: 50, y: 50, status: running ? "loading" : "stopped", url: card.url || "", title: "", error: "" }}
                            natural
                            className="max-w-[480px] overflow-hidden rounded-2xl border border-border-subtle"
                        />
                    ) : null}
                </div>
            </Collapse>
        </div>
    );
}

export function PersonaReviewPanel({
    reviewId,
    url,
    content,
}: {
    reviewId?: string;
    url?: string;
    status?: string;
    content: string;
}) {
    const [open, setOpen] = useState(true);
    const parsed = useMemo(() => parseCards(content), [content]);
    const live = usePersonaReview(reviewId);
    const liveById = useMemo(() => new Map(live.map((p) => [p.personaId, p])), [live]);
    const cards = parsed.personas.map((card) => merge(card, liveById.get(card.id)));
    const host = (() => {
        try {
            return new URL(url || parsed.url).host;
        } catch {
            return url || parsed.url;
        }
    })();

    if (!cards.length) return null;

    return (
        <div className="py-0.5">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-fit max-w-full items-center gap-1.5 text-left chat-text font-normal text-text-primary"
            >
                <span>Design review</span>
                {host ? <span className="min-w-0 truncate text-text-muted">{host}</span> : null}
                <Icon
                    icon={ChevronRight20Regular}
                    className={cn("shrink-0 text-text-muted transition-transform duration-200", open && "rotate-90")}
                />
            </button>
            <Collapse open={open}>
                <div className="mt-0.5 flex flex-col">
                    {cards.map((card) => (
                        <PersonaRow key={card.id} card={card} live={liveById.get(card.id)} />
                    ))}
                </div>
            </Collapse>
        </div>
    );
}
