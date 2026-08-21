"use client";

/* Pixel-grid loader for long-running chat work (Drive / Dots / Orbit). */

const chevron = Array.from({ length: 9 }, (_, i) => {
    const r = Math.floor(i / 3);
    const c = i % 3;
    return (c + Math.abs(r - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
    const k = ORBIT_ORDER.indexOf(i);
    return k === -1 ? null : k * 110;
});

const PATTERNS: Record<string, { delays: (number | null)[]; dur: number; round: boolean }> = {
    Drive: { delays: chevron, dur: 650, round: false },
    Dots: { delays: chevron, dur: 650, round: true },
    Orbit: { delays: orbit, dur: 950, round: false },
};

export function LoadingState({
    label = "Working",
    variant = "Drive",
}: {
    label?: string | null;
    variant?: "Drive" | "Dots" | "Orbit" | string;
}) {
    return (
        <div className="flex w-fit items-center gap-2.5">
            <ThinkingPixels variant={variant} />
            {label ? (
                <span className="ai-shimmer-text text-sm font-medium tracking-tight whitespace-nowrap">
                    {label}
                </span>
            ) : null}
        </div>
    );
}

/** 3×3 pixel grid used for AI thinking. */
export function ThinkingPixels({
    variant = "Drive",
    active = true,
    size = 4,
}: {
    variant?: "Drive" | "Dots" | "Orbit" | string;
    active?: boolean;
    size?: number;
}) {
    const { delays, dur, round } = PATTERNS[variant] ?? PATTERNS.Drive;
    return (
        <span
            aria-hidden
            className="grid shrink-0"
            style={{
                gridTemplateColumns: `repeat(3, ${size}px)`,
                gap: Math.max(1, size * 0.35),
            }}
        >
            {delays.map((d, i) => (
                <span
                    key={i}
                    className={`bg-text-primary ${round ? "rounded-full" : "rounded-[1px]"}`}
                    style={{
                        width: size,
                        height: size,
                        opacity: d === null ? 0.07 : active ? 0.15 : 0.28,
                        animation:
                            active && d !== null
                                ? `pixel-on ${dur}ms ease-in-out ${d}ms infinite`
                                : "none",
                    }}
                />
            ))}
        </span>
    );
}
