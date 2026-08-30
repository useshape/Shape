"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";

const MAX_TICKS = 8;

/**
 * Grok-style vertical history stepper — chevrons + widening ticks.
 * Active tick is widest / brightest; neighboring ticks taper shorter.
 */
export function ChatHistoryStepper({
    turnCount,
    activeIndex,
    onSelect,
    className,
}: {
    turnCount: number;
    activeIndex: number;
    onSelect: (index: number) => void;
    className?: string;
}) {
    const ticks = useMemo(() => {
        if (turnCount <= MAX_TICKS) {
            return Array.from({ length: turnCount }, (_, i) => i);
        }
        const half = Math.floor(MAX_TICKS / 2);
        let start = Math.max(0, activeIndex - half);
        if (start + MAX_TICKS > turnCount) start = turnCount - MAX_TICKS;
        return Array.from({ length: MAX_TICKS }, (_, i) => start + i);
    }, [turnCount, activeIndex]);

    const canUp = activeIndex > 0;
    const canDown = activeIndex < turnCount - 1;

    if (turnCount < 2) return null;

    return (
        <div
            className={cn("flex flex-col items-center gap-1.5 select-none", className)}
            role="navigation"
            aria-label="Chat history"
        >
            <Tooltip content="Previous turn" side="left" delayDuration={120}>
                <button
                    type="button"
                    aria-label="Previous turn"
                    disabled={!canUp}
                    onClick={() => canUp && onSelect(activeIndex - 1)}
                    className={cn(
                        "flex size-6 items-center justify-center rounded-md text-text-muted transition-colors",
                        canUp ? "hover:bg-panel-hover hover:text-text-primary" : "opacity-30",
                    )}
                >
                    <Icon name="expand_less" size={14} />
                </button>
            </Tooltip>

            <div className="flex flex-col items-center gap-1.5 py-0.5">
                {ticks.map((turnIdx, i) => {
                    const active = turnIdx === activeIndex;
                    // Short at top → wide at bottom (Grok), active always brightest.
                    const t = ticks.length <= 1 ? 1 : i / (ticks.length - 1);
                    const width = active ? 14 : 4 + t * 8;
                    return (
                        <Tooltip
                            key={turnIdx}
                            content={`Turn ${turnIdx + 1}`}
                            side="left"
                            delayDuration={120}
                        >
                            <button
                                type="button"
                                aria-label={`Go to turn ${turnIdx + 1}`}
                                aria-current={active ? "true" : undefined}
                                onClick={() => onSelect(turnIdx)}
                                className="flex h-2.5 w-4 items-center justify-center"
                            >
                                <span
                                    className={cn(
                                        "block h-[2px] rounded-full transition-all duration-200 ease-[var(--ease-out)]",
                                        active
                                            ? "bg-text-primary"
                                            : "bg-text-muted/45 hover:bg-text-muted",
                                    )}
                                    style={{ width }}
                                />
                            </button>
                        </Tooltip>
                    );
                })}
            </div>

            <Tooltip content="Next turn" side="left" delayDuration={120}>
                <button
                    type="button"
                    aria-label="Next turn"
                    disabled={!canDown}
                    onClick={() => canDown && onSelect(activeIndex + 1)}
                    className={cn(
                        "flex size-6 items-center justify-center rounded-md text-text-muted transition-colors",
                        canDown ? "hover:bg-panel-hover hover:text-text-primary" : "opacity-30",
                    )}
                >
                    <Icon name="expand_more" size={14} />
                </button>
            </Tooltip>
        </div>
    );
}

/** Track which turn is most visible in the scroll container. */
export function useChatTurnActive(
    scrollRoot: React.RefObject<HTMLElement | null>,
    turnCount: number,
): [number, (index: number) => void] {
    const [active, setActive] = useState(0);

    useEffect(() => {
        setActive((prev) => Math.min(prev, Math.max(0, turnCount - 1)));
    }, [turnCount]);

    useEffect(() => {
        const root = scrollRoot.current;
        if (!root || turnCount === 0) return;

        const nodes = root.querySelectorAll<HTMLElement>("[data-chat-turn]");
        if (nodes.length === 0) return;

        const ratios = new Map<number, number>();

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const idx = Number((entry.target as HTMLElement).dataset.chatTurn);
                    if (!Number.isFinite(idx)) continue;
                    ratios.set(idx, entry.isIntersecting ? entry.intersectionRatio : 0);
                }
                let best = 0;
                let bestRatio = -1;
                for (const [idx, ratio] of ratios) {
                    if (ratio > bestRatio) {
                        bestRatio = ratio;
                        best = idx;
                    }
                }
                if (bestRatio > 0) setActive(best);
            },
            {
                root,
                threshold: [0, 0.15, 0.35, 0.55, 0.75, 1],
                rootMargin: "-20% 0px -35% 0px",
            },
        );

        nodes.forEach((n) => observer.observe(n));
        return () => observer.disconnect();
    }, [scrollRoot, turnCount]);

    const select = useCallback(
        (index: number) => {
            const root = scrollRoot.current;
            if (!root) return;
            const clamped = Math.max(0, Math.min(turnCount - 1, index));
            const el = root.querySelector<HTMLElement>(`[data-chat-turn="${clamped}"]`);
            if (!el) return;
            setActive(clamped);
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        },
        [scrollRoot, turnCount],
    );

    return [active, select];
}
