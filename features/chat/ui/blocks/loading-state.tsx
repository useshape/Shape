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
    label?: string;
    variant?: "Drive" | "Dots" | "Orbit" | string;
}) {
    const { delays, dur, round } = PATTERNS[variant] ?? PATTERNS.Drive;

    return (
        <div className="flex w-fit items-center gap-2.5">
            <span aria-hidden className="grid grid-cols-[repeat(3,4px)] gap-[1.5px]">
                {delays.map((d, i) => (
                    <span
                        key={i}
                        className={`size-[4px] bg-text-primary ${round ? "rounded-full" : "rounded-[1px]"}`}
                        style={{
                            opacity: d === null ? 0.07 : 0.15,
                            animation:
                                d === null
                                    ? "none"
                                    : `pixel-on ${dur}ms ease-in-out ${d}ms infinite`,
                        }}
                    />
                ))}
            </span>
            <span className="ai-shimmer-text text-sm font-medium tracking-tight whitespace-nowrap">
                {label}
            </span>
        </div>
    );
}
