"use client";

export type MultiworkColumn = "running" | "review" | "done";

export type MultiworkWorker = {
    id: string;
    title: string;
    task: string;
    model?: string;
    activity: string;
    column: MultiworkColumn;
    status: "pending" | "running" | "done" | "error";
    transcript?: string;
    parentId?: string;
    /** Latest activity lines, newest first. */
    recent?: string[];
    /** Raw live transcript tail from the worker turn. */
    live?: string;
    updatedAt: number;
};

export type MultiworkBusLine = {
    id: string;
    from: string;
    to?: string;
    content: string;
    at: number;
};

type Listener = () => void;

let multiworkMode = false;
let workers: MultiworkWorker[] = [];
let bus: MultiworkBusLine[] = [];
let activeWorkerId: string | null = null;
/** Conversation currently shown in the Multiwork UI (filters workers). */
let focusConversationId: string | null = null;
/** Cached filtered list — stable reference for useSyncExternalStore. */
let workersSnapshot: MultiworkWorker[] = workers;
const listeners = new Set<Listener>();

function rebuildWorkersSnapshot() {
    if (!focusConversationId) {
        workersSnapshot = workers.filter((w) => !w.parentId);
        if (workersSnapshot.length === 0) workersSnapshot = EMPTY_WORKERS;
        return;
    }
    workersSnapshot = workers.filter((w) => w.parentId === focusConversationId);
    if (workersSnapshot.length === 0) workersSnapshot = EMPTY_WORKERS;
}

function emit() {
    rebuildWorkersSnapshot();
    for (const l of listeners) l();
}

export function subscribeMultiwork(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function isMultiworkMode(): boolean {
    return multiworkMode;
}

/** Toggle Multiwork shell mode. Does not wipe background workers. */
export function setMultiworkMode(on: boolean) {
    if (multiworkMode === on) return;
    multiworkMode = on;
    if (!on) {
        activeWorkerId = null;
    }
    emit();
    window.dispatchEvent(
        new CustomEvent("shape-multiwork-mode", { detail: { on } }),
    );
}

export function setMultiworkFocusConversation(id: string | null) {
    if (focusConversationId === id) return;
    focusConversationId = id;
    emit();
}

export function getBoardView(): "board" | "chat" {
    return activeWorkerId ? "chat" : "board";
}

export function setBoardView(_view: "board" | "chat") {
    /* board/chat tabs removed — no-op */
}

export function getWorkers(): MultiworkWorker[] {
    return workersSnapshot;
}

const EMPTY_WORKERS: MultiworkWorker[] = [];
const liveBeforeCreate = new Map<string, string>();

function keptParent(incoming: string | undefined, previous: string | undefined): string | undefined {
    if (!incoming || incoming.startsWith("mw-worker-")) return previous;
    return incoming;
}

/** Every worker, including ones whose parent chat is not focused. */
export function getAllWorkers(): MultiworkWorker[] {
    return workers.length === 0 ? EMPTY_WORKERS : workers;
}

export function getBus(): MultiworkBusLine[] {
    return bus;
}

export function getActiveWorkerId(): string | null {
    return activeWorkerId;
}

export function getActiveWorker(): MultiworkWorker | null {
    if (!activeWorkerId) return null;
    return workers.find((w) => w.id === activeWorkerId) ?? null;
}

export function openWorker(id: string) {
    activeWorkerId = id;
    emit();
    window.dispatchEvent(
        new CustomEvent("shape-open-multiwork-worker", { detail: { id } }),
    );
}

export function closeWorker() {
    activeWorkerId = null;
    emit();
}

function rememberActivity(prev: string[] | undefined, previous: string | undefined, next?: string): string[] {
    const base = prev ?? [];
    const line = next?.trim();
    if (!line || line === previous || line === "Working…") return base;
    return [line, ...base.filter((item) => item !== line)].slice(0, 6);
}

export function upsertWorker(partial: Partial<MultiworkWorker> & { id: string }) {
    const now = Date.now();
    const idx = workers.findIndex((w) => w.id === partial.id);
    const prev = idx >= 0 ? workers[idx] : undefined;
    const recent = rememberActivity(prev?.recent, prev?.activity, partial.activity);
    const parentId = keptParent(partial.parentId, prev?.parentId);
    const buffered = liveBeforeCreate.get(partial.id);
    const live = partial.live ?? buffered ?? prev?.live;
    if (buffered && (partial.live || prev)) liveBeforeCreate.delete(partial.id);
    const next: MultiworkWorker = {
        id: partial.id,
        title: partial.title || prev?.title || "Worker",
        task: partial.task ?? prev?.task ?? "",
        model: partial.model ?? prev?.model,
        activity: partial.activity ?? prev?.activity ?? "Working…",
        column: partial.column ?? prev?.column ?? "running",
        status: partial.status ?? prev?.status ?? "running",
        transcript: partial.transcript ?? prev?.transcript,
        parentId,
        recent,
        live,
        updatedAt: now,
    };
    if (idx >= 0) {
        workers = workers.map((w, i) => (i === idx ? next : w));
    } else {
        workers = [...workers, next];
    }
    emit();
}

/** Append a raw worker token. Display code strips tags before showing it. */
export function appendWorkerLive(workerId: string, chunk: string) {
    if (!workerId || !chunk) return;
    const prev = workers.find((w) => w.id === workerId);
    const base = prev?.live ?? liveBeforeCreate.get(workerId) ?? "";
    const live = (base + chunk).slice(-2400);
    if (!prev) {
        liveBeforeCreate.set(workerId, live);
        return;
    }
    upsertWorker({ id: workerId, live });
}

export function pushBusLine(line: Omit<MultiworkBusLine, "id" | "at"> & { id?: string }) {
    bus = [
        {
            id: line.id || `bus-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: line.from,
            to: line.to,
            content: line.content,
            at: Date.now(),
        },
        ...bus,
    ].slice(0, 80);
    emit();
}

/** Clear only the current session's local UI (new Multiwork session). Background workers for other parents stay. */
export function resetMultiworkSession() {
    const parent = focusConversationId;
    if (parent) {
        workers = workers.filter((w) => w.parentId && w.parentId !== parent);
    } else {
        workers = [];
    }
    bus = [];
    activeWorkerId = null;
    emit();
}

export function applyWorkerEvent(payload: {
    id?: string;
    title?: string;
    task?: string;
    model?: string;
    activity?: string;
    column?: MultiworkColumn;
    status?: MultiworkWorker["status"];
    transcript?: string;
    conversationId?: string;
}) {
    if (!payload.id) return;
    upsertWorker({
        id: payload.id,
        title: payload.title,
        task: payload.task,
        model: payload.model,
        activity: payload.activity,
        column: payload.column,
        status: payload.status,
        transcript: payload.transcript,
        parentId: payload.conversationId,
    });
}

export function applyBusEvent(payload: {
    id?: string;
    from?: string;
    to?: string;
    content?: string;
}) {
    if (!payload.from || !payload.content) return;
    pushBusLine({
        id: payload.id,
        from: payload.from,
        to: payload.to,
        content: payload.content,
    });
}
