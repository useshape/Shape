import {
    activateTab,
    clearSplit,
    closeTab,
    closeTool as closeToolInModel,
    createStrip,
    isToolId,
    reorderTabs,
    replaceSplitSide as replaceSplitSideInModel,
    setSplitWeights,
    setTabOrder,
    showView as showViewInModel,
    showsSplit,
    splitTabs,
    toolTitle,
    type SplitPair,
    type StripModel,
    type ToolId,
} from "./panes/strip-model";

export { isToolId, showsSplit, toolTitle } from "./panes/strip-model";
export type { SplitPair, ToolId };

const listeners = new Set<() => void>();
let state: StripModel = createStrip();

function emit() {
    listeners.forEach((listener) => listener());
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("shape-terminal-open", { detail: { open: state.activeId === "tool:terminal" } }));
}

export function subscribeStrip(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getStrip(): StripModel {
    return state;
}

function commit(next: StripModel) {
    if (next === state) return;
    state = next;
    emit();
}

export function showView(view: string) {
    commit(showViewInModel(state, view));
}

export function showChat() {
    showView("chat");
}

export function activateChat(id: string) {
    commit(activateTab(state, id));
}

export function reorderChat(from: number, to: number) {
    commit(reorderTabs(state, from, to));
}

export function splitWith(anchor: string, incoming: string) {
    commit(splitTabs(state, anchor, incoming));
}

export function unsplit() {
    commit(clearSplit(state));
}

export function setPaneWeights(weights: number[]) {
    if (!state.split || weights.length < 2) return;
    commit(setSplitWeights(state, weights[0] ?? 1, weights[1] ?? 1));
}

export function replaceSplitSide(side: "left" | "right", id: string) {
    commit(replaceSplitSideInModel(state, side, id));
}

export function closeChatTab(id: string) {
    commit(closeTab(state, id));
}

export function closeTool(id: ToolId) {
    commit(closeToolInModel(state, id));
}

export function setOpenTabs(order: string[], activeId: string | null) {
    commit(setTabOrder(state, order, activeId));
}

export function terminalVisible() {
    return state.activeId === "tool:terminal";
}
