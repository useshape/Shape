"use client";

import { cn } from "@/lib/utils";

export type ContextBreakdown = {
    system?: number;
    rules?: number;
    mode?: number;
    projectContext?: number;
    tools?: number;
    mcpTools?: number;
    conversation?: number;
    summarized?: number;
    estimatedTotal?: number;
    contextLimit?: number;
};

const SEGMENTS: { key: keyof ContextBreakdown; label: string; color: string }[] = [
    { key: "conversation", label: "Messages", color: "bg-sky-500" },
    { key: "tools", label: "System tools", color: "bg-violet-500" },
    { key: "mcpTools", label: "MCP tools", color: "bg-pink-500" },
    { key: "rules", label: "Skills", color: "bg-amber-400" },
    { key: "system", label: "System prompt", color: "bg-emerald-500" },
    { key: "projectContext", label: "Memory files", color: "bg-teal-400" },
    { key: "mode", label: "Mode", color: "bg-lime-500" },
    { key: "summarized", label: "Summarized", color: "bg-zinc-400" },
];

function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
    return n.toLocaleString();
}

function asNumber(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function ContextWindowMenu({
    breakdown,
    inputTokens,
    outputTokens,
}: {
    breakdown?: ContextBreakdown | null;
    inputTokens?: number;
    outputTokens?: number;
}) {
    const raw = breakdown ?? {};
    const limit = asNumber(raw.contextLimit) || 0;
    const estimated = asNumber(raw.estimatedTotal);
    const billed = asNumber(inputTokens);
    const used = billed > 0 ? billed : estimated;
    const rows = SEGMENTS.map((seg) => ({
        ...seg,
        tokens: asNumber(raw[seg.key]),
    })).filter((s) => s.tokens > 0);

    if (rows.length === 0 && (asNumber(inputTokens) > 0 || asNumber(outputTokens) > 0)) {
        rows.push(
            { key: "conversation", label: "Messages", color: "bg-sky-500", tokens: asNumber(inputTokens) },
        );
        if (asNumber(outputTokens) > 0) {
            rows.push({ key: "mode", label: "Output", color: "bg-violet-400", tokens: asNumber(outputTokens) });
        }
    }

    if (rows.length === 0) return null;

    const listed = rows.reduce((s, r) => s + r.tokens, 0);
    const barTotal = Math.max(used, listed, 1);
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    return (
        <div className="flex flex-col gap-2.5 p-1.5">
            <div className="flex items-baseline justify-between gap-3 px-1">
                <span className="text-sm font-medium text-text-primary">Context window</span>
                <span className="text-xs tabular-nums text-text-muted">
                    {formatTokens(used)}
                    {limit > 0 ? ` / ${formatTokens(limit)}` : ""}
                    {limit > 0 ? ` (${pct}%)` : ""}
                </span>
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-panel-hover">
                {rows.map((seg) => (
                    <div
                        key={String(seg.key)}
                        className={cn(seg.color, "h-full min-w-px")}
                        style={{ width: `${Math.max(1, (seg.tokens / barTotal) * 100)}%` }}
                        title={`${seg.label}: ${seg.tokens.toLocaleString()}`}
                    />
                ))}
            </div>
            <div className="flex flex-col gap-1">
                {rows.map((seg) => (
                    <div key={String(seg.key)} className="flex items-center gap-2 px-1 text-xs">
                        <span className={cn("size-1.5 shrink-0 rounded-full", seg.color)} />
                        <span className="min-w-0 flex-1 truncate text-text-secondary">{seg.label}</span>
                        <span className="tabular-nums text-text-muted">
                            {formatTokens(seg.tokens)}
                            {listed > 0 ? ` · ${Math.round((seg.tokens / listed) * 100)}%` : ""}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
