"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MAX_TICKS = 40;
const LOCK_MS = 480;
const W_IDLE = 8;
const W_ACTIVE = 14;

function truncateTurnLabel(raw: string, maxChars = 90): string {
    const one = raw.replace(/\s+/g, " ").trim();
    if (!one) return "Turn";
    if (one.length <= maxChars) return one;
    const cut = one.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(" ");
    const base = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd();
    return `${base}…`;
}

/** One tick per turn, capped at MAX_TICKS (evenly sampled when over). */
function turnTicks(turnCount: number, activeIndex: number): number[] {
    if (turnCount <= 0) return [];
    if (turnCount <= MAX_TICKS) {
        return Array.from({ length: turnCount }, (_, i) => i);
    }
    const out = new Set<number>();
    for (let i = 0; i < MAX_TICKS; i++) {
        out.add(Math.round((i * (turnCount - 1)) / (MAX_TICKS - 1)));
    }
    out.add(Math.max(0, Math.min(turnCount - 1, activeIndex)));
    return [...out].sort((a, b) => a - b).slice(0, MAX_TICKS);
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
        () => turnTicks(turnCount, activeIndex),
        [turnCount, activeIndex],
    );

    if (turnCount < 2) return null;

    return (
        <div
            className={cn(
                "flex h-full min-h-0 w-4 flex-col items-end justify-center gap-1 select-none",
                className,
            )}
            role="navigation"
            aria-label="Chat history"
        >
            {ticks.map((turnIdx) => {
                const active = turnIdx === activeIndex;
                const label = truncateTurnLabel(turnLabels?.[turnIdx] || `Turn ${turnIdx + 1}`);
                return (
                    <button
                        key={turnIdx}
                        type="button"
                        title={label}
                        aria-label={label}
                        aria-current={active ? "true" : undefined}
                        onClick={() => onSelect(turnIdx)}
                        className="flex h-1 w-4 shrink-0 items-center justify-end"
                    >
                        <span
                            className={cn(
                                "block h-px rounded-full",
                                active ? "bg-text-primary" : "bg-text-muted/45 hover:bg-text-muted",
                            )}
                            style={{ width: active ? W_ACTIVE : W_IDLE }}
                        />
                    </button>
                );
            })}
        </div>
    );
}

/**
 * Discrete active turn from scroll position.
 * Hysteresis + center-band picking keeps the rail stable.
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
    const nodesCache = useRef<HTMLElement[]>([]);

    useEffect(() => {
        setActive((prev) => {
            const next = Math.min(prev, Math.max(0, turnCount - 1));
            activeRef.current = next;
            return next;
        });
        nodesCache.current = [];
    }, [turnCount]);

    useEffect(() => {
        const root = scrollRoot.current;
        if (!root || turnCount === 0) return;

        const nearTop = () => root.scrollTop < 48;
        const nearBottom = () =>
            root.scrollHeight - root.scrollTop - root.clientHeight < 96;

        const refreshNodes = () => {
            nodesCache.current = Array.from(
                root.querySelectorAll<HTMLElement>("[data-chat-turn]"),
            );
        };

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

            if (nodesCache.current.length !== turnCount) refreshNodes();
            const nodes = nodesCache.current;
            if (nodes.length === 0) {
                refreshNodes();
                if (nodesCache.current.length === 0) return;
            }

            const band = root.getBoundingClientRect().top + root.clientHeight * 0.42;
            let bestIdx = activeRef.current;
            let bestDist = Number.POSITIVE_INFINITY;

            for (const node of nodesCache.current) {
                const idx = Number(node.dataset.chatTurn);
                if (!Number.isFinite(idx)) continue;
                const dist = Math.abs(node.getBoundingClientRect().top - band);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestIdx = idx;
                }
            }

            if (bestIdx === activeRef.current) return;
            const currentNode = nodesCache.current.find(
                (n) => Number(n.dataset.chatTurn) === activeRef.current,
            );
            if (currentNode) {
                const curDist = Math.abs(currentNode.getBoundingClientRect().top - band);
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

        refreshNodes();
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
