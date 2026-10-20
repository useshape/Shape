"use client";

let selectedId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

export function subscribeTalkMedia(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getSelectedTalkMediaId() {
    return selectedId;
}

export function setSelectedTalkMediaId(id: string | null) {
    if (selectedId === id) return;
    selectedId = id;
    emit();
}
