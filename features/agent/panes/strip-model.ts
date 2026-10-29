export type ToolId = "tool:graph" | "tool:prs" | "tool:terminal";

const TOOLS: ToolId[] = ["tool:graph", "tool:prs", "tool:terminal"];

export function isToolId(id: string): id is ToolId {
  return (TOOLS as string[]).includes(id);
}

export function toolTitle(id: ToolId): string {
  if (id === "tool:graph") return "Graph";
  if (id === "tool:prs") return "Pull requests";
  return "Terminal";
}

/** Two tabs shown together. They stay in the one tab strip, side by side. */
export type SplitPair = {
  left: string;
  right: string;
  weights: [number, number];
};

export type StripModel = {
  order: string[];
  activeId: string | null;
  split: SplitPair | null;
};

export function createStrip(): StripModel {
  return { order: [], activeId: null, split: null };
}

export function showsSplit(state: StripModel): boolean {
  const split = state.split;
  if (!split || !state.activeId) return false;
  return state.activeId === split.left || state.activeId === split.right;
}

function withoutSplit(state: StripModel, id: string): SplitPair | null {
  if (!state.split) return null;
  if (state.split.left === id || state.split.right === id) return null;
  return state.split;
}

function placeBeside(order: string[], anchor: string, incoming: string): string[] {
  const rest = order.filter((id) => id !== incoming);
  const at = rest.indexOf(anchor);
  if (at < 0) return [...rest, incoming];
  const next = [...rest];
  next.splice(at + 1, 0, incoming);
  return next;
}

export function activateTab(state: StripModel, id: string): StripModel {
  if (!id) return state;
  const order = state.order.includes(id) ? state.order : [...state.order, id];
  if (state.activeId === id && order === state.order) return state;
  return { ...state, order, activeId: id };
}

export function reorderTabs(state: StripModel, from: number, to: number): StripModel {
  if (from === to || from < 0 || to < 0 || from >= state.order.length || to >= state.order.length) return state;
  const order = [...state.order];
  const [moved] = order.splice(from, 1);
  if (!moved) return state;
  order.splice(to, 0, moved);
  return { ...state, order, split: splitIfAdjacent({ ...state, order }) };
}

/** Drop `incoming` onto `anchor` so the two share one split, still in the same tab strip. */
export function splitTabs(state: StripModel, anchor: string, incoming: string): StripModel {
  if (!anchor || !incoming || anchor === incoming || isToolId(anchor) || isToolId(incoming)) return state;
  const order = placeBeside(state.order.includes(anchor) ? state.order : [...state.order, anchor], anchor, incoming);
  return {
    order,
    activeId: incoming,
    split: { left: anchor, right: incoming, weights: [1, 1] },
  };
}

export function clearSplit(state: StripModel): StripModel {
  if (!state.split) return state;
  return { ...state, split: null };
}

export function setSplitWeights(state: StripModel, left: number, right: number): StripModel {
  if (!state.split) return state;
  return { ...state, split: { ...state.split, weights: [left, right] } };
}

export function replaceSplitSide(state: StripModel, side: "left" | "right", id: string): StripModel {
  if (!state.split || !id || isToolId(id)) return state;
  const split = { ...state.split, [side]: id };
  const order = state.order.includes(id) ? state.order : [...state.order, id];
  const activeId = side === "left" ? split.left : split.right;
  return { ...state, order, split, activeId };
}

export function closeTab(state: StripModel, id: string): StripModel {
  const order = state.order.filter((item) => item !== id);
  const split = withoutSplit(state, id);
  let activeId = state.activeId;
  if (activeId === id) {
    activeId = split ? (split.left === id ? split.right : split.left) : (order[0] ?? null);
  }
  return { order, activeId, split };
}

export function showView(state: StripModel, view: string): StripModel {
  if (view === "chat") {
    const chat = state.order.find((id) => !isToolId(id)) ?? null;
    if (!chat || state.activeId === chat) return state.activeId === chat ? state : { ...state, activeId: chat };
    return { ...state, activeId: chat };
  }
  if (!isToolId(view)) return activateTab(state, view);
  const order = state.order.includes(view) ? state.order : [...state.order, view];
  if (state.activeId === view && order === state.order) return state;
  return { ...state, order, activeId: view };
}

export function closeTool(state: StripModel, id: ToolId): StripModel {
  return closeTab(state, id);
}

export function setTabOrder(state: StripModel, order: string[], activeId: string | null): StripModel {
  if (sameIds(state.order, order) && state.activeId === activeId) return state;
  return { ...state, order, activeId, split: splitIfAdjacent({ ...state, order }) };
}

function splitIfAdjacent(state: StripModel): SplitPair | null {
  const split = state.split;
  if (!split) return null;
  const left = state.order.indexOf(split.left);
  const right = state.order.indexOf(split.right);
  if (left < 0 || right < 0 || Math.abs(left - right) !== 1) return null;
  return split;
}

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function insertionIndex(centers: number[], x: number): number {
  for (let i = 0; i < centers.length; i++) {
    if (x < centers[i]) return i;
  }
  return Math.max(0, centers.length - 1);
}

const STOP = new Set([
  "a", "an", "the", "of", "to", "for", "in", "on", "and", "or", "with", "that", "this",
  "how", "what", "where", "when", "who", "does", "do", "is", "are", "was", "be", "it",
  "from", "into", "about", "please", "show", "find", "me", "can", "could", "would",
]);

export function localSearchQuery(query: string): string {
  const kept = query
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_]+$/gu, "").toLowerCase())
    .filter((word) => word.length > 1 && !STOP.has(word));
  return kept.length > 0 ? kept.join(" ") : query.trim();
}
