"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Phrases for the live tail. Waiting states stay literal; everything else rotates. */
const PHRASES = [
    "Working through the chaos.",
    "Reading the fine print.",
    "Thinking suspiciously hard.",
    "Connecting the dots.",
    "Consulting the brain cells.",
    "Making questionable progress.",
    "Untangling the spaghetti.",
    "Wrestling with the details.",
    "Summoning the answer.",
    "Asking the imaginary experts.",
    "Doing some brain stuff.",
    "Having a tiny think.",
    "Crunching invisible numbers.",
    "Staring at the problem intensely.",
    "Turning confusion into confidence.",
    "Making it make sense.",
    "Investigating the obvious.",
    "Running on pure curiosity.",
    "Applying advanced guesswork.",
    "Negotiating with the logic.",
    "Untying the intellectual shoelaces.",
    "Searching for the plot.",
    "Locating the missing brain cell.",
    "Performing wizardry.",
    "Polishing the thought bubbles.",
    "Doing the clever bits.",
    "Shaking the answer tree.",
    "Consulting the brain trust.",
    "Trying not to overthink it.",
    "Overthinking it anyway.",
    "Checking under the hood.",
    "Giving the pixels a pep talk.",
    "Assembling the brain furniture.",
    "Brewing a fresh conclusion.",
    "Running the mental machinery.",
    "Teaching the answer to behave.",
    "Making numbers nervous.",
    "Poking around the problem.",
    "Deploying unnecessary intelligence.",
    "One moment, genius loading.",
    "The cogs are doing their thing.",
    "Please hold, brain in progress.",
    "A wild answer is forming.",
    "Almost suspiciously productive.",
    "Putting the 'artificial' in artificial intelligence.",
    "Making the electrons earn their keep.",
    "Doing science. Probably.",
    "Converting caffeine into conclusions.",
    "The plot is thickening.",
    "No thoughts left behind.",
    "Breathing life into the logic.",
    "Cross-checking my own nonsense.",
    "Trying the keys until one fits.",
    "The answer is somewhere in here.",
    "Cooking up something coherent.",
    "Just a little computational magic.",
    "Making the internet proud.",
    "Brain gears: engaged.",
    "Sorting the genius from the nonsense.",
    "Asking the important questions.",
    "Making a suspicious amount of progress.",
] as const;

function browsePhrases(host: string): readonly string[] {
    const site = host.replace(/^www\./, "") || "the page";
    return [
        `Opening ${site}.`,
        `Taking a peek at ${site}.`,
        `Having a nose around ${site}.`,
        `Investigating ${site}.`,
        `Seeing what ${site} is hiding.`,
        `Poking around ${site}.`,
        `Exploring the depths of ${site}.`,
        `Giving ${site} a good once-over.`,
        `Snooping around ${site}.`,
        `Checking out the neighbourhood at ${site}.`,
        `Following the digital breadcrumbs on ${site}.`,
        `Seeing what's cooking at ${site}.`,
        `Navigating the maze that is ${site}.`,
        `Asking ${site} nicely for answers.`,
        `Reading the small print on ${site}.`,
        `Going down the ${site} rabbit hole.`,
        `Searching ${site} for signs of intelligence.`,
        `Getting acquainted with ${site}.`,
        `Peeking behind the curtains at ${site}.`,
        `Giving ${site} the suspicious stare.`,
        `Looking for the good stuff on ${site}.`,
        `Checking whether ${site} has its act together.`,
        `Wandering around ${site} without a map.`,
        `Interrogating ${site} politely.`,
        `Making friends with ${site}.`,
        `Seeing if ${site} knows anything useful.`,
        `Extracting the juicy bits from ${site}.`,
        `Following links like a digital detective.`,
        `Doing a little cyber-snooping on ${site}.`,
        `Trying not to get lost in ${site}.`,
        `Consulting the oracle at ${site}.`,
        `Exploring ${site} like I own the place.`,
        `Checking under the hood at ${site}.`,
        `Looking for answers in the usual places.`,
        `Giving ${site} its five minutes of fame.`,
        `Bribing ${site} with HTTP requests.`,
        `Seeing what the internet left lying around.`,
        `Knocking on ${site}'s digital door.`,
        `Time to see what ${site} is made of.`,
        `Doing some extremely legal browsing at ${site}.`,
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
