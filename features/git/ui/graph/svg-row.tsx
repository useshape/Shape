import { GraphNode } from "@/lib/backend";
import {
    LANE_WIDTH,
    ROW_HEIGHT,
    DOT_RADIUS,
    MERGE_DOT_RADIUS,
    STROKE,
    SHADOW_STROKE,
    SHADOW_OPACITY,
} from "./constants";

/**
 * Lane transition with a fixed corner radius.
 *
 * vscode-git-graph's `C x0,y0+0.8dy …` stretches the bend across the whole
 * horizontal span — fine for 1 lane, ugly when lanes are far apart.
 *
 * Instead: vertical → fixed-r quadratic corner → horizontal → corner → vertical.
 * Corner size stays ~CONSTANT so long hops don't get stretched entry/exit.
 */
export function curvePath(x0: number, y0: number, x1: number, y1: number): string {
    if (Math.abs(x0 - x1) < 0.5) {
        return `M ${x0} ${y0} L ${x1} ${y1}`;
    }

    const dx = x1 - x0;
    const dy = y1 - y0;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const sx = Math.sign(dx) || 1;
    const sy = Math.sign(dy) || 1;

    // Fixed visual radius (px), clamped so short hops still fit.
    const r = Math.min(6.5, absDx * 0.45, absDy * 0.45);
    if (r < 2) {
        // Tiny hop — simple vscode-style S
        const d = dy * 0.8;
        return `M ${x0} ${y0} C ${x0} ${y0 + d}, ${x1} ${y1 - d}, ${x1} ${y1}`;
    }

    const midY = (y0 + y1) / 2.5;

    // Vertical down/up to first corner, Q into horizontal, across, Q into vertical, finish.
    return [
        `M ${x0} ${y0}`,
        `L ${x0} ${midY - sy * r}`,
        `Q ${x0} ${midY} ${x0 + sx * r} ${midY}`,
        `L ${x1 - sx * r} ${midY}`,
        `Q ${x1} ${midY} ${x1} ${midY + sy * r}`,
        `L ${x1} ${y1}`,
    ].join(" ");
}

function GraphPath({
    d,
    color,
}: {
    d: string;
    color: string;
}) {
    return (
        <>
            <path
                d={d}
                className="graph-line-shadow"
                stroke="var(--graph-surface, var(--color-panel))"
                strokeWidth={SHADOW_STROKE}
                strokeOpacity={SHADOW_OPACITY}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d={d}
                className="graph-line"
                stroke={color}
                strokeWidth={STROKE}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </>
    );
}

export function GraphSvgRow({
    node,
    isFirst,
    isLast,
    isHead,
    muted,
    avatarUrl,
    avatarKey,
}: {
    node: GraphNode;
    isFirst: boolean;
    isLast: boolean;
    /** Checked-out commit — hollow ring like vscode-git-graph `.current`. */
    isHead?: boolean;
    muted?: boolean;
    avatarUrl?: string | null;
    /** Unique id fragment so clipPaths don't collide across rows. */
    avatarKey?: string;
}) {
    let rowMaxLane = node.lane;
    for (const p of node.paths) {
        if (p.fromX > rowMaxLane) rowMaxLane = p.fromX;
        if (p.toX > rowMaxLane) rowMaxLane = p.toX;
    }

    const w = (rowMaxLane + 1) * LANE_WIDTH + 10;
    const h = ROW_HEIGHT;
    const cy = h / 2;
    const OX = LANE_WIDTH / 2 + 4;
    const cx = node.lane * LANE_WIDTH + OX;
    const avatarSize = 16;
    const clipId = `avatar-clip-${avatarKey ?? `${node.lane}-${cx}`}`;

    return (
        <svg
            className="shrink-0 block relative z-0"
            style={{
                width: w,
                height: h,
                minWidth: w,
                opacity: muted ? 0.4 : 1,
            }}
            viewBox={`0 0 ${w} ${h}`}
            shapeRendering="geometricPrecision"
        >
            {node.paths.filter((p) => p.type === "passthrough").map((p, i) => {
                const fromX = p.fromX * LANE_WIDTH + OX;
                const toX = p.toX * LANE_WIDTH + OX;
                return <GraphPath key={`p-${i}`} d={curvePath(fromX, 0, toX, h)} color={p.color} />;
            })}

            {node.paths.filter((p) => p.type === "incoming").map((p, i) => {
                const fromX = p.fromX * LANE_WIDTH + OX;
                const toX = p.toX * LANE_WIDTH + OX;
                const y0 = !isFirst ? 0 : cy;
                return <GraphPath key={`i-${i}`} d={curvePath(fromX, y0, toX, cy)} color={p.color} />;
            })}

            {node.paths.filter((p) => p.type === "outgoing").map((p, i) => {
                const fromX = p.fromX * LANE_WIDTH + OX;
                const toX = p.toX * LANE_WIDTH + OX;
                const y1 = !isLast ? h : cy;
                return <GraphPath key={`o-${i}`} d={curvePath(fromX, cy, toX, y1)} color={p.color} />;
            })}

            {avatarUrl ? (
                <>
                    <defs>
                        <clipPath id={clipId}>
                            <circle cx={cx} cy={cy} r={avatarSize / 2} />
                        </clipPath>
                    </defs>
                    <circle cx={cx} cy={cy} r={avatarSize / 2 + 1.25} fill={node.color} />
                    <image
                        key={avatarUrl}
                        href={avatarUrl}
                        xlinkHref={avatarUrl}
                        x={cx - avatarSize / 2}
                        y={cy - avatarSize / 2}
                        width={avatarSize}
                        height={avatarSize}
                        clipPath={`url(#${clipId})`}
                        preserveAspectRatio="xMidYMid slice"
                    />
                </>
            ) : isHead ? (
                <>
                    {/* vscode-git-graph current: fill surface, coloured stroke */}
                    <circle
                        cx={cx}
                        cy={cy}
                        r={DOT_RADIUS + 1.5}
                        fill="var(--graph-surface, var(--color-panel))"
                        stroke={node.color}
                        strokeWidth={2}
                    />
                    <circle cx={cx} cy={cy} r={DOT_RADIUS - 1} fill={node.color} />
                </>
            ) : node.isMerge ? (
                <>
                    <circle
                        cx={cx}
                        cy={cy}
                        r={MERGE_DOT_RADIUS}
                        fill="var(--graph-surface, var(--color-panel))"
                        stroke={node.color}
                        strokeWidth={2}
                    />
                    <circle cx={cx} cy={cy} r={2} fill={node.color} />
                </>
            ) : (
                <>
                    {/* Soft surface halo so lines don't cut through the dot */}
                    <circle
                        cx={cx}
                        cy={cy}
                        r={DOT_RADIUS + 0.75}
                        fill="var(--graph-surface, var(--color-panel))"
                        stroke="var(--graph-surface, var(--color-panel))"
                        strokeWidth={1}
                        strokeOpacity={0.75}
                    />
                    <circle cx={cx} cy={cy} r={DOT_RADIUS} fill={node.color} />
                </>
            )}
        </svg>
    );
}
