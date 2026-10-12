"use client";

import { useEffect, useState } from "react";
import { ChevronDown20Regular } from "@fluentui/react-icons/headless/svg/chevron-down";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
    effortDisplayLabel,
    effortsForModel,
    type ReasoningEffort,
} from "./reasoning-effort";
import styles from "./thinking-bar.module.css";

function clamp(n: number, max: number) {
    return Math.max(0, Math.min(max, n));
}

/** Blue until High. Particles fade in at High. Rainbow finishes only at Super. */
function barLook(pos: number, options: { value: ReasoningEffort }[]) {
    const high = options.findIndex((stop) => stop.value === "ultra");
    const extra = options.findIndex((stop) => stop.value === "max");
    const superIdx = options.findIndex((stop) => stop.value === "super");
    const last = Math.max(0, options.length - 1);

    let particles = 0;
    if (high >= 0) {
        const particleEnd = superIdx >= 0 ? superIdx : last;
        if (pos <= high - 1) particles = 0;
        else if (pos < high) particles = (pos - (high - 1)) * 0.28;
        else particles = 0.28 + ((pos - high) / Math.max(1, particleEnd - high)) * 0.72;
    }

    let rainbow = 0;
    if (superIdx > 0) {
        const start = extra >= 0 ? extra : superIdx - 1;
        if (pos <= start) rainbow = 0;
        else rainbow = (pos - start) / Math.max(0.001, superIdx - start);
    }

    return {
        particles: clamp(particles, 1),
        rainbow: clamp(rainbow, 1),
    };
}

export function ThinkingEffortControl({
    effort,
    modelId,
    onChange,
    disabled,
}: {
    effort: ReasoningEffort;
    modelId: string;
    onChange: (effort: ReasoningEffort) => void;
    disabled?: boolean;
}) {
    const options = effortsForModel(modelId);
    const selected = options.some((stop) => stop.value === effort) ? effort : options[options.length - 1]!.value;
    const index = Math.max(0, options.findIndex((stop) => stop.value === selected));
    const maxIndex = Math.max(0, options.length - 1);
    const [dragPos, setDragPos] = useState<number | null>(null);
    const pos = dragPos ?? index;
    const fill = maxIndex === 0 ? 100 : (pos / maxIndex) * 100;
    const look = barLook(pos, options);
    const shown = options[clamp(Math.round(pos), maxIndex)] ?? options[index]!;
    const motion = dragPos == null ? "180ms cubic-bezier(0.22, 1, 0.36, 1)" : "0s";

    useEffect(() => {
        setDragPos(null);
    }, [index]);

    const settle = (raw: number) => {
        const n = clamp(raw, maxIndex);
        const nearest = Math.round(n);
        return Math.abs(n - nearest) <= 0.2 ? nearest : n;
    };

    const commit = (raw: number) => {
        const snapped = clamp(Math.round(raw), maxIndex);
        setDragPos(snapped);
        const next = options[snapped];
        if (next && next.value !== selected) onChange(next.value);
        else setDragPos(null);
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="xs"
                    disabled={disabled}
                    className="h-8 pl-0 font-normal text-text-muted hover:text-text-primary hover:bg-transparent"
                    aria-label={`Thinking ${effortDisplayLabel(selected)}`}
                >
                    <span className="text-sm">{effortDisplayLabel(selected)}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-66"
                onCloseAutoFocus={(event) => event.preventDefault()}
            >
                <div
                    className="flex flex-col gap-3 px-2.5 pb-5 pt-1"
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <div className="flex h-5 items-center justify-center overflow-hidden">
                        <span
                            key={shown.value}
                            className="text-sm text-text-primary"
                            style={{ animation: "t-swap-in 180ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
                        >
                            {effortDisplayLabel(shown.value)}
                        </span>
                    </div>
                    <div className="relative h-[35px]">
                        <div className="absolute inset-x-[1.5px] top-1/2 h-[35px] -translate-y-1/2 overflow-hidden rounded-full bg-panel-hover">
                            <div
                                className="relative h-full overflow-hidden"
                                style={{ width: `${fill}%`, transition: `width ${motion}` }}
                            >
                                <div className="absolute inset-0 bg-accent" />
                                <div
                                    className={`absolute inset-0 ${styles.rainbow}`}
                                    style={{ opacity: look.rainbow, transition: `opacity ${motion}` }}
                                />
                                <div
                                    className="pointer-events-none absolute inset-0"
                                    style={{ opacity: look.particles, transition: `opacity ${motion}` }}
                                >
                                    <span className={styles.particle} />
                                    <span className={`${styles.particle} ${styles.particleB}`} />
                                    <span className={`${styles.particle} ${styles.particleC}`} />
                                </div>
                            </div>
                        </div>
                        {options.length > 1 ? (
                            <div className="pointer-events-none absolute inset-x-[20.5px] top-1/2 h-[15px] -translate-y-1/2">
                                {options.map((stop, i) => (
                                    <span
                                        key={stop.value}
                                        className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/65"
                                        style={{ left: `${(i / maxIndex) * 100}%` }}
                                    />
                                ))}
                            </div>
                        ) : null}
                        <input
                            type="range"
                            min={0}
                            max={maxIndex}
                            step={0.001}
                            value={pos}
                            disabled={disabled || options.length <= 1}
                            aria-label="Thinking level"
                            aria-valuetext={effortDisplayLabel(shown.value)}
                            onChange={(event) => setDragPos(settle(Number(event.target.value)))}
                            onPointerUp={(event) => commit(Number(event.currentTarget.value))}
                            onKeyUp={(event) => {
                                if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
                                    commit(Number(event.currentTarget.value));
                                }
                            }}
                            onBlur={(event) => commit(Number(event.currentTarget.value))}
                            className={`${styles.range} absolute inset-x-0 top-1/2 w-full -translate-x-0.5 -translate-y-1/2 cursor-pointer`}
                        />
                    </div>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
