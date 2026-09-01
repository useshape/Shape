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
    reasoningEffort?: string;
    mode?: string;
    latencyMs?: number;
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

/** Message details: prefer Auto when the turn used auto routing. */
export function formatMessageModelLabel(
    model?: string | null,
    stats?: MessageUsageStats,
): string {
    if (stats?.usedAuto || isAutoModelId(model)) return "Auto";
    return formatModelLabel(model);
}

function turnPercentOfPool(amount: number, pool: number): number {
    if (pool <= 0 || amount <= 0) return 0;
    const raw = (amount / pool) * 100;
    if (raw > 0 && raw < 1) return Math.max(1, Math.round(raw));
    return Math.min(100, Math.round(raw));
}

/** Per-message usage for the details popover — one joined line (tests / legacy). */
export function formatMessageUsageLine(
    stats: MessageUsageStats | undefined,
    model?: string | null,
): string {
    return formatMessageUsageRows(stats, model)
        .map((r) => r.value)
        .join(" · ") || "No charge";
}

/** Separate usage fields; omit anything without data. */
export function formatMessageUsageRows(
    stats: MessageUsageStats | undefined,
    model?: string | null,
): Array<{ label: string; value: string }> {
    if (!stats) return [];
    const rows: Array<{ label: string; value: string }> = [];
    const usedAuto = stats.usedAuto ?? isAutoModelId(model);
    const tokens = stats.tokens ?? 0;
    const credits = stats.creditsCharged ?? 0;
    const input = stats.inputTokens;
    const output = stats.outputTokens;

    if (usedAuto && tokens > 0) {
        rows.push({
            label: "Usage",
            value: `${turnPercentOfPool(tokens, AUTO_MONTHLY_TOKEN_POOL)}% used`,
        });
    } else if (!usedAuto && credits > 0) {
        rows.push({ label: "Credits", value: credits.toFixed(2) });
    }

    if (input != null && input > 0) {
        rows.push({ label: "Input", value: input.toLocaleString() });
    }
    if (output != null && output > 0) {
        rows.push({ label: "Output", value: output.toLocaleString() });
    }

    return rows;
}

export type ChatUsageDisplay = {
    mode: "auto" | "credits";
    /** Ring fill for *this turn's* share of the allowance (not lifetime/month total). */
    percent: number;
    /** Short primary line, e.g. "2% used". */
    title: string;
    /** Secondary line — kept for API compat; prefer empty / same as title. */
    detail: string;
    /** Single-line tooltip: response % only. */
    tooltip: string;
};

export function resolveChatUsageDisplay(
    selectedModel: string,
    auth: Pick<
        ShapeAuthState,
        "loggedIn" | "tier" | "freeAutoPercent" | "creditsIncluded" | "creditsRemaining"
    >,
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
        const title = `${percent}% used`;
        return {
            mode: "auto",
            percent,
            title,
            detail: title,
            tooltip: title,
        };
    }

    const included = auth.creditsIncluded;
    const charged = turn?.creditsCharged ?? 0;
    if (included > 0) {
        const percent = turnPercentOfPool(charged, included);
        const title = `${percent}% used`;
        return {
            mode: "credits",
            percent,
            title,
            detail: title,
            tooltip: title,
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
