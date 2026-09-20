import { useSyncExternalStore } from "react";

type StatusProgressEntry = {
    id: string;
    message: string;
};

let entries: StatusProgressEntry[] = [];
let messagesSnapshot: string[] = [];
const EMPTY_MESSAGES: string[] = [];
const listeners = new Set<() => void>();

function syncMessagesSnapshot() {
    const next = entries.map((e) => e.message);
    if (
        next.length === messagesSnapshot.length &&
        next.every((msg, i) => msg === messagesSnapshot[i])
    ) {
        return;
    }
    messagesSnapshot = next;
}

function emit() {
    syncMessagesSnapshot();
    listeners.forEach((listener) => listener());
}

export const statusProgress = {
    push(id: string, message: string) {
        entries = [...entries.filter((e) => e.id !== id), { id, message }];
        emit();
    },
    remove(id: string) {
        const next = entries.filter((e) => e.id !== id);
        if (next.length === entries.length) return;
        entries = next;
        emit();
    },
    clear() {
        if (entries.length === 0) return;
        entries = [];
        emit();
    },
    getMessage(): string | null {
        return entries.length > 0 ? entries[entries.length - 1].message : null;
    },
    getAllMessages(): string[] {
        return messagesSnapshot;
    },
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    getSnapshot() {
        return entries;
    },
};

export function useStatusProgressMessage(): string | null {
    return useSyncExternalStore(
        statusProgress.subscribe,
        statusProgress.getMessage,
        () => null
    );
}

export function useAllProgressMessages(): string[] {
    return useSyncExternalStore(
        statusProgress.subscribe,
        statusProgress.getAllMessages,
        () => EMPTY_MESSAGES
    );
}
