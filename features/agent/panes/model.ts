export type PaneKind = "chat" | "graph" | "prs" | "terminal";

export type PaneTab = {
    id: string;
    kind: PaneKind;
    title: string;
};

export type PaneLeaf = {
    type: "leaf";
    id: string;
    tabs: PaneTab[];
    active: string;
};

export type PaneSplit = {
    type: "split";
    id: string;
    /** row = side by side, col = stacked. A split can hold more than two panes. */
    dir: "row" | "col";
    weights: number[];
    children: PaneNode[];
};

export type PaneNode = PaneLeaf | PaneSplit;

const TITLES: Record<PaneKind, string> = {
    chat: "Chat",
    graph: "Graph",
    prs: "Pull requests",
    terminal: "Terminal",
};

export function paneId(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeTab(kind: PaneKind): PaneTab {
    return { id: paneId(kind), kind, title: TITLES[kind] };
}

export function chatRoot(): PaneLeaf {
    const tab = makeTab("chat");
    return { type: "leaf", id: paneId("pane"), tabs: [tab], active: tab.id };
}

export function firstLeaf(node: PaneNode): PaneLeaf {
    if (node.type === "leaf") return node;
    return firstLeaf(node.children[0] ?? chatRoot());
}

export function findLeaf(node: PaneNode, id: string): PaneLeaf | null {
    if (node.type === "leaf") return node.id === id ? node : null;
    for (const child of node.children) {
        const hit = findLeaf(child, id);
        if (hit) return hit;
    }
    return null;
}

export function findKind(node: PaneNode, kind: PaneKind): { leafId: string; tabId: string } | null {
    if (node.type === "leaf") {
        const tab = node.tabs.find((item) => item.kind === kind);
        return tab ? { leafId: node.id, tabId: tab.id } : null;
    }
    for (const child of node.children) {
        const hit = findKind(child, kind);
        if (hit) return hit;
    }
    return null;
}

function mapLeaves(node: PaneNode, id: string, fn: (leaf: PaneLeaf) => PaneNode): PaneNode {
    if (node.type === "leaf") return node.id === id ? fn(node) : node;
    let changed = false;
    const children = node.children.map((child) => {
        const next = mapLeaves(child, id, fn);
        if (next !== child) changed = true;
        return next;
    });
    return changed ? { ...node, children } : node;
}

export function activateTab(node: PaneNode, leafId: string, tabId: string): PaneNode {
    return mapLeaves(node, leafId, (leaf) => (leaf.active === tabId ? leaf : { ...leaf, active: tabId }));
}

/** One of each view. Focusing an open view jumps to the pane that already has it. */
export function openKind(node: PaneNode, leafId: string, kind: PaneKind): PaneNode {
    const existing = findKind(node, kind);
    if (existing) return activateTab(node, existing.leafId, existing.tabId);
    const leaf = findLeaf(node, leafId) ?? firstLeaf(node);
    const tab = makeTab(kind);
    return mapLeaves(node, leaf.id, (current) => ({
        ...current,
        tabs: [...current.tabs, tab],
        active: tab.id,
    }));
}

export function closeTab(node: PaneNode, leafId: string, tabId: string): PaneNode {
    return mapLeaves(node, leafId, (leaf) => {
        const tabs = leaf.tabs.filter((tab) => tab.id !== tabId);
        if (tabs.length === leaf.tabs.length) return leaf;
        const active = leaf.active === tabId ? (tabs[tabs.length - 1]?.id ?? "") : leaf.active;
        return { ...leaf, tabs, active };
    });
}

export function closeOtherTabs(node: PaneNode, leafId: string, tabId: string): PaneNode {
    return mapLeaves(node, leafId, (leaf) => {
        const tabs = leaf.tabs.filter((tab) => tab.id === tabId);
        return tabs.length === leaf.tabs.length ? leaf : { ...leaf, tabs, active: tabId };
    });
}

export function closeTabsToRight(node: PaneNode, leafId: string, tabId: string): PaneNode {
    return mapLeaves(node, leafId, (leaf) => {
        const index = leaf.tabs.findIndex((tab) => tab.id === tabId);
        if (index < 0 || index === leaf.tabs.length - 1) return leaf;
        const tabs = leaf.tabs.slice(0, index + 1);
        const active = tabs.some((tab) => tab.id === leaf.active) ? leaf.active : tabId;
        return { ...leaf, tabs, active };
    });
}

/** Drag a tab onto an edge. One tab stays and gains a neighbor; extra tabs move into the new tile. */
export function tileTab(
    node: PaneNode,
    fromLeafId: string,
    tabId: string,
    targetLeafId: string,
    dir: "row" | "col",
    place: "before" | "after",
): PaneNode {
    const from = findLeaf(node, fromLeafId);
    const tab = from?.tabs.find((item) => item.id === tabId);
    if (!from || !tab) return splitLeaf(node, targetLeafId, dir, place);
    if (from.tabs.length <= 1 && fromLeafId === targetLeafId) {
        return splitLeaf(node, targetLeafId, dir, place);
    }
    const inserted: PaneLeaf = { type: "leaf", id: paneId("pane"), tabs: [tab], active: tab.id };
    return splitLeaf(closeTab(node, fromLeafId, tabId), targetLeafId, dir, place, inserted);
}

export function closeKind(node: PaneNode, kind: PaneKind): PaneNode {
    const hit = findKind(node, kind);
    if (!hit) return node;
    return closeTab(node, hit.leafId, hit.tabId);
}

function normalize(weights: number[]) {
    const sum = weights.reduce((total, weight) => total + weight, 0) || 1;
    return weights.map((weight) => weight / sum);
}

function containsLeaf(node: PaneNode, leafId: string): boolean {
    return findLeaf(node, leafId) != null;
}

function collectLeaves(node: PaneNode): PaneLeaf[] {
    if (node.type === "leaf") return [node];
    return node.children.flatMap(collectLeaves);
}

/**
 * Opera/Vivaldi grid: two columns, as many rows as needed.
 * A single pane becomes a 2×2, which is Opera's grid preset (up to four).
 */
export function tileToGrid(node: PaneNode): PaneNode {
    const cells = collectLeaves(node);
    if (cells.length === 1) {
        cells.push(
            { type: "leaf", id: paneId("pane"), tabs: [], active: "" },
            { type: "leaf", id: paneId("pane"), tabs: [], active: "" },
            { type: "leaf", id: paneId("pane"), tabs: [], active: "" },
        );
    }
    const rows: PaneNode[] = [];
    for (let index = 0; index < cells.length; index += 2) {
        const pair = cells.slice(index, index + 2);
        rows.push(
            pair.length === 1
                ? pair[0]!
                : {
                    type: "split",
                    id: paneId("split"),
                    dir: "row",
                    weights: [1, 1],
                    children: pair,
                },
        );
    }
    if (rows.length === 1) return rows[0]!;
    return {
        type: "split",
        id: paneId("split"),
        dir: "col",
        weights: rows.map(() => 1),
        children: rows,
    };
}

/** Split a pane. Same-direction parents gain another sibling, so a row can hold 3+ panes. */
export function splitLeaf(
    node: PaneNode,
    leafId: string,
    dir: "row" | "col",
    place: "before" | "after" = "after",
    insert?: PaneLeaf,
): PaneNode {
    const fresh = (): PaneLeaf => insert ?? { type: "leaf", id: paneId("pane"), tabs: [], active: "" };

    if (node.type === "leaf") {
        if (node.id !== leafId) return node;
        return {
            type: "split",
            id: paneId("split"),
            dir,
            weights: [1, 1],
            children: place === "before" ? [fresh(), node] : [node, fresh()],
        };
    }

    const direct = node.children.findIndex((child) => child.type === "leaf" && child.id === leafId);
    if (direct >= 0 && node.dir === dir) {
        const children = [...node.children];
        const at = place === "before" ? direct : direct + 1;
        children.splice(at, 0, fresh());
        const weights = [...node.weights];
        const share = (weights[direct] ?? 1) / 2;
        weights[direct] = share;
        weights.splice(at, 0, share);
        return { ...node, children, weights };
    }

    let changed = false;
    const children = node.children.map((child) => {
        if (!containsLeaf(child, leafId)) return child;
        const next = splitLeaf(child, leafId, dir, place, insert);
        if (next !== child) changed = true;
        return next;
    });
    return changed ? { ...node, children } : node;
}

function unwrap(node: PaneNode): PaneNode {
    if (node.type === "leaf") return node;
    const children = node.children.map(unwrap);
    if (children.length === 1) return children[0]!;
    return { ...node, children };
}

export function removeLeaf(node: PaneNode, leafId: string): PaneNode {
    function strip(current: PaneNode): PaneNode | null {
        if (current.type === "leaf") return current.id === leafId ? null : current;
        const children: PaneNode[] = [];
        const weights: number[] = [];
        current.children.forEach((child, index) => {
            const next = strip(child);
            if (!next) return;
            children.push(next);
            weights.push(current.weights[index] ?? 1);
        });
        if (children.length === 0) return null;
        if (children.length === 1) return children[0]!;
        return { ...current, children, weights: normalize(weights) };
    }
    return unwrap(strip(node) ?? chatRoot());
}

/** `left` is an absolute weight. `pair` is the sum of the two panes at drag start. */
export function resizePair(
    node: PaneNode,
    splitId: string,
    index: number,
    left: number,
    pair: number,
): PaneNode {
    if (node.type === "leaf") return node;
    if (node.id === splitId) {
        const min = pair * 0.12;
        const clamped = Math.min(pair - min, Math.max(min, left));
        const weights = [...node.weights];
        weights[index] = clamped;
        weights[index + 1] = pair - clamped;
        return { ...node, weights };
    }
    let changed = false;
    const children = node.children.map((child) => {
        const next = resizePair(child, splitId, index, left, pair);
        if (next !== child) changed = true;
        return next;
    });
    return changed ? { ...node, children } : node;
}

export function isPaneNode(value: unknown): value is PaneNode {
    if (!value || typeof value !== "object") return false;
    const node = value as PaneNode;
    if (node.type === "leaf") {
        return typeof node.id === "string" && Array.isArray(node.tabs) && typeof node.active === "string";
    }
    if (node.type === "split") {
        return (
            (node.dir === "row" || node.dir === "col")
            && Array.isArray(node.children)
            && node.children.length >= 2
            && Array.isArray(node.weights)
            && node.children.every((child) => isPaneNode(child))
        );
    }
    return false;
}
