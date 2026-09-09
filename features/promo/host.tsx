"use client";

import { RiCloseLine } from "@remixicon/react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { useProjectState } from "@/lib/backend";
import { isWebProject } from "@/features/detection/lib/lib";
import catalog from "@/content/promo-cards.json";
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

function runAction(card: PromoCardDef) {
    const action = card.action;
    if (action.kind === "try" && action.event) {
        window.dispatchEvent(new Event(action.event));
        return;
    }
    if (action.href) {
        window.dispatchEvent(
            new CustomEvent("shape-navigate", { detail: { href: action.href } }),
        );
    }
}

export function PromoCardHost() {
    const pathname = usePathname();
    const { project_path } = useProjectState();
    const [web, setWeb] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [seen, setSeen] = useState<string[]>([]);
    const [dismissed, setDismissed] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
        setSeen(loadSeenPromoIds());
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
    const cards = (catalog as PromoCardsFile).cards ?? [];

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

    if (!mounted || !card) return null;

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
                className="pointer-events-auto w-[min(320px,calc(100vw-2.5rem))] overflow-hidden rounded-xl border border-border-subtle bg-surface-4 shadow-md/10"
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
                        <Icon icon={RiCloseLine} />
                    </Button>
                </div>
                <div className="p-3">
                    <h2 className="text-md font-semibold leading-snug text-text-foreground">{card.title}</h2>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{card.body}</p>
                </div>
                <div className="flex items-center justify-end p-3">
                    <Button
                        type="button"
                        onClick={() => {
                            if (card.action.kind === "try") runAction(card);
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
