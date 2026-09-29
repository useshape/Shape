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
        workersSnapshot = workers;
        return;
    }
    workersSnapshot = workers.filter(
        (w) => !w.parentId || w.parentId === focusConversationId,
    );
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

export function upsertWorker(partial: Partial<MultiworkWorker> & { id: string }) {
    const now = Date.now();
    const idx = workers.findIndex((w) => w.id === partial.id);
    if (idx >= 0) {
        workers = workers.map((w, i) =>
            i === idx ? { ...w, ...partial, updatedAt: now } : w,
        );
    } else {
        workers = [
            ...workers,
            {
                id: partial.id,
                title: partial.title || "Worker",
                task: partial.task || "",
                model: partial.model,
                activity: partial.activity || "Working…",
                column: partial.column || "running",
                status: partial.status || "running",
                transcript: partial.transcript,
                parentId: partial.parentId,
                updatedAt: now,
            },
        ];
    }
    emit();
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
