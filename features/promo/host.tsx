"use client";

import { Dismiss20Regular } from "@fluentui/react-icons/headless/svg/dismiss";
import { Settings20Regular } from "@fluentui/react-icons/headless/svg/settings";



import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";


import { useProjectState } from "@/lib/backend";
import { SHAPE_API_BASE } from "@/lib/cloud/api";
import { isWebProject } from "@/features/detection/lib/lib";
import catalog from "@/content/promo-cards.json";
import { useRuntimeFlag } from "@/lib/runtime/store";
import {
    loadSeenPromoIds,
    markPromoSeen,
    pageMatchesTrigger,
    type PromoCardDef,
    type PromoCardsFile,
} from "./types";
import { Button } from "@/components/ui/button";

function currentPage(pathname: string | null): string {
    if (!pathname || pathname === "/" || pathname === "") return "chat";
    if (pathname.startsWith("/settings")) return "settings";
    if (pathname.startsWith("/git") || pathname.startsWith("/branch")) return "git";
    if (pathname.startsWith("/onboarding")) return "onboarding";
    return "chat";
}

function runAction(card: PromoCardDef, navigate: (href: string) => void) {
    const action = card.action;
    if (action.kind === "try" && action.event) {
        window.dispatchEvent(new Event(action.event));
        return;
    }
    if (!action.href) return;
    if (action.href.startsWith("http://") || action.href.startsWith("https://")) {
        window.open(action.href, "_blank", "noopener,noreferrer");
        return;
    }
    navigate(action.href);
}

export function PromoCardHost() {
    const pathname = usePathname();
    const router = useRouter();
    const { project_path } = useProjectState();
    const promosOn = useRuntimeFlag("promo_cards", true);
    const [web, setWeb] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [seen, setSeen] = useState<string[]>([]);
    const [dismissed, setDismissed] = useState<string | null>(null);

    const [remoteCards, setRemoteCards] = useState<PromoCardDef[] | null>(null);

    useEffect(() => {
        setMounted(true);
        setSeen(loadSeenPromoIds());
        void fetch(`${SHAPE_API_BASE}/api/promos`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data: { cards?: PromoCardDef[] } | null) => {
                if (data?.cards?.length) setRemoteCards(data.cards);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!project_path) {
            setWeb(false);
            return;
        }
        let cancelled = false;
        void isWebProject(project_path).then((ok) => {
            if (!cancelled) setWeb(ok);
        });
        return () => {
            cancelled = true;
        };
    }, [project_path]);

    const page = currentPage(pathname);
    const cards = remoteCards ?? (catalog as PromoCardsFile).cards ?? [];

    const card = useMemo(() => {
        if (!mounted) return null;
        const skip = new Set(seen);
        if (dismissed) skip.add(dismissed);
        return (
            cards.find((c) => {
                if (skip.has(c.id)) return false;
                if (!pageMatchesTrigger(page, c.trigger)) return false;
                if (c.trigger?.webProject && !web) return false;
                return true;
            }) ?? null
        );
    }, [cards, dismissed, mounted, page, seen, web]);

    if (!promosOn || !mounted || !card) return null;

    const close = () => {
        markPromoSeen(card.id);
        setSeen(loadSeenPromoIds());
        setDismissed(card.id);
    };

    const primaryLabel =
        card.action.label
        ?? (card.action.kind === "try" ? "Try it out" : "OK");

    const node = (
        <div className="pointer-events-none fixed bottom-5 right-5 z-[210] flex justify-end">
            <div
                className="pointer-events-auto w-[min(320px,calc(100vw-2.5rem))] overflow-hidden squircle-3xl border border-border bg-surface-4 shadow-md/10"
                role="dialog"
                aria-label={card.title}
            >
                <div className="relative aspect-[16/10] bg-surface-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={card.image}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                    <Button
                        type="button"
                        aria-label="Dismiss"
                        onClick={close}
                        variant="ghost"
                        size="icon"
                        className="absolute text-text-foreground right-2.5 top-2.5"
                    >
                        <Icon icon={Dismiss20Regular} />
                    </Button>
                </div>
                <div className="p-3">
                    <h2 className="text-md font-semibold leading-snug text-text-foreground">{card.title}</h2>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{card.body}</p>
                </div>
                <div className="flex items-center justify-end p-3">
                    <Button
                        type="button"
                        variant="default"
                        size="lg"
                        className="w-full"
                        onClick={() => {
                            runAction(card, (href) => router.push(href));
                            close();
                        }}
                    >
                        {primaryLabel}
                    </Button>
                </div>
            </div>
        </div>
    );

    return createPortal(node, document.body);
}
