import type { DesignLayerNode } from "./types";

export function findLayerPath(nodes: DesignLayerNode[], id: string, path: string[] = []): string[] | null {
    for (const node of nodes) {
        const next = [...path, node.id];
        if (node.id === id) return next;
        const child = findLayerPath(node.children, id, next);
        if (child) return child;
    }
    return null;
}

export function flattenLayers(
    nodes: DesignLayerNode[],
    expanded: Set<string>,
    opts?: { query?: string; visibleOnly?: boolean; interactiveOnly?: boolean },
): DesignLayerNode[] {
    const out: DesignLayerNode[] = [];
    const q = (opts?.query || "").trim().toLowerCase();
    const walk = (list: DesignLayerNode[], ancestorsOpen: boolean) => {
        for (const node of list) {
            if (opts?.visibleOnly && node.hidden) continue;
            if (opts?.interactiveOnly && !node.interactive) {
                if (expanded.has(node.id)) walk(node.children, true);
                continue;
            }
            const match = !q || node.label.toLowerCase().includes(q) || node.tag.toLowerCase().includes(q);
            if (ancestorsOpen && match) out.push(node);
            const open = !q || expanded.has(node.id) || match;
            if (open) walk(node.children, ancestorsOpen && (expanded.has(node.id) || !!q));
        }
    };
    walk(nodes, true);
    return out;
}
