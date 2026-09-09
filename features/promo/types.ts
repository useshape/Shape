export type PromoTrigger = {
    pages?: string[];
    webProject?: boolean;
};

export type PromoAction = {
    kind: "ok" | "try";
    label?: string;
    event?: string;
    href?: string;
};

export type PromoCardDef = {
    id: string;
    title: string;
    body: string;
    image: string;
    trigger?: PromoTrigger;
    action: PromoAction;
};

export type PromoCardsFile = {
    cards: PromoCardDef[];
};

const SEEN_KEY = "shape-promo-seen";

export function loadSeenPromoIds(): string[] {
    try {
        const raw = localStorage.getItem(SEEN_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
        return [];
    }
}

export function markPromoSeen(id: string) {
    const next = new Set(loadSeenPromoIds());
    next.add(id);
    try {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
    } catch {
        /* ignore */
    }
}

export function pageMatchesTrigger(page: string, trigger?: PromoTrigger): boolean {
    const pages = trigger?.pages;
    if (!pages || pages.length === 0 || pages.includes("*")) return true;
    return pages.includes(page);
}
