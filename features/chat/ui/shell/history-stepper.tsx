"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

const MAX_TICKS = 9;
const LOCK_MS = 480;
const W_ACTIVE = 14;
const W_DEFAULT = 3.5;

function truncateTurnLabel(raw: string, maxChars = 90): string {
    const one = raw.replace(/\s+/g, " ").trim();
    if (!one) return "Turn";
    if (one.length <= maxChars) return one;
    const cut = one.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(" ");
    const base = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd();
    return `${base}…`;
}

function tickWidth(distance: number): number {
    const d = Math.abs(distance);
    if (d === 0) return W_ACTIVE;
    if (d === 1) return 10;
    if (d === 2) return 7;
    if (d === 3) return 5;
    return W_DEFAULT;
}

/**
 * Tick window keeps the active turn visually centered in the rail.
 * Only at the first/last messages does the active tick sit at the top/bottom.
 */
function centeredWindow(turnCount: number, activeIndex: number): number[] {
    if (turnCount <= MAX_TICKS) {
        return Array.from({ length: turnCount }, (_, i) => i);
    }
    const half = Math.floor(MAX_TICKS / 2);
    let start = activeIndex - half;
    if (start < 0) start = 0;
    if (start + MAX_TICKS > turnCount) start = turnCount - MAX_TICKS;
    return Array.from({ length: MAX_TICKS }, (_, i) => start + i);
}

export function ChatHistoryStepper({
    turnCount,
    activeIndex,
    onSelect,
    turnLabels,
    className,
}: {
    turnCount: number;
    activeIndex: number;
    onSelect: (index: number) => void;
    turnLabels?: string[];
    className?: string;
}) {
    const ticks = useMemo(
        () => centeredWindow(turnCount, activeIndex),
        [turnCount, activeIndex],
    );

    if (turnCount < 2) return null;

    return (
        <div
            className={cn("flex flex-col items-center gap-1.5 select-none py-1", className)}
            role="navigation"
            aria-label="Chat history"
        >
            {ticks.map((turnIdx) => {
                const dist = turnIdx - activeIndex;
                const active = turnIdx === activeIndex;
                const width = tickWidth(dist);
                const label = truncateTurnLabel(turnLabels?.[turnIdx] || `Turn ${turnIdx + 1}`);
                return (
                    <Tooltip
                        key={turnIdx}
                        content={
                            <span className="block max-w-56 whitespace-normal wrap-break-word line-clamp-2 text-left text-sm leading-snug">
                                {label}
                            </span>
                        }
                        side="left"
                        delayDuration={120}
                    >
                        <button
                            type="button"
                            aria-label={label}
                            aria-current={active ? "true" : undefined}
                            onClick={() => onSelect(turnIdx)}
                            className="flex h-3 w-4 items-center justify-center"
                        >
                            <span
                                className={cn(
                                    "block h-0.5 rounded-full",
                                    active
                                        ? "bg-text-primary opacity-100"
                                        : "bg-text-muted/45 hover:bg-text-muted",
                                )}
                                style={{
                                    width,
                                    transition:
                                        "width 220ms cubic-bezier(0.22, 1, 0.36, 1), background-color 220ms ease, opacity 220ms ease",
                                }}
                            />
                        </button>
                    </Tooltip>
                );
            })}
        </div>
    );
}

/**
 * Discrete active turn from scroll position.
 * Hysteresis + center-band picking keeps the rail stable (active stays middle
 * of the viewport) and only moves to ends at top/bottom of the thread.
 */
export function useChatTurnActive(
    scrollRoot: React.RefObject<HTMLElement | null>,
    turnCount: number,
    opts?: { streaming?: boolean },
): [number, (index: number) => void] {
    const [active, setActive] = useState(0);
    const lockUntil = useRef(0);
    const rafRef = useRef(0);
    const activeRef = useRef(0);
    const streamingRef = useRef(!!opts?.streaming);
    streamingRef.current = !!opts?.streaming;

    useEffect(() => {
        setActive((prev) => {
            const next = Math.min(prev, Math.max(0, turnCount - 1));
            activeRef.current = next;
            return next;
        });
    }, [turnCount]);

    useEffect(() => {
        const root = scrollRoot.current;
        if (!root || turnCount === 0) return;

        const nearTop = () => root.scrollTop < 48;
        const nearBottom = () =>
            root.scrollHeight - root.scrollTop - root.clientHeight < 96;

        const compute = () => {
            if (Date.now() < lockUntil.current) return;

            if (streamingRef.current && nearBottom()) {
                const last = turnCount - 1;
                if (activeRef.current !== last) {
                    activeRef.current = last;
                    setActive(last);
                }
                return;
            }

            // Pin first/last when scrolled to ends — active leaves visual center.
            if (nearTop()) {
                if (activeRef.current !== 0) {
                    activeRef.current = 0;
                    setActive(0);
                }
                return;
            }
            if (nearBottom()) {
                const last = turnCount - 1;
                if (activeRef.current !== last) {
                    activeRef.current = last;
                    setActive(last);
                }
                return;
            }

            const nodes = root.querySelectorAll<HTMLElement>("[data-chat-turn]");
            if (nodes.length === 0) return;

            // Mid-viewport band — turn whose top is closest to center.
            const band = root.getBoundingClientRect().top + root.clientHeight * 0.42;
            let bestIdx = activeRef.current;
            let bestDist = Number.POSITIVE_INFINITY;

            nodes.forEach((node) => {
                const idx = Number(node.dataset.chatTurn);
                if (!Number.isFinite(idx)) return;
                const top = node.getBoundingClientRect().top;
                const dist = Math.abs(top - band);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestIdx = idx;
                }
            });

            // Hysteresis: ignore tiny crossings so the active tick doesn't flicker.
            if (bestIdx === activeRef.current) return;
            const currentNode = root.querySelector<HTMLElement>(
                `[data-chat-turn="${activeRef.current}"]`,
            );
            if (currentNode) {
                const curTop = currentNode.getBoundingClientRect().top;
                const curDist = Math.abs(curTop - band);
                if (curDist < bestDist + 36) return;
            }

            activeRef.current = bestIdx;
            setActive(bestIdx);
        };

        const onScroll = () => {
            if (rafRef.current) return;
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = 0;
                compute();
            });
        };

        compute();
        root.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            root.removeEventListener("scroll", onScroll);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [scrollRoot, turnCount]);

    const select = useCallback(
        (index: number) => {
            const root = scrollRoot.current;
            if (!root) return;
            const clamped = Math.max(0, Math.min(turnCount - 1, index));
            const el = root.querySelector<HTMLElement>(`[data-chat-turn="${clamped}"]`);
            if (!el) return;
            lockUntil.current = Date.now() + LOCK_MS;
            activeRef.current = clamped;
            setActive(clamped);
            el.scrollIntoView({ behavior: "smooth", block: "center" });
        },
        [scrollRoot, turnCount],
    );

    return [active, select];
}
