"use client";

import { RiArrowDownSLine, RiArrowUpSLine } from "@remixicon/react";
import React, { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { ChatMarkdown } from "../md/view";
import { Collapse } from "./collapse";
import { providerIcon } from "@/lib/ui/provider-icon";
import { AUTO_DISPLAY_MODEL } from "../message/bubble";
import { isAutoModelId } from "@/lib/usage-display";

function formatReviewContent(raw: string): string | null {
    const trimmed = raw
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .trim();
    if (!trimmed) return null;

    if (/^(new chat|untitled)$/i.test(trimmed) || trimmed.length < 24) {
        return null;
    }

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

export function ReviewDebatePanel({
    content,
    model,
}: {
    content: string;
    model?: string;
}) {
    const [open, setOpen] = useState(true);
    const display = useMemo(() => formatReviewContent(content), [content]);
    const iconModel =
        model && !isAutoModelId(model) ? model : AUTO_DISPLAY_MODEL;

    if (!display?.trim()) return null;

    return (
        <div className="my-1 overflow-hidden rounded-xl border border-border-subtle bg-surface-3">
            <button
                type="button"
                className="flex w-full items-center gap-2 p-2 text-left hover:bg-panel-hover/40 transition-colors"
                onClick={() => setOpen((v) => !v)}
            >
                <span className="flex size-5 shrink-0 items-center justify-center overflow-visible">
                    {providerIcon(iconModel, 16)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-muted">
                    Adversarial review
                </span>
                <Icon
                    icon={open ? RiArrowUpSLine : RiArrowDownSLine}
                    className="shrink-0 text-text-muted"
                />
            </button>
            <Collapse open={open}>
                <div className="px-3 py-2.5 text-sm font-medium text-text-primary prose-compact chat-markdown">
                    <ChatMarkdown content={display} />
                </div>
            </Collapse>
        </div>
    );
}
