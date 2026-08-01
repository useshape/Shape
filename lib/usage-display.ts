import type { ShapeAuthState } from "@/lib/shape-auth/types";

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
    if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return `${Math.round(n / 1000)}k`;
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
    percent: number;
    tooltip: string;
};

export function resolveChatUsageDisplay(
    selectedModel: string,
    auth: Pick<ShapeAuthState, "loggedIn" | "tier" | "freeAutoPercent" | "creditsIncluded" | "creditsRemaining">,
): ChatUsageDisplay {
    if (!auth.loggedIn) {
        return { mode: "credits", percent: 0, tooltip: "Sign in to view usage" };
    }

    const usingAuto = selectedModel === "auto" || auth.tier === "free";
    if (usingAuto && auth.freeAutoPercent != null) {
        const percent = Math.round(auth.freeAutoPercent);
        return {
            mode: "auto",
            percent,
            tooltip: `Auto: ${percent}% used this month`,
        };
    }

    if (auth.creditsIncluded > 0) {
        const used = Math.max(0, auth.creditsIncluded - auth.creditsRemaining);
        const percent = Math.round((used / auth.creditsIncluded) * 100);
        return {
            mode: "credits",
            percent,
            tooltip: `Credits: ${percent}% used (${auth.creditsRemaining.toLocaleString()} left)`,
        };
    }

    return {
        mode: "credits",
        percent: 0,
        tooltip: "Credits: none on this plan",
    };
}
