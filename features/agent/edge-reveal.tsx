"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export const EDGE_REVEAL_MS = 420;

const BLUR_LAYERS = 6;
const BLUR_MAX = 28;

let fisheyeUrl: string | null = null;

function clampByte(n: number) {
    return Math.max(0, Math.min(255, Math.round(n)));
}

/** Displacement map: neutral on the left, fisheye bulge on the right edge. */
function fisheyeMap() {
    if (fisheyeUrl) return fisheyeUrl;
    const w = 128;
    const h = 128;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
        const yn = y / (h - 1);
        const fromCenter = yn - 0.5;
        for (let x = 0; x < w; x++) {
            const xn = x / (w - 1);
            const t = Math.min(1, Math.max(0, (xn - 0.46) / 0.54));
            const edge = t * t * (3 - 2 * t);
            const dx = edge * (1 - Math.min(1, Math.abs(fromCenter) * 2)) * 0.72;
            const dy = edge * fromCenter * 1.35;
            const i = (y * w + x) * 4;
            img.data[i] = clampByte(128 + dx * 127);
            img.data[i + 1] = clampByte(128 + dy * 127);
            img.data[i + 2] = 128;
            img.data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    fisheyeUrl = canvas.toDataURL();
    return fisheyeUrl;
}

function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Overlapping mask bands across the full panel. The left stays transparent so the blur has no box edge. */
function blurMask(index: number, count: number, origin = 0.32) {
    const span = 1 - origin;
    const segments = count + 1;
    const pct = (step: number) => {
        const x = origin + span * Math.min(1, Math.max(0, step / segments));
        return `${(x * 100).toFixed(2)}%`;
    };
    const fadeIn = pct(Math.max(0, index - 1));
    const solidStart = pct(index);
    const solidEnd = pct(index + 1);
    const fadeOut = pct(index + 2);
    if (index === count - 1) {
        return `linear-gradient(to right, transparent ${fadeIn}, #000 ${solidStart}, #000 100%)`;
    }
    return `linear-gradient(to right, transparent ${fadeIn}, #000 ${solidStart}, #000 ${solidEnd}, transparent ${fadeOut})`;
}

/**
 * Stacked backdrop blurs on a geometric ladder (about 0.9 → 28px). Each layer is
 * masked to a band that overlaps its neighbors, so the right edge ramps from
 * sharp to fully blurred instead of one flat blur.
 */
function ProgressiveBlur({
    id,
    max = BLUR_MAX,
    wash = 1,
    origin = 0.32,
}: {
    id: string;
    max?: number;
    wash?: number;
    origin?: number;
}) {
    return (
        <div
            id={id}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-40"
            style={{ ["--edge-reveal" as string]: 1 }}
        >
            {Array.from({ length: BLUR_LAYERS }, (_, index) => {
                const blurPx = max / 2 ** (BLUR_LAYERS - 1 - index);
                const mask = blurMask(index, BLUR_LAYERS, origin);
                return (
                    <div
                        key={index}
                        className="absolute inset-0"
                        style={{
                            backdropFilter: `blur(calc(var(--edge-reveal) * ${blurPx}px))`,
                            WebkitBackdropFilter: `blur(calc(var(--edge-reveal) * ${blurPx}px))`,
                            maskImage: mask,
                            WebkitMaskImage: mask,
                        }}
                    />
                );
            })}
            <div
                className="absolute inset-0"
                style={{
                    background: "linear-gradient(to right, transparent 55%, var(--sidebar) 100%)",
                    opacity: `calc(var(--edge-reveal) * ${wash})`,
                }}
            />
        </div>
    );
}

/**
 * Plays while `open` flips on. Left stays sharp. The right edge bends, and a
 * progressive blur ramps across it. Closing drops the effect and eases the width shut.
 */
export function useEdgeReveal<T extends HTMLElement>(
    open: boolean,
    id: string,
    options?: { strength?: number; origin?: number },
) {
    const strength = options?.strength ?? 1;
    const origin = options?.origin ?? 0.32;
    const bendRef = useRef<T>(null);
    const [prevOpen, setPrevOpen] = useState(open);
    const [opening, setOpening] = useState(false);
    const [present, setPresent] = useState(open);

    if (open !== prevOpen) {
        setPrevOpen(open);
        if (!open) setOpening(false);
        else if (!reducedMotion()) setOpening(true);
    }
    if (open && !present) setPresent(true);

    useEffect(() => {
        if (open) return;
        const timeout = window.setTimeout(() => setPresent(false), 460);
        return () => window.clearTimeout(timeout);
    }, [open]);

    useLayoutEffect(() => {
        if (!opening) return;
        const root = document.getElementById(`${id}-blur`);
        if (!root) return;
        const start = performance.now();
        let raf = 0;
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / EDGE_REVEAL_MS);
            const fade = (1 - t) * (1 - t);
            root.style.setProperty("--edge-reveal", fade.toFixed(3));
            if (t < 1) raf = requestAnimationFrame(tick);
            else setOpening(false);
        };
        root.style.setProperty("--edge-reveal", "1");
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [opening, id, strength]);

    const filter = (
        <svg className="pointer-events-none absolute size-0" aria-hidden>
            <filter id={id} x="-6%" y="-20%" width="118%" height="140%" colorInterpolationFilters="sRGB">
                <feImage id={`${id}-map`} result="map" preserveAspectRatio="none" x="0" y="0" width="100%" height="100%" />
                <feDisplacementMap id={`${id}-disp`} in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" />
            </filter>
        </svg>
    );

    const blur = opening ? (
        <ProgressiveBlur id={`${id}-blur`} max={BLUR_MAX * strength} wash={Math.min(1, strength)} origin={origin} />
    ) : null;

    return { bendRef: bendRef as RefObject<T>, opening, present, filter, blur };
}
