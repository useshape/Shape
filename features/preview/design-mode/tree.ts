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
