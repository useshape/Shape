"use client";

export type CoworkRoutine = {
    id: string;
    workerId: string;
    instruction: string;
    weekday: number | "daily";
    time: string;
    lastRun: number;
    lastError: string | null;
    running: boolean;
};

const KEY = "shape:cowork-routines";
let rows: CoworkRoutine[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

function load() {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as CoworkRoutine[];
        if (Array.isArray(raw)) rows = raw.map((row) => ({ ...row, running: false }));
    } catch {
        rows = [];
    }
}

function save() {
    try {
        localStorage.setItem(KEY, JSON.stringify(rows.map(({ running, ...rest }) => rest)));
    } catch {
        /* ignore */
    }
}

export function subscribeRoutines(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function listRoutines(): CoworkRoutine[] {
    load();
    return rows;
}

export function upsertRoutine(row: Omit<CoworkRoutine, "running">) {
    load();
    const next = { ...row, running: false };
    const index = rows.findIndex((item) => item.id === row.id);
    if (index >= 0) rows = rows.map((item) => (item.id === row.id ? { ...item, ...next } : item));
    else rows = [...rows, next];
    save();
    emit();
}

export function removeRoutine(id: string) {
    load();
    rows = rows.filter((item) => item.id !== id);
    save();
    emit();
}

export function markRoutine(id: string, patch: Partial<CoworkRoutine>) {
    load();
    rows = rows.map((item) => (item.id === id ? { ...item, ...patch } : item));
    save();
    emit();
}

function minutesNow(date: Date) {
    return date.getHours() * 60 + date.getMinutes();
}

function parseTime(value: string) {
    const [h, m] = value.split(":").map((part) => Number(part));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 9 * 60;
    return h * 60 + m;
}

export function dueRoutines(now = new Date()): CoworkRoutine[] {
    load();
    const today = now.getDay();
    const mins = minutesNow(now);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const todayStart = startOfToday.getTime();
    return rows.filter((row) => {
        if (row.running) return false;
        if (row.weekday !== "daily" && row.weekday !== today) return false;
        if (mins < parseTime(row.time)) return false;
        return row.lastRun < todayStart;
    });
}
