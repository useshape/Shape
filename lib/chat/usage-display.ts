import { getShapeCatalog } from "@/lib/catalog/store";
import type { ShapeAuthState } from "@/lib/cloud/types";
import type { LastTurnUsage } from "@/lib/chat/last-turn-usage";

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

export function isLegacyAutoId(model?: string | null): boolean {
    return !model || model === "auto" || model === "openrouter/auto";
}

export function isAutoModelId(model?: string | null): boolean {
    if (!model) return false;
    if (isLegacyAutoId(model)) return true;
    const catalog = getShapeCatalog();
    return Boolean(catalog?.models.some((item) => item.id === model && (item.minTier === "free" || item.provider === "Free Models")));
}

export function formatModelLabel(model?: string | null): string {
    if (!model?.trim()) return "";
    if (model === "auto" || model === "openrouter/auto") return "Free";
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
    if ((model === "auto" || model === "openrouter/auto") && (stats?.usedAuto || isAutoModelId(model))) return "Free";
    return formatModelLabel(model);
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
    const credits = messageUsagePercent(stats, model);
    const input = stats.inputTokens;
    const output = stats.outputTokens;

    if (usedAuto && tokens > 0) {
        rows.push({
            label: "Tokens",
            value: tokens.toLocaleString(),
        });
    } else if (!usedAuto && credits > 0) {
        rows.push({ label: "Usage", value: `${credits < 0.01 ? "<0.01" : credits.toFixed(2)}%` });
    }

    if (input != null && input > 0) {
        rows.push({ label: "Input", value: input.toLocaleString() });
    }
    if (output != null && output > 0) {
        rows.push({ label: "Output", value: output.toLocaleString() });
    }

    return rows;
}

/** What this reply cost. The server charge wins; otherwise price the tokens the turn reported. */
function messageUsagePercent(stats: MessageUsageStats, model?: string | null): number {
    const charged = stats.creditsCharged ?? 0;
    if (charged > 0) return charged;
    if (stats.usedAuto || isAutoModelId(model)) return 0;
    const catalog = getShapeCatalog();
    const priced = catalog?.models.find((item) => item.id === model);
    if (!priced || (priced.inputCost <= 0 && priced.outputCost <= 0)) return 0;
    const input = stats.inputTokens ?? 0;
    const output = stats.outputTokens ?? 0;
    const usd = (input / 1_000_000) * priced.inputCost + (output / 1_000_000) * priced.outputCost;
    return (usd * 1.4) / 0.02;
}

export type ChatUsageDisplay = {
    mode: "free" | "usage";
    /** Free-usage ring fill, 0–100. Paid usage does not use this as a cap. */
    percent: number;
    /** Short primary line, e.g. "18% used" or "300% usage remaining". */
    title: string;
    /** Number shown beside the ring, e.g. "300%". */
    headline: string;
    /** Secondary line — kept for API compat; prefer empty / same as title. */
    detail: string;
    /** Single-line tooltip. */
    tooltip: string;
    /** Draw the meter only after the limit is actually reached. */
    showMeter: boolean;
    warn: boolean;
};

/** Same number the balance already is. 1,200 usage left reads as 1,200%. */
function formatUsageAmount(n: number): string {
    return String(Math.round(Math.max(0, n) * 100) / 100);
}

export function freeUsageMeter(percent: number | null | undefined): ChatUsageDisplay {
    const used = Math.max(0, Math.round(percent ?? 0));
    if (used >= 100) {
        return {
            mode: "free",
            percent: 100,
            title: "Free usage limit reached",
            headline: "100%",
            detail: "Free usage limit reached",
            tooltip: "Free usage limit reached",
            showMeter: true,
            warn: true,
        };
    }
    const title = `${used}% used`;
    return {
        mode: "free",
        percent: used,
        title,
        headline: `${used}%`,
        detail: title,
        tooltip: `${used}% of free usage used`,
        showMeter: true,
        warn: false,
    };
}

export function paidUsageMeter(remaining: number, included: number): ChatUsageDisplay {
    if (included <= 0 && remaining <= 0) {
        return {
            mode: "usage",
            percent: 0,
            title: "No usage on this plan",
            headline: "—",
            detail: "Upgrade for named models.",
            tooltip: "No usage on this plan",
            showMeter: false,
            warn: false,
        };
    }
    if (remaining <= 0) {
        return {
            mode: "usage",
            percent: 100,
            title: "Usage limit reached",
            headline: "0%",
            detail: "Usage limit reached",
            tooltip: "Usage limit reached",
            showMeter: true,
            warn: true,
        };
    }
    const pct = formatUsageAmount(remaining);
    const title = `${pct}% usage remaining`;
    const used = included > 0
        ? Math.max(0, Math.min(100, Math.round(((included - Math.min(remaining, included)) / included) * 100)))
        : 0;
    return {
        mode: "usage",
        percent: used,
        title,
        headline: `${pct}%`,
        detail: title,
        tooltip: title,
        showMeter: true,
        warn: false,
    };
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
                mode: "usage",
                percent: 0,
                title: "",
                headline: "",
                detail: "",
                tooltip: "",
                showMeter: false,
                warn: false,
            };
        }
        return {
            mode: "usage",
            percent: 0,
            title: "Sign in",
            headline: "Sign in",
            detail: "to view usage",
            tooltip: "Sign in to view usage",
            showMeter: false,
            warn: false,
        };
    }

    const usingFree = selectedModel === "auto" || isAutoModelId(selectedModel) || auth.tier === "free";
    if (usingFree) return freeUsageMeter(auth.freeAutoPercent);
    return paidUsageMeter(auth.creditsRemaining, auth.creditsIncluded);
}
