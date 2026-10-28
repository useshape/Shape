"use client";

import { getWorkspaceMode, type WorkspaceModeId } from "@/lib/ui/workspace-mode";

export type WorkerShape = "circle" | "square" | "triangle" | "cloud";

export const WORKER_SHAPES: WorkerShape[] = ["circle", "square", "triangle", "cloud"];

export const WORKER_COLORS = [
    "#f4f4f5",
    "#8d6e63",
    "#ef4444",
    "#f97316",
    "#f5a524",
    "#22c55e",
    "#2dd4bf",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#9ca3af",
    "#6b7280",
] as const;

type LaneRecord = {
    mode: WorkspaceModeId;
    shape?: WorkerShape;
    color?: string;
    job?: string;
    taught?: string;
    name?: string;
};

export type LaneDraft = LaneRecord & {
    title?: string;
    armedAt: number;
};

const KEY = "shape:chat-lanes";
const LAST_KEY = "shape:chat-lane-last";

let lanes: Record<string, LaneRecord> = {};
let last: Partial<Record<WorkspaceModeId, string>> = {};
let draft: LaneDraft | null = null;
let loaded = false;

type Snapshot = {
    version: number;
    lanes: Record<string, LaneRecord>;
    draft: LaneDraft | null;
};

let snapshot: Snapshot = { version: 0, lanes, draft };

const listeners = new Set<() => void>();

function emit() {
    snapshot = { version: snapshot.version + 1, lanes, draft };
    for (const listener of listeners) listener();
}

function normalizeMode(mode: string | undefined): WorkspaceModeId {
    if (mode === "Chat" || mode === "GTM" || mode === "Cowork" || mode === "Image") return "Chat";
    return "Code";
}

function load() {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, LaneRecord>;
        if (raw && typeof raw === "object") {
            lanes = Object.fromEntries(
                Object.entries(raw).map(([id, lane]) => [id, { ...lane, mode: normalizeMode(lane.mode) }]),
            );
        }
    } catch {
        lanes = {};
    }
    try {
        const raw = JSON.parse(localStorage.getItem(LAST_KEY) || "{}") as Record<string, string>;
        if (raw && typeof raw === "object") {
            last = {
                Code: raw.Code,
                Chat: raw.Chat || raw.GTM || raw.Cowork,
            };
        }
    } catch {
        last = {};
    }
    snapshot = { version: 0, lanes, draft };
}

function saveLanes() {
    try {
        localStorage.setItem(KEY, JSON.stringify(lanes));
    } catch {
        /* ignore */
    }
}

export function subscribeChatLanes(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getLaneSnapshot(): Snapshot {
    load();
    return snapshot;
}

export function getLaneSnapshotServer(): Snapshot {
    return snapshot;
}

export function chatLane(id: string): WorkspaceModeId {
    load();
    return normalizeMode(lanes[id]?.mode);
}

/** Untagged chats belong to the store that loaded them, not to Code by default. */
export function laneFor(id: string, fallback: WorkspaceModeId): WorkspaceModeId {
    load();
    const lane = lanes[id];
    if (!lane) return fallback;
    return normalizeMode(lane.mode);
}

export function chatMark(id: string): LaneRecord | null {
    load();
    return lanes[id] ?? null;
}

export function nextWorkerColor(mode: WorkspaceModeId): string {
    load();
    const used = new Set(
        Object.values(lanes)
            .filter((lane) => lane.mode === mode && lane.color)
            .map((lane) => lane.color),
    );
    const free = WORKER_COLORS.find((color) => !used.has(color));
    if (free) return free;
    const count = Object.values(lanes).filter((lane) => lane.mode === mode).length;
    return WORKER_COLORS[count % WORKER_COLORS.length];
}

export function armNextChat(lane: LaneRecord & { title?: string }) {
    load();
    draft = { ...lane, armedAt: Date.now() / 1000 };
    emit();
}

export function clearNextChat() {
    if (!draft) return;
    draft = null;
    emit();
}

/** Tag the conversation created for the armed draft. Returns a title to lock, if any. */
export function sealNextChat(id: string): string | null {
    load();
    if (!draft || !id) return null;
    const created = Number(id);
    if (Number.isFinite(created) && created > 1_000_000_000 && created < draft.armedAt - 3) return null;
    if (!lanes[id]) {
        lanes = {
            ...lanes,
            [id]: {
                mode: draft.mode,
                shape: draft.shape,
                color: draft.color,
                job: draft.job,
                taught: draft.taught,
                name: draft.title?.trim() || undefined,
            },
        };
        saveLanes();
    }
    const title = draft.title?.trim() || null;
    draft = null;
    emit();
    return title;
}

export function patchLane(id: string, patch: Partial<LaneRecord>) {
    load();
    const current = lanes[id];
    if (!current) return;
    lanes = { ...lanes, [id]: { ...current, ...patch } };
    saveLanes();
    emit();
}

export function ensureDraftForCurrentMode() {
    load();
    if (draft) return;
    armNextChat({ mode: getWorkspaceMode() });
}

export function assignLane(id: string, mode: WorkspaceModeId) {
    load();
    if (!id || lanes[id]) return;
    lanes = { ...lanes, [id]: { mode } };
    saveLanes();
    emit();
}

export function rememberLaneChat(mode: WorkspaceModeId, id: string) {
    load();
    if (last[mode] === id) return;
    last = { ...last, [mode]: id };
    try {
        localStorage.setItem(LAST_KEY, JSON.stringify(last));
    } catch {
        /* ignore */
    }
}

export function lastLaneChat(mode: WorkspaceModeId): string | null {
    load();
    return last[mode] ?? null;
}
