"use client";

import { useSyncExternalStore } from "react";

type PrUiState = {
    listOpen: boolean;
    selectedId: string | null;
};

let state: PrUiState = { listOpen: false, selectedId: null };
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

export function subscribePrUi(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getPrUi(): PrUiState {
    return state;
}

export function openPrList() {
    state = { ...state, listOpen: true };
    emit();
}

export function closePrList() {
    state = { ...state, listOpen: false };
    emit();
}

export function selectPr(id: string | null) {
    state = { ...state, selectedId: id };
    emit();
    if (id) {
        window.dispatchEvent(new CustomEvent("shape-set-active-tab", { detail: "prs" }));
    }
}

export function usePrUi(): PrUiState {
    return useSyncExternalStore(subscribePrUi, getPrUi, getPrUi);
}
