"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Phrases for the live tail. Waiting states stay literal; everything else rotates. */
const PHRASES = [
    "Figuring it out.",
    "Looking this over.",
    "Putting it together.",
    "Checking the details.",
    "Working through it.",
    "Reading the files.",
    "Thinking it through.",
    "Piecing this together.",
] as const;

function browsePhrases(host: string): readonly string[] {
    const site = host.replace(/^www\./, "") || "the page";
    return [
        `Opening ${site}.`,
        `Looking at ${site}.`,
        `Reading ${site}.`,
        `Clicking through ${site}.`,
    ];
}

const LONGEST = PHRASES.reduce((a, b) => (a.length >= b.length ? a : b));
const SWAP_MS = 180;
const HOLD_MS = 2800;

function waitingPhrase(label?: string | null): string | null {
    const text = label?.trim() ?? "";
    if (!text) return null;
    if (/^waiting\b/i.test(text)) return text;
    return null;
}

/**
 * One quiet status line: a small Slide mark and a crossfading phrase.
 * Width is reserved for the longest phrase so swaps do not move the thread.
 */
export function AgentStatus({ label, browsing }: { label?: string | null; browsing?: string | null }) {
    const fixed = waitingPhrase(label);
    const phrases = browsing ? browsePhrases(browsing) : PHRASES;
    const [index, setIndex] = useState(0);
    const [shown, setShown] = useState(true);
    const text = fixed ?? phrases[index % phrases.length];

    useEffect(() => {
        if (fixed) return;
        let swap = 0;
        const timer = window.setInterval(() => {
            setShown(false);
            swap = window.setTimeout(() => {
                setIndex((n) => (n + 1) % phrases.length);
                setShown(true);
            }, SWAP_MS);
        }, HOLD_MS);
        return () => {
            window.clearInterval(timer);
            window.clearTimeout(swap);
        };
    }, [fixed, browsing, phrases.length]);

    return (
        <div className="flex h-5 items-center gap-1.5 text-sm text-text-muted" aria-live="polite">
            <span className="imsg-typing imsg-typing-sm shrink-0" aria-hidden>
                <span />
                <span />
                <span />
            </span>
            <span className="relative inline-flex h-5 items-center">
                <span className="invisible whitespace-nowrap" aria-hidden>
                    {fixed ?? (browsing ? browsePhrases(browsing).reduce((a, b) => (a.length >= b.length ? a : b)) : LONGEST)}
                </span>
                <span
                    className={cn(
                        "absolute left-0 top-0 flex h-5 items-center whitespace-nowrap transition-opacity duration-200 ease-out",
                        shown || fixed ? "opacity-100" : "opacity-0",
                    )}
                >
                    {text}
                </span>
            </span>
        </div>
    );
}

/** @deprecated Use AgentStatus. Kept so existing call sites share one indicator. */
export function GeneratingIndicator({
    label,
    browsing,
}: {
    label?: string;
    browsing?: string | null;
    showTimer?: boolean;
    variantSeed?: string;
    model?: string;
}) {
    return <AgentStatus label={label} browsing={browsing} />;
}

export function ThinkShimmer({ text }: { text: string }) {
    return <AgentStatus label={text} />;
}
