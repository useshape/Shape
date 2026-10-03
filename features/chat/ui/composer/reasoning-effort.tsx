"use client";

import React, { useCallback, useId, useRef } from "react";
import s from "./reasoning-effort.module.css";

export type ReasoningEffort = "low" | "high" | "ultra" | "max";

const STOPS: { value: ReasoningEffort; label: string }[] = [
    { value: "low", label: "Low" },
    { value: "high", label: "Medium" },
    { value: "ultra", label: "High" },
    { value: "max", label: "Extra High" },
];

function indexOf(value: ReasoningEffort): number {
    const i = STOPS.findIndex((x) => x.value === value);
    return i < 0 ? 0 : i;
}

export function ReasoningEffortSlider({
    modelName,
    value,
    onCommit,
}: {
    modelName: string;
    value: ReasoningEffort;
    onCommit: (next: ReasoningEffort) => void;
}) {
    const id = useId();
    const idx = indexOf(value);
    const trackRef = useRef<HTMLDivElement>(null);
    const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const commitFromClientX = useCallback(
        (clientX: number) => {
            const el = trackRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            const next = STOPS[Math.round(t * (STOPS.length - 1))];
            if (next) onCommit(next.value);
        },
        [onCommit],
    );

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onCommit(STOPS[Math.min(STOPS.length - 1, idx + 1)]!.value);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onCommit(STOPS[Math.max(0, idx - 1)]!.value);
        } else if (e.key === "Home") {
            e.preventDefault();
            onCommit(STOPS[0]!.value);
        } else if (e.key === "End") {
            e.preventDefault();
            onCommit(STOPS[STOPS.length - 1]!.value);
        }
    };

    const pct = idx / (STOPS.length - 1);

    return (
        <div
            className={s.root}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <p className={s.caption}>
                {modelName} thinking
            </p>
            <div
                ref={trackRef}
                className={s.track}
                role="slider"
                tabIndex={0}
                aria-valuemin={0}
                aria-valuemax={STOPS.length - 1}
                aria-valuenow={idx}
                aria-valuetext={STOPS[idx]?.label}
                aria-labelledby={id}
                onKeyDown={onKeyDown}
                onPointerDown={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    commitFromClientX(e.clientX);
                }}
                onPointerMove={(e) => {
                    if (e.buttons !== 1) return;
                    commitFromClientX(e.clientX);
                }}
            >
                <div
                    className={s.fill}
                    style={{
                        width: `${pct * 100}%`,
                        transition: reduced ? "none" : undefined,
                    }}
                />
                <div
                    className={s.thumb}
                    style={{
                        left: `${pct * 100}%`,
                        transition: reduced ? "none" : undefined,
                    }}
                />
                {STOPS.map((stop, i) => (
                    <button
                        key={stop.value}
                        type="button"
                        className={s.stop}
                        style={{ left: `${(i / (STOPS.length - 1)) * 100}%` }}
                        aria-label={stop.label}
                        onClick={() => onCommit(stop.value)}
                    />
                ))}
            </div>
            <div className={s.labels} id={id}>
                {STOPS.map((stop) => (
                    <span key={stop.value} data-active={stop.value === value ? "true" : "false"}>
                        {stop.label}
                    </span>
                ))}
            </div>
        </div>
    );
}

export function effortDisplayLabel(id: ReasoningEffort): string {
    return STOPS.find((o) => o.value === id)?.label ?? "Low";
}
