"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
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

function StatusWipe({ text }: { text: string }) {
    const [shown, setShown] = useState(text);
    const [prev, setPrev] = useState<string | null>(null);

    useEffect(() => {
        if (text === shown) return;
        setPrev(shown);
        setShown(text);
    }, [text, shown]);

    return (
        <span className="relative inline-grid min-w-0 align-middle">
            {prev ? (
                <span
                    className="col-start-1 row-start-1 status-wipe-out"
                    onAnimationEnd={() => setPrev(null)}
                    aria-hidden
                >
                    <ShimmerText>{prev}</ShimmerText>
                </span>
            ) : null}
            <span className={cn("col-start-1 row-start-1", prev && "status-wipe-in")}>
                <ShimmerText>{shown}</ShimmerText>
            </span>
        </span>
    );
}

function RotatingIdleWord() {
    const [index, setIndex] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => {
            setIndex((i) => (i + 1) % IDLE_WORDS.length);
        }, 2400);
        return () => window.clearInterval(id);
    }, []);
    return <StatusWipe text={IDLE_WORDS[index]!} />;
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
        <div className="flex items-center gap-2 py-1 text-sm text-text-muted">
            <span className="imsg-typing" aria-hidden>
                <span />
                <span />
                <span />
            </span>
            <span className="min-w-0 truncate">
                {idle ? <RotatingIdleWord /> : <StatusWipe text={display} />}
            </span>
        </div>
    );
}
