"use client";

import { useEffect, useState } from "react";
import { ShimmerText } from "@/components/ui/shimmer-text";

function formatStatusLabel(label: string): string {
    return label.replace(/…+$/, "").trim() || "Working";
}

const IDLE_WORDS = [
    "Imagining",
    "Noodling",
    "Sketching",
    "Brewing",
    "Plotting",
    "Riffing",
    "Mulling",
    "Tinkering",
    "Humming",
    "Wondering",
] as const;

function isGenericLabel(label: string): boolean {
    return /^(thinking|working)$/i.test(label.trim());
}

function RotatingIdleWord() {
    const [index, setIndex] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => {
            setIndex((i) => (i + 1) % IDLE_WORDS.length);
        }, 2400);
        return () => window.clearInterval(id);
    }, []);
    return <ShimmerText>{IDLE_WORDS[index]!}</ShimmerText>;
}

/** Live status — bouncing dots plus the current activity label. */
export function GeneratingIndicator({
    label,
}: {
    label?: string;
    showTimer?: boolean;
    variantSeed?: string;
}) {
    const display = formatStatusLabel(label?.trim() || "Working");
    const idle = isGenericLabel(display);

    return (
        <div className="flex items-center gap-2.5 py-1 text-sm text-text-muted">
            <span className="imsg-typing" aria-hidden>
                <span />
                <span />
                <span />
            </span>
            <span className="min-w-0 truncate">
                {idle ? <RotatingIdleWord /> : <ShimmerText>{display}</ShimmerText>}
            </span>
        </div>
    );
}
