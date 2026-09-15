"use client";

import {
    AgentThinking,
    type AgentThinkingVariant,
} from "@/components/application/agent-thinking/agent-thinking";

const VARIANTS: AgentThinkingVariant[] = ["wave", "spin", "stars", "infinity"];

export function thinkingVariantFor(label: string): AgentThinkingVariant {
    const lower = label.toLowerCase();
    if (/\b(search|web|reddit|google|docs)\b/.test(lower)) return "spin";
    if (/\b(run|command|terminal|test|install)\b/.test(lower)) return "infinity";
    if (/\b(edit|writ|creat|patch)\b/.test(lower)) return "wave";
    let n = 0;
    for (let i = 0; i < label.length; i++) n = (n + label.charCodeAt(i) * (i + 3)) % VARIANTS.length;
    return VARIANTS[n] ?? "stars";
}

function formatStatusLabel(label: string): string {
    return label.replace(/…+$/, "").trim() || "Working";
}

/** Live status line while streaming — mixed BoardUI thinking marks. */
export function GeneratingIndicator({
    label,
    showTimer = true,
    variantSeed,
}: {
    label?: string;
    showTimer?: boolean;
    variantSeed?: string;
}) {
    const display = formatStatusLabel(label?.trim() || "Working");
    return (
        <div className="flex items-center py-1">
            <AgentThinking
                variant={thinkingVariantFor(variantSeed || display)}
                label={display}
                tone="default"
                showTimer={showTimer}
            />
        </div>
    );
}
