"use client";

import React, { useMemo, useState } from "react";
import { ChatMarkdown } from "../md/view";
import { Collapse } from "./collapse";
import { ActionLine } from "./action-line";
import { providerIcon } from "@/lib/ui/provider-icon";
import { AUTO_DISPLAY_MODEL } from "../message/bubble";
import { isAutoModelId } from "@/lib/chat/usage-display";

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
    const [open, setOpen] = useState(false);
    const display = useMemo(() => formatReviewContent(content), [content]);
    const iconModel =
        model && !isAutoModelId(model) ? model : AUTO_DISPLAY_MODEL;

    if (!display?.trim()) return null;

    return (
        <div className="my-0.5">
            <ActionLine
                action="Adversarial review"
                icon={
                    <span className="flex size-4 shrink-0 items-center justify-center overflow-visible">
                        {providerIcon(iconModel, 14)}
                    </span>
                }
                onClick={() => setOpen((v) => !v)}
            />
            <Collapse open={open}>
                <div className="pl-5.5 py-1 text-sm font-medium text-text-primary prose-compact chat-markdown">
                    <ChatMarkdown content={display} />
                </div>
            </Collapse>
        </div>
    );
}
