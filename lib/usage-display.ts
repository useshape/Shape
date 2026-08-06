import type { ShapeAuthState } from "@/lib/shape-auth/types";
import type { LastTurnUsage } from "@/lib/last-turn-usage";

/** Matches website Auto monthly pool — used only for turn-delta % display. */
export const AUTO_MONTHLY_TOKEN_POOL = 5_000_000;

export type MessageUsageStats = {
    timeMs?: number;
    cost?: number;
    tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    creditsCharged?: number;
    usedAuto?: boolean;
    /** @deprecated Account monthly % — do not show as per-message usage. */
    autoPercent?: number;
};

export function isAutoModelId(model?: string | null): boolean {
    if (!model) return false;
    const normalized = model === "openrouter/auto" ? "auto" : model;
    return normalized === "auto";
}

export function formatModelLabel(model?: string | null): string {
    if (!model) return "Unknown";
    if (isAutoModelId(model)) return "Auto";
    const slug = model.includes("/") ? model.split("/").pop()! : model;
    return slug
        .split("-")
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join(" ");
}

function formatTokenCount(n: number): string {
    if (n < 1000) return `${n}`;
    if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
    if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** Per-message usage for the details popover — never account monthly %. */
export function formatMessageUsageLine(
    stats: MessageUsageStats | undefined,
    model?: string | null,
): string {
    const usedAuto = stats?.usedAuto ?? isAutoModelId(model);
    const tokens = stats?.tokens ?? 0;
    const credits = stats?.creditsCharged ?? 0;

    if (usedAuto) {
        if (tokens > 0) return `${formatTokenCount(tokens)} tokens`;
        return "Included";
    }

    if (credits > 0) {
        const creditPart = `${credits.toFixed(2)} credits`;
        return tokens > 0 ? `${creditPart} · ${formatTokenCount(tokens)} tokens` : creditPart;
    }

    if (tokens > 0) return `${formatTokenCount(tokens)} tokens`;
    return "No charge";
}

export type ChatUsageDisplay = {
    mode: "auto" | "credits";
    /** Ring fill for *this turn's* share of the allowance (not lifetime/month total). */
    percent: number;
    /** Short primary line, e.g. "2% used". */
    title: string;
    /** Secondary line, e.g. "12.4K tokens" or "427 left". */
    detail: string;
    /** Single-line tooltip content (Cursor-style). */
    tooltip: string;
};

function turnPercentOfPool(amount: number, pool: number): number {
    if (pool <= 0 || amount <= 0) return 0;
    const raw = (amount / pool) * 100;
    if (raw > 0 && raw < 1) return Math.max(1, Math.round(raw));
    return Math.min(100, Math.round(raw));
}

export function resolveChatUsageDisplay(
    selectedModel: string,
    auth: Pick<ShapeAuthState, "loggedIn" | "tier" | "freeAutoPercent" | "creditsIncluded" | "creditsRemaining">,
    lastTurn?: LastTurnUsage | null,
): ChatUsageDisplay {
    if (!auth.loggedIn) {
        return {
            mode: "credits",
            percent: 0,
            title: "Sign in",
            detail: "to view usage",
            tooltip: "Sign in to view usage",
        };
    }

    const usingAuto = selectedModel === "auto" || auth.tier === "free";
    const turn = lastTurn;

    if (usingAuto) {
        const tokens = turn?.tokens ?? 0;
        const percent = turnPercentOfPool(tokens, AUTO_MONTHLY_TOKEN_POOL);
        if (!turn || tokens <= 0) {
            return {
                mode: "auto",
                percent: 0,
                title: "0% used",
                detail: "No usage yet",
                tooltip: "0% used · No usage yet",
            };
        }
        const detail = `${formatTokenCount(tokens)} tokens`;
        return {
            mode: "auto",
            percent,
            title: `${percent}% used`,
            detail,
            tooltip: `${percent}% used · ${detail}`,
        };
    }

    const included = auth.creditsIncluded;
    const remaining = auth.creditsRemaining;
    const charged = turn?.creditsCharged ?? 0;
    if (included > 0) {
        const percent = turnPercentOfPool(charged, included);
        const left = `${remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })} left`;
        if (!turn || charged <= 0) {
            return {
                mode: "credits",
                percent: 0,
                title: "0% used",
                detail: left,
                tooltip: `Credits: 0% used (${left})`,
            };
        }
        return {
            mode: "credits",
            percent,
            title: `${percent}% used`,
            detail: left,
            tooltip: `Credits: ${percent}% used (${left})`,
        };
    }

    return {
        mode: "credits",
        percent: 0,
        title: "Credits",
        detail: "none on this plan",
        tooltip: "Credits: none on this plan",
    };
}
