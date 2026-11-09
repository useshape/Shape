/** Nested editor grid for the main area. The sidebar stays the chat navigator. */

export type DockPlace = "current" | "left" | "right" | "top" | "bottom" | "full";

export type DockPanel =
    | { id: string; kind: "chat"; title: string }
    | { id: "terminal"; kind: "terminal"; title: string }
    | { id: string; kind: "file"; title: string; path: string }
    | { id: string; kind: "tool"; title: string; tool: "graph" | "prs" | "showcase" };

export type DockGroup = {
    type: "group";
    id: string;
    tabs: DockPanel[];
    active: string;
};

export type DockSplit = {
    type: "split";
    id: string;
    dir: "row" | "col";
    sizes: number[];
    children: DockNode[];
};

export type DockNode = DockGroup | DockSplit;

export type DockState = {
    root: DockNode;
    focused: string;
    maximized: string | null;
    /** Group that keeps the live chat mounted, even while the terminal is focused. */
    chatAnchor: string;
};

export type DropZone = "center" | "left" | "right" | "top" | "bottom";

let seq = 0;
function nid(prefix: string) {
    seq += 1;
    return `${prefix}-${seq.toString(36)}`;
}

export function chatPanel(id: string, title = "Chat"): DockPanel {
    return { id, kind: "chat", title };
}

export function terminalPanel(): DockPanel {
    return { id: "terminal", kind: "terminal", title: "Terminal" };
}

function group(tabs: DockPanel[], active = tabs[0]?.id ?? ""): DockGroup {
    return { type: "group", id: nid("group"), tabs, active };
}

export function defaultDock(chatId: string, terminal = true, terminalSize = 0.22): DockState {
    const main = group([chatPanel(chatId)]);
    if (!terminal) return { root: main, focused: main.id, maximized: null, chatAnchor: main.id };
    const term = group([terminalPanel()]);
    const root: DockSplit = {
        type: "split",
        id: nid("split"),
        dir: "col",
        sizes: [1 - terminalSize, terminalSize],
        children: [main, term],
    };
    return { root, focused: main.id, maximized: null, chatAnchor: main.id };
}

export function walkGroups(node: DockNode, out: DockGroup[] = []): DockGroup[] {
    if (node.type === "group") out.push(node);
    else node.children.forEach((child) => walkGroups(child, out));
    return out;
}

export function findGroup(node: DockNode, id: string): DockGroup | null {
    if (node.type === "group") return node.id === id ? node : null;
    for (const child of node.children) {
        const hit = findGroup(child, id);
        if (hit) return hit;
    }
    return null;
}

export function groupOfPanel(node: DockNode, panelId: string): DockGroup | null {
    for (const groupNode of walkGroups(node)) {
        if (groupNode.tabs.some((tab) => tab.id === panelId)) return groupNode;
    }
    return null;
}

function mapGroup(node: DockNode, id: string, fn: (group: DockGroup) => DockNode): DockNode {
    if (node.type === "group") return node.id === id ? fn(node) : node;
    let changed = false;
    const children = node.children.map((child) => {
        const next = mapGroup(child, id, fn);
        if (next !== child) changed = true;
        return next;
    });
    return changed ? { ...node, children } : node;
}

function normalize(sizes: number[]) {
    const sum = sizes.reduce((total, size) => total + size, 0) || 1;
    return sizes.map((size) => size / sum);
}

function splitAround(
    node: DockNode,
    groupId: string,
    dir: "row" | "col",
    place: "before" | "after",
    insert: DockGroup,
): DockNode {
    if (node.type === "group") {
        if (node.id !== groupId) return node;
        return {
            type: "split",
            id: nid("split"),
            dir,
            sizes: [1, 1],
            children: place === "before" ? [insert, node] : [node, insert],
        };
    }
    const direct = node.children.findIndex((child) => child.type === "group" && child.id === groupId);
    if (direct >= 0 && node.dir === dir) {
        const children = [...node.children];
        const at = place === "before" ? direct : direct + 1;
        children.splice(at, 0, insert);
        const sizes = [...node.sizes];
        const share = (sizes[direct] ?? 1) / 2;
        sizes[direct] = share;
        sizes.splice(at, 0, share);
        return { ...node, children, sizes };
    }
    let changed = false;
    const children = node.children.map((child) => {
        const next = splitAround(child, groupId, dir, place, insert);
        if (next !== child) changed = true;
        return next;
    });
    return changed ? { ...node, children } : node;
}

function stripPanel(node: DockNode, panelId: string): DockNode | null {
    if (node.type === "group") {
        const tabs = node.tabs.filter((tab) => tab.id !== panelId);
        if (tabs.length === node.tabs.length) return node;
        if (tabs.length === 0) return null;
        const active = node.active === panelId ? tabs[tabs.length - 1]!.id : node.active;
        return { ...node, tabs, active };
    }
    const children: DockNode[] = [];
    const sizes: number[] = [];
    node.children.forEach((child, index) => {
        const next = stripPanel(child, panelId);
        if (!next) return;
        children.push(next);
        sizes.push(node.sizes[index] ?? 1);
    });
    if (children.length === 0) return null;
    if (children.length === 1) return children[0]!;
    return { ...node, children, sizes: normalize(sizes) };
}

export function closePanel(state: DockState, panelId: string): DockState {
    if (panelId === "terminal") return state;
    const next = stripPanel(state.root, panelId);
    if (!next) return state;
    const groups = walkGroups(next);
    const focused = groups.some((item) => item.id === state.focused) ? state.focused : groups[0]?.id ?? state.focused;
    return { ...state, root: next, focused, chatAnchor: groups.some((item) => item.id === state.chatAnchor) ? state.chatAnchor : focused, maximized: state.maximized && findGroup(next, state.maximized) ? state.maximized : null };
}

function addToGroup(node: DockNode, groupId: string, panel: DockPanel, focus: boolean): DockNode {
    return mapGroup(node, groupId, (current) => {
        if (current.tabs.some((tab) => tab.id === panel.id)) {
            return focus ? { ...current, active: panel.id } : current;
        }
        return { ...current, tabs: [...current.tabs, panel], active: focus ? panel.id : current.active };
    });
}

function zoneSplit(zone: Exclude<DropZone, "center">): { dir: "row" | "col"; place: "before" | "after" } {
    if (zone === "left") return { dir: "row", place: "before" };
    if (zone === "right") return { dir: "row", place: "after" };
    if (zone === "top") return { dir: "col", place: "before" };
    return { dir: "col", place: "after" };
}

export function dropPanel(state: DockState, panel: DockPanel, targetGroupId: string, zone: DropZone, focus: boolean): DockState {
    const existing = groupOfPanel(state.root, panel.id);
    if (zone !== "center" && existing?.id === targetGroupId && existing.tabs.length <= 1) {
        const spec = zoneSplit(zone);
        const root = splitAround(state.root, targetGroupId, spec.dir, spec.place, group([chatPanel("__new_chat__", "New chat")]));
        return { ...state, root, maximized: null };
    }
    let root = existing ? stripPanel(state.root, panel.id) ?? state.root : state.root;
    if (!findGroup(root, targetGroupId)) {
        const fallback = walkGroups(root)[0];
        if (!fallback) return state;
        targetGroupId = fallback.id;
    }
    if (zone === "center") {
        root = addToGroup(root, targetGroupId, panel, focus);
        return {
            ...state,
            root,
            focused: focus ? targetGroupId : state.focused,
            chatAnchor: panel.kind === "chat" && focus ? targetGroupId : state.chatAnchor,
        };
    }
    const spec = zoneSplit(zone);
    const fresh = group([panel]);
    root = splitAround(root, targetGroupId, spec.dir, spec.place, fresh);
    return { ...state, root, focused: focus ? fresh.id : state.focused, maximized: null, chatAnchor: panel.kind === "chat" && focus ? fresh.id : state.chatAnchor };
}

export function placePanel(state: DockState, panel: DockPanel, place: DockPlace, focus: boolean): DockState {
    const existing = groupOfPanel(state.root, panel.id);
    if (existing) {
        const root = focus ? addToGroup(state.root, existing.id, panel, true) : state.root;
        let next: DockState = {
            ...state,
            root,
            focused: focus ? existing.id : state.focused,
            chatAnchor: panel.kind === "chat" && focus ? existing.id : state.chatAnchor,
        };
        if (place === "full" && focus) next = { ...next, maximized: existing.id };
        return next;
    }
    const target = findGroup(state.root, state.focused) ?? walkGroups(state.root)[0];
    if (!target) return state;
    if (place === "current" || place === "full") {
        const next = dropPanel(state, panel, target.id, "center", focus);
        return place === "full" && focus ? { ...next, maximized: next.focused } : next;
    }
    return dropPanel(state, panel, target.id, place, focus);
}

export function resizeSplit(state: DockState, splitId: string, index: number, left: number, pair: number): DockState {
    function visit(node: DockNode): DockNode {
        if (node.type === "group") return node;
        if (node.id === splitId) {
            const min = pair * 0.12;
            const clamped = Math.min(pair - min, Math.max(min, left));
            const sizes = [...node.sizes];
            sizes[index] = clamped;
            sizes[index + 1] = pair - clamped;
            return { ...node, sizes };
        }
        return { ...node, children: node.children.map(visit) };
    }
    return { ...state, root: visit(state.root) };
}

export function activateInGroup(state: DockState, groupId: string, panelId: string): DockState {
    return {
        ...state,
        focused: groupId,
        root: addToGroup(state.root, groupId, state.root && groupOfPanel(state.root, panelId)?.tabs.find((tab) => tab.id === panelId) || chatPanel(panelId), true),
    };
}

export function focusTab(state: DockState, groupId: string, panelId: string): DockState {
    if (!groupOfPanel(state.root, panelId)) return state;
    return { ...state, focused: groupId, chatAnchor: groupOfPanel(state.root, panelId)?.tabs.find((tab) => tab.id === panelId)?.kind === "chat" ? groupId : state.chatAnchor, root: mapGroup(state.root, groupId, (groupNode) => ({ ...groupNode, active: panelId })) };
}

export function toggleMaximize(state: DockState, groupId: string): DockState {
    return { ...state, maximized: state.maximized === groupId ? null : groupId };
}

export function isDockState(value: unknown): value is DockState {
    if (!value || typeof value !== "object") return false;
    const state = value as DockState;
    return Boolean(state.root) && isNode(state.root) && typeof state.focused === "string";
}

function isPanel(value: unknown): value is DockPanel {
    if (!value || typeof value !== "object") return false;
    const panel = value as DockPanel;
    return typeof panel.id === "string" && (panel.kind === "chat" || panel.kind === "terminal" || panel.kind === "file" || panel.kind === "tool");
}

function isNode(value: unknown): value is DockNode {
    if (!value || typeof value !== "object") return false;
    const node = value as DockNode;
    if (node.type === "group") {
        return typeof node.id === "string" && Array.isArray(node.tabs) && node.tabs.every(isPanel);
    }
    if (node.type === "split") {
        return (node.dir === "row" || node.dir === "col") && node.children.length >= 2 && node.children.every(isNode);
    }
    return false;
}

/** Drop saved panels whose chats no longer exist. Keep terminal and tools. */
export function pruneChats(state: DockState, liveIds: Set<string>): DockState {
    let next = state;
    for (const groupNode of walkGroups(state.root)) {
        for (const tab of groupNode.tabs) {
            if (tab.kind === "chat" && tab.id !== "__new_chat__" && !tab.id.startsWith("thread-") && !liveIds.has(tab.id) && liveIds.size > 0) {
                next = closePanel(next, tab.id);
            }
        }
    }
    const groups = walkGroups(next.root);
    if (!groups.some((item) => item.tabs.some((tab) => tab.kind === "chat"))) {
        const host = groups[0];
        if (host) next = { ...next, root: addToGroup(next.root, host.id, chatPanel("__new_chat__"), true), focused: host.id };
    }
    return next;
}
