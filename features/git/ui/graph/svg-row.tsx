import { GraphNode } from "@/lib/backend";
import {
    LANE_WIDTH,
    ROW_HEIGHT,
    DOT_RADIUS,
    MERGE_DOT_RADIUS,
    STROKE,
} from "./constants";

/** Smooth GitKraken-style cubic between two x positions across a vertical span. */
export function curvePath(x0: number, y0: number, x1: number, y1: number): string {
    if (Math.abs(x0 - x1) < 0.5) {
        return `M ${x0} ${y0} L ${x1} ${y1}`;
    }
    const midY = (y0 + y1) / 2;
    return `M ${x0} ${y0} C ${x0} ${midY}, ${x1} ${midY}, ${x1} ${y1}`;
}

export function GraphSvgRow({
    node,
    isFirst,
    isLast,
    avatarUrl,
    avatarKey,
}: {
    node: GraphNode;
    isFirst: boolean;
    isLast: boolean;
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
    const avatarSize = 14;
    const clipId = `avatar-clip-${avatarKey ?? `${node.lane}-${cx}`}`;

    return (
        <svg
            className="shrink-0 block relative z-0"
            style={{ width: w, height: h, minWidth: w }}
            viewBox={`0 0 ${w} ${h}`}
            shapeRendering="geometricPrecision"
        >
            {node.paths.filter((p) => p.type === "passthrough").map((p, i) => {
                const fromX = p.fromX * LANE_WIDTH + OX;
                const toX = p.toX * LANE_WIDTH + OX;
                return (
                    <path
                        key={`p-${i}`}
                        d={curvePath(fromX, 0, toX, h)}
                        stroke={p.color}
                        strokeWidth={STROKE}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                );
            })}

            {node.paths.filter((p) => p.type === "incoming").map((p, i) => {
                const fromX = p.fromX * LANE_WIDTH + OX;
                const toX = p.toX * LANE_WIDTH + OX;
                const y0 = !isFirst ? 0 : cy;
                return (
                    <path
                        key={`i-${i}`}
                        d={curvePath(fromX, y0, toX, cy)}
                        stroke={p.color}
                        strokeWidth={STROKE}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                );
            })}

            {node.paths.filter((p) => p.type === "outgoing").map((p, i) => {
                const fromX = p.fromX * LANE_WIDTH + OX;
                const toX = p.toX * LANE_WIDTH + OX;
                const y1 = !isLast ? h : cy;
                return (
                    <path
                        key={`o-${i}`}
                        d={curvePath(fromX, cy, toX, y1)}
                        stroke={p.color}
                        strokeWidth={STROKE}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                );
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
            ) : node.isMerge ? (
                <>
                    <circle cx={cx} cy={cy} r={MERGE_DOT_RADIUS} fill="none" stroke={node.color} strokeWidth={2} />
                    <circle cx={cx} cy={cy} r={2} fill={node.color} />
                </>
            ) : isFirst ? (
                <>
                    <circle cx={cx} cy={cy} r={DOT_RADIUS + 2.5} fill="none" stroke={node.color} strokeWidth={2} />
                    <circle cx={cx} cy={cy} r={DOT_RADIUS - 0.5} fill={node.color} />
                </>
            ) : (
                <circle cx={cx} cy={cy} r={DOT_RADIUS} fill={node.color} />
            )}
        </svg>
    );
}
