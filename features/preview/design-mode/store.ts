"use client";

import { useSyncExternalStore } from "react";
import type {
    DesignBridgeApi,
    DesignLayerNode,
    DesignPendingEdit,
    DesignSelectedElement,
} from "./types";

export type DesignModeState = {
    enabled: boolean;
    inspect: boolean;
    layers: DesignLayerNode[];
    selected: DesignSelectedElement | null;
    pending: DesignPendingEdit[];
    proxySrc: string | null;
    ready: boolean;
};

const listeners = new Set<() => void>();

let state: DesignModeState = {
    enabled: false,
    inspect: true,
    layers: [],
    selected: null,
    pending: [],
    proxySrc: null,
    ready: false,
};

function emit() {
    listeners.forEach((l) => l());
}

function setState(patch: Partial<DesignModeState>) {
    state = { ...state, ...patch };
    emit();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getDesignModeState() {
    return state;
}

export function useDesignModeStore() {
    return useSyncExternalStore(subscribe, getDesignModeState, getDesignModeState);
}

export function setDesignModeEnabled(enabled: boolean) {
    if (!enabled) {
        setState({
            enabled: false,
            ready: false,
            selected: null,
            layers: [],
            proxySrc: null,
        });
        return;
    }
    setState({ enabled: true, inspect: true });
}

export function setDesignInspect(inspect: boolean) {
    setState({ inspect });
}

export function setDesignProxySrc(proxySrc: string | null) {
    setState({ proxySrc, ready: false });
}

export function setDesignReady(ready: boolean) {
    setState({ ready });
}

export function setDesignLayers(layers: DesignLayerNode[]) {
    setState({ layers });
}

export function setDesignSelected(selected: DesignSelectedElement | null) {
    setState({ selected });
}

export function upsertDesignPending(edit: DesignPendingEdit) {
    const existing = state.pending.find((p) => p.id === edit.id || (edit.selector && p.selector === edit.selector));
    const next = existing
        ? state.pending.map((p) =>
              p.id === existing.id
                  ? {
                        ...p,
                        id: edit.id || p.id,
                        tag: edit.tag || p.tag,
                        selector: edit.selector || p.selector,
                        className: edit.className || p.className,
                        source: edit.source || p.source,
                        label: edit.label || p.label,
                        styles: { ...p.styles, ...edit.styles },
                        text: edit.text ?? p.text,
                    }
                  : p,
          )
        : [...state.pending, edit];
    setState({ pending: next });
}

export function setDesignPending(pending: DesignPendingEdit[]) {
    setState({ pending });
}

export function clearDesignPending() {
    setState({ pending: [] });
}

export function serializeDesignEdits(): string {
    if (state.pending.length === 0 && !state.selected) return "";
    const lines = [
        "Apply these visual design-mode edits to the source of the page currently in the Browser preview.",
        "Map each element from its tag/class/text to the React/HTML/CSS that produced it, then update that source (prefer Tailwind classes when the project uses Tailwind).",
        "",
    ];
    const items = state.pending.length
        ? state.pending
        : state.selected
          ? [{ id: state.selected.id, label: state.selected.label, styles: {}, text: state.selected.text }]
          : [];
    for (const edit of items) {
        const sel = edit.selector ? `, ${edit.selector}` : "";
        lines.push(`- ${edit.label} (id ${edit.id}${sel})`);
        const styleBits = Object.entries(edit.styles)
            .filter(([, v]) => v != null && v !== "")
            .map(([k, v]) => `${k}: ${v}`);
        if (styleBits.length) lines.push(`  styles: ${styleBits.join("; ")}`);
        if (edit.text != null && edit.text !== "") lines.push(`  text: ${JSON.stringify(edit.text)}`);
    }
    return lines.join("\n");
}

let bridgeApi: DesignBridgeApi | null = null;
const bridgeListeners = new Set<() => void>();

export function setDesignBridgeApi(api: DesignBridgeApi | null) {
    bridgeApi = api;
    bridgeListeners.forEach((l) => l());
}

export function getDesignBridge(): DesignBridgeApi | null {
    return bridgeApi;
}

export function subscribeDesignBridge(listener: () => void) {
    bridgeListeners.add(listener);
    return () => bridgeListeners.delete(listener);
}
