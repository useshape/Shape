"use client";

type Point = { label: string; value: number };

function pointsFrom(raw: string | undefined): { title: string; points: Point[] } {
    const text = (raw || "").trim();
    if (!text) return { title: "Chart", points: [] };
    try {
        const parsed = JSON.parse(text) as unknown;
        if (Array.isArray(parsed)) {
            return { title: "Chart", points: asPoints(parsed) };
        }
        if (parsed && typeof parsed === "object") {
            const row = parsed as { title?: string; points?: unknown };
            const list = Array.isArray(row.points) ? row.points : [];
            return { title: row.title?.trim() || "Chart", points: asPoints(list) };
        }
    } catch {
        /* plain text falls through */
    }
    return { title: "Chart", points: [] };
}

function asPoints(list: unknown[]): Point[] {
    return list
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as { label?: unknown; value?: unknown };
            const value = Number(row.value);
            if (!Number.isFinite(value)) return null;
            return { label: String(row.label ?? ""), value };
        })
        .filter((point): point is Point => !!point && point.label.length > 0)
        .slice(0, 8);
}

export function ChartBlock({ content }: { content?: string }) {
    const { title, points } = pointsFrom(content);
    if (points.length === 0) return null;
    const max = Math.max(...points.map((point) => point.value), 1);
    const width = 280;
    const height = 96;
    const gap = 8;
    const barWidth = (width - gap * (points.length - 1)) / points.length;
    return (
        <figure className="my-2 w-full max-w-sm rounded-xl border border-border bg-surface-2 px-3 py-2">
            <figcaption className="mb-2 text-xs font-medium text-text-secondary">{title}</figcaption>
            <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" role="img" aria-label={title}>
                {points.map((point, index) => {
                    const bar = Math.max(4, (point.value / max) * (height - 18));
                    const x = index * (barWidth + gap);
                    return (
                        <g key={`${point.label}-${index}`}>
                            <rect
                                x={x}
                                y={height - 16 - bar}
                                width={barWidth}
                                height={bar}
                                rx={4}
                                className="fill-text-primary"
                                opacity={0.85}
                            />
                            <text
                                x={x + barWidth / 2}
                                y={height - 4}
                                textAnchor="middle"
                                className="fill-text-muted"
                                fontSize="10"
                            >
                                {point.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </figure>
    );
}

export function InsightCard({ content }: { content?: string }) {
    const text = (content || "").trim();
    if (!text) return null;
    return (
        <aside className="my-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary">
            {text}
        </aside>
    );
}
