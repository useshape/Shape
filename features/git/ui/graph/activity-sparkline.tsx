import React from "react";

/**
 * Full-history activity minimap (GitLens/GitKraken style).
 * Spans first→last commit, light smoothing, edge bleed, hover readout above the chart.
 */
export function CommitActivitySparkline({
    buckets,
    firstTs,
    lastTs,
    onJump,
}: {
    buckets: number[];
    firstTs: number;
    lastTs: number;
    onJump: (bucketIndex: number) => void;
}) {
    const [hover, setHover] = React.useState<{
        idx: number;
        xPct: number;
        count: number;
        label: string;
    } | null>(null);

    const smooth = React.useMemo(() => {
        if (buckets.length === 0) return [];
        // Single light pass — keeps peaks readable instead of over-rounding.
        const out = buckets.slice();
        const next = out.slice();
        for (let i = 0; i < out.length; i++) {
            const a = out[Math.max(0, i - 1)] ?? 0;
            const b = out[i] ?? 0;
            const c = out[Math.min(out.length - 1, i + 1)] ?? 0;
            next[i] = (a + b * 3 + c) / 5;
        }
        return next;
    }, [buckets]);

    const max = Math.max(1, ...smooth);
    // Bleed past the view so the line isn't clipped to a hard inset.
    const w = 100;
    const h = 36;
    const padY = 4;
    const bleed = 2.5;
    const innerH = h - padY * 2;
    const span = Math.max(1, smooth.length - 1);
    const pts = smooth.map((v, i) => {
        const x = -bleed + (i / span) * (w + bleed * 2);
        const y = padY + innerH - (v / max) * innerH;
        return { x, y };
    });

    let pathD = "";
    if (pts.length === 1) {
        pathD = `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 0.01} ${pts[0].y}`;
    } else if (pts.length > 1) {
        pathD = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const p0 = pts[i - 1];
            const p1 = pts[i];
            const mx = (p0.x + p1.x) / 2;
            pathD += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
        }
    }

    const areaD = pts.length
        ? `${pathD} L ${pts[pts.length - 1].x} ${h - padY} L ${pts[0].x} ${h - padY} Z`
        : "";

    const formatLabel = (ts: number) => {
        if (!ts) return "—";
        return new Date(ts * 1000).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    };

    const bucketAt = (clientX: number, rect: DOMRect) => {
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
        return Math.round(ratio * span);
    };

    const tipLeft = hover ? Math.min(92, Math.max(8, hover.xPct)) : 50;

    return (
        <div className="relative w-full overflow-visible">
            {hover ? (
                <div
                    className="pointer-events-none absolute bottom-full z-20 mb-1 -translate-x-1/2 rounded-md border border-border-subtle bg-surface-3 px-1.5 py-0.5 text-[10px] text-text-primary shadow-sm whitespace-nowrap"
                    style={{ left: `${tipLeft}%` }}
                >
                    {hover.label} · {hover.count} commit{hover.count === 1 ? "" : "s"}
                </div>
            ) : null}
            <div className="relative h-9 w-full overflow-hidden rounded-md border border-border-subtle bg-panel/30">
                <svg
                    viewBox={`0 0 ${w} ${h}`}
                    className="absolute inset-0 h-full w-full cursor-crosshair"
                    preserveAspectRatio="none"
                    shapeRendering="geometricPrecision"
                    onMouseLeave={() => setHover(null)}
                    onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const idx = bucketAt(e.clientX, rect);
                        const count = Math.round(buckets[idx] ?? 0);
                        const t =
                            firstTs && lastTs && span > 0
                                ? firstTs + ((lastTs - firstTs) * idx) / span
                                : lastTs;
                        setHover({
                            idx,
                            xPct: (idx / span) * 100,
                            count,
                            label: formatLabel(t),
                        });
                    }}
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        onJump(bucketAt(e.clientX, rect));
                    }}
                >
                    {areaD ? (
                        <path
                            d={areaD}
                            fill="color-mix(in srgb, var(--color-accent) 12%, transparent)"
                        />
                    ) : null}
                    {pathD ? (
                        <path
                            d={pathD}
                            fill="none"
                            stroke="var(--color-accent)"
                            strokeWidth={1.1}
                            strokeLinejoin="miter"
                            strokeLinecap="butt"
                            vectorEffect="non-scaling-stroke"
                        />
                    ) : null}
                    {hover ? (
                        <line
                            x1={-bleed + (hover.idx / span) * (w + bleed * 2)}
                            x2={-bleed + (hover.idx / span) * (w + bleed * 2)}
                            y1={2}
                            y2={h - 2}
                            stroke="var(--color-text-muted)"
                            strokeWidth={0.6}
                            strokeDasharray="2 2"
                            vectorEffect="non-scaling-stroke"
                            opacity={0.85}
                        />
                    ) : null}
                </svg>
            </div>
        </div>
    );
}
