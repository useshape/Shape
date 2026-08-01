export const NODE_W = 200;
export const NODE_H = 56;
export const DOT = 14;
export const PILL_W = 96;
export const PILL_H = 22;
export const VIEW_PAD = 100;

export type Lod = "dot" | "pill" | "card";

export function lodForZoom(zoom: number): Lod {
    if (zoom < 0.42) return "dot";
    if (zoom < 0.72) return "pill";
    return "card";
}

export const LANE_COLORS = [
    "var(--color-accent)",
    "#3b82f6",
    "#a855f7",
    "#ec4899",
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#14b8a6",
    "#06b6d4",
];

export function colorFor(name: string, isCurrent: boolean): string {
    if (isCurrent) return LANE_COLORS[0];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return LANE_COLORS[(h % (LANE_COLORS.length - 1)) + 1];
}

export function shortLabel(name: string): string {
    return name.replace(/^origin\//, "").replace(/^HEAD@/, "");
}

export function nodeSize(lod: Lod): { w: number; h: number } {
    if (lod === "dot") return { w: DOT, h: DOT };
    if (lod === "pill") return { w: PILL_W, h: PILL_H };
    return { w: NODE_W, h: NODE_H };
}

export function anchor(
    node: { x: number; y: number },
    lod: Lod,
    side: "left" | "right" | "center",
): { x: number; y: number } {
    const { w, h } = nodeSize(lod);
    if (side === "left") return { x: node.x, y: node.y + h / 2 };
    if (side === "right") return { x: node.x + w, y: node.y + h / 2 };
    return { x: node.x + w / 2, y: node.y + h / 2 };
}

export function edgePath(
    from: { x: number; y: number },
    to: { x: number; y: number },
    lod: Lod,
): string {
    const a = anchor(from, lod, "right");
    const b = anchor(to, lod, "left");
    const dx = Math.max(40, (b.x - a.x) * 0.45);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export function inView(
    node: { x: number; y: number },
    lod: Lod,
    pan: { x: number; y: number },
    zoom: number,
    vw: number,
    vh: number,
): boolean {
    if (vw <= 0 || vh <= 0) return true;
    const { w, h } = nodeSize(lod);
    const left = (-pan.x - VIEW_PAD) / zoom;
    const top = (-pan.y - VIEW_PAD) / zoom;
    const right = (vw - pan.x + VIEW_PAD) / zoom;
    const bottom = (vh - pan.y + VIEW_PAD) / zoom;
    return node.x + w >= left && node.x <= right && node.y + h >= top && node.y <= bottom;
}

export function fitGraph(
    bounds: { width: number; height: number },
    vw: number,
    vh: number,
): { pan: { x: number; y: number }; zoom: number } {
    if (vw <= 0 || vh <= 0) return { pan: { x: 24, y: 24 }, zoom: 1 };
    const pad = 28;
    const zoom = Math.min(
        1.15,
        Math.max(0.2, Math.min((vw - pad * 2) / Math.max(bounds.width, 1), (vh - pad * 2) / Math.max(bounds.height, 1))),
    );
    return {
        pan: {
            x: pad + (vw - pad * 2 - bounds.width * zoom) / 2,
            y: pad + (vh - pad * 2 - bounds.height * zoom) / 2,
        },
        zoom,
    };
}

export type Pos = { x: number; y: number };
