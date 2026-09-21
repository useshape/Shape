import type { ShapeAuthState } from "@/lib/cloud/types";
import type { LastTurnUsage } from "@/lib/chat/last-turn-usage";

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
    contextBreakdown?: Record<string, number> | null;
};

export function isAutoModelId(model?: string | null): boolean {
    if (!model) return false;
    const normalized = model === "openrouter/auto" ? "auto" : model;
    return normalized === "auto";
}

export function formatModelLabel(model?: string | null): string {
    if (!model?.trim()) return "";
    if (isAutoModelId(model)) return "Auto";
    const slug = model.includes("/") ? model.split("/").pop()! : model;
    return slug
        .split("-")
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join(" ");
}

/** Message header: Auto when Auto was selected; otherwise the concrete model name. */
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
        .join(" · ") || "";
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
    /** Ring fill for monthly account usage (switches with Auto vs premium model). */
    percent: number;
    /** Short primary line, e.g. "18% used". */
    title: string;
    /** Secondary line — kept for API compat; prefer empty / same as title. */
    detail: string;
    /** Single-line tooltip. */
    tooltip: string;
    used?: number;
    included?: number;
};

function formatCredits(n: number): string {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function resolveChatUsageDisplay(
    selectedModel: string,
    auth: Pick<
        ShapeAuthState,
        | "loggedIn"
        | "isLoading"
        | "revalidating"
        | "tier"
        | "freeAutoPercent"
        | "creditsIncluded"
        | "creditsRemaining"
    >,
    _lastTurn?: LastTurnUsage | null,
): ChatUsageDisplay {
    if (!auth.loggedIn) {
        if (auth.isLoading || auth.revalidating) {
            return {
                mode: "credits",
                percent: 0,
                title: "",
                detail: "",
                tooltip: "",
            };
        }
        return {
            mode: "credits",
            percent: 0,
            title: "Sign in",
            detail: "to view usage",
            tooltip: "Sign in to view usage",
        };
    }

    const usingAuto = selectedModel === "auto" || isAutoModelId(selectedModel) || auth.tier === "free";

    if (usingAuto) {
        const percent = Math.max(0, Math.min(100, Math.round(auth.freeAutoPercent ?? 0)));
        const title = `${percent}% used`;
        return {
            mode: "auto",
            percent,
            title,
            detail: title,
            tooltip: `${title} this month (Auto)`,
        };
    }

    const included = auth.creditsIncluded;
    if (included > 0) {
        const used = Math.max(0, included - Math.max(0, auth.creditsRemaining));
        const percent = Math.max(0, Math.min(100, Math.round((used / included) * 100)));
        const title = `${formatCredits(used)} out of ${formatCredits(included)}`;
        return {
            mode: "credits",
            percent,
            title,
            detail: title,
            tooltip: `${title} this month`,
            used,
            included,
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
