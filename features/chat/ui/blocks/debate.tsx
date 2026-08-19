"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { ChatMarkdown } from "../md/view";
import { notify } from "@/features/notifications";

function formatReviewContent(raw: string): string | null {
    const trimmed = raw
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .trim();
    if (!trimmed) return null;

    // Ignore placeholder / leaked titles that aren't a real review write-up.
    if (/^(new chat|untitled)$/i.test(trimmed) || trimmed.length < 24) {
        return null;
    }

    // Models sometimes dump a JSON verdict; render as readable markdown instead.
    const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    const candidate = (fence ? fence[1] : trimmed).trim();
    if (!(candidate.startsWith("{") || candidate.startsWith("["))) {
        return trimmed;
    }

    try {
        const data = JSON.parse(candidate) as Record<string, unknown>;
        const verdict =
            data.verdict && typeof data.verdict === "object"
                ? (data.verdict as Record<string, unknown>)
                : data;

        const lines: string[] = [];
        const pushList = (title: string, value: unknown) => {
            if (value == null) return;
            lines.push(`**${title}**`);
            if (Array.isArray(value)) {
                for (const item of value) {
                    lines.push(`- ${typeof item === "string" ? item : JSON.stringify(item)}`);
                }
            } else if (typeof value === "string" || typeof value === "number") {
                lines.push(`- ${value}`);
            } else {
                lines.push(`- ${JSON.stringify(value)}`);
            }
            lines.push("");
        };

        pushList("Confirmed issues", verdict.confirmed_issues ?? verdict.confirmedIssues);
        pushList("Disputed points", verdict.disputed_points ?? verdict.disputedPoints);
        pushList("Confidence", verdict.confidence);
        pushList(
            "Minimal fix plan",
            verdict.minimal_fix_plan ?? verdict.minimalFixPlan ?? verdict.fix_plan,
        );
        pushList("Tipping evidence", verdict.tipping_evidence ?? verdict.tippingEvidence);

        const formatted = lines.join("\n").trim();
        return formatted || trimmed;
    } catch {
        return trimmed;
    }
}

function severityFromContent(display: string): "critical" | "warning" | null {
    const lower = display.toLowerCase();
    if (
        lower.includes("critical") ||
        lower.includes("confirmed issues") ||
        lower.includes("cve") ||
        lower.includes("security")
    ) {
        return "critical";
    }
    if (lower.includes("warning") || lower.includes("potential")) return "warning";
    return "critical";
}

export function ReviewDebatePanel({ content }: { content: string }) {
    const [open, setOpen] = useState(true);
    const display = useMemo(() => formatReviewContent(content), [content]);
    const warnedRef = useRef(false);
    const severity = display ? severityFromContent(display) : null;

    useEffect(() => {
        if (display != null || warnedRef.current) return;
        if (!content.trim()) return;
        warnedRef.current = true;
        notify.warning("Adversarial review", "No usable summary for this turn.");
    }, [content, display]);

    if (!display?.trim()) return null;

    return (
        <div className="my-1 w-full overflow-hidden rounded-xl border border-border bg-surface-2/40">
            <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
                onClick={() => setOpen((v) => !v)}
            >
                <span className="flex size-5 shrink-0 items-center justify-center rounded bg-orange-500/90">
                    <Icon name="security" size={12} className="text-white" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                    Adversarial review
                </span>
                {severity === "critical" ? (
                    <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
                        Critical
                    </span>
                ) : severity === "warning" ? (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                        Warning
                    </span>
                ) : null}
                <Icon
                    name={open ? "expand_less" : "expand_more"}
                    size={14}
                    className="shrink-0 text-text-muted"
                />
            </button>
            {open ? (
                <div
                    className={cn(
                        "border-t border-border px-3 py-2.5 text-sm text-text-primary prose-compact chat-markdown",
                    )}
                >
                    <ChatMarkdown content={display} />
                </div>
            ) : null}
        </div>
    );
}
