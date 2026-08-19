"use client";

import { useSyncExternalStore } from "react";
import type {
    DesignBridgeApi,
    DesignLayerNode,
    DesignPendingEdit,
    DesignSelectedElement,
} from "./types";
import { abortDesignApply } from "./commit";

export type DesignModeTool = "select" | "draw";

export type DesignModeState = {
    enabled: boolean;
    inspect: boolean;
    tool: DesignModeTool;
    layers: DesignLayerNode[];
    selected: DesignSelectedElement | null;
    selection: DesignSelectedElement[];
    pending: DesignPendingEdit[];
    proxySrc: string | null;
    ready: boolean;
    selecting: boolean;
    applyFailedIds: string[];
};

const listeners = new Set<() => void>();

let state: DesignModeState = {
    enabled: false,
    inspect: true,
    tool: "select",
    layers: [],
    selected: null,
    selection: [],
    pending: [],
    proxySrc: null,
    ready: false,
    selecting: false,
    applyFailedIds: [],
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
        abortDesignApply();
        setState({
            enabled: false,
            ready: false,
            selected: null,
            layers: [],
            proxySrc: null,
            selecting: false,
            applyFailedIds: [],
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

export function setDesignSelecting(selecting: boolean) {
    setState({ selecting });
}

export function setDesignApplyFailedIds(applyFailedIds: string[]) {
    setState({ applyFailedIds });
}

export function setDesignSelected(selected: DesignSelectedElement | null, additive = false) {
    if (!selected) {
        setState({ selected: null, selection: [], selecting: false });
        return;
    }
    const pending = selected.source
        ? state.pending.map((p) => (p.id === selected.id && !p.source ? { ...p, source: selected.source } : p))
        : state.pending;
    if (additive) {
        const without = state.selection.filter((s) => s.id !== selected.id);
        const selection = [...without, selected];
        setState({ selected, selection, pending, selecting: false });
        return;
    }
    setState({ selected, selection: [selected], pending, selecting: false });
}

export function setDesignSelection(selection: DesignSelectedElement[]) {
    setState({ selection, selected: selection[selection.length - 1] ?? null });
}

export function setDesignTool(tool: DesignModeTool) {
    setState({ tool });
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
                        locateText: edit.locateText || p.locateText,
                        source: edit.source ?? p.source ?? state.selected?.source,
                        label: edit.label || p.label,
                        styles: { ...p.styles, ...edit.styles },
                        text: edit.text ?? p.text,
                        inspect: edit.inspect || p.inspect,
                        classToggles: edit.classToggles
                            ? { ...p.classToggles, ...edit.classToggles }
                            : p.classToggles,
                    }
                  : p,
          )
        : [...state.pending, { ...edit, source: edit.source ?? state.selected?.source }];
    setState({ pending: next });
}

export function setDesignPending(pending: DesignPendingEdit[]) {
    setState({ pending });
}

export function clearDesignPending() {
    setState({ pending: [] });
}

export function designPendingCountLabel(count: number) {
    return count === 1 ? "1 Edit" : `${count} Edits`;
}

export function serializeDesignEdits(): string {
    if (state.pending.length === 0 && !state.selected && state.selection.length === 0) return "";
    const lines = [
        "Apply these visual design-mode edits to the source of the page currently in the Browser preview.",
        "Map each element from its tag/class/text to the React/HTML/CSS that produced it, then update that source (prefer Tailwind classes when the project uses Tailwind).",
        "",
    ];
    const items = state.pending.length
        ? state.pending
        : (state.selection.length ? state.selection : state.selected ? [state.selected] : []).map((el) => ({
              id: el.id,
              label: el.label,
              selector: el.selector,
              styles: {},
              text: el.text,
          }));
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

export function formatSelectionForChat(): string {
    const items = state.selection.length ? state.selection : state.selected ? [state.selected] : [];
    if (!items.length) return "";
    const lines = ["Update these UI elements in the running preview:"];
    for (const el of items) {
        const loc = el.source ? ` (${el.source.fileName.split(/[/\\\\]/).pop()}:${el.source.lineNumber})` : "";
        lines.push(`- <${el.tag}> ${el.label}${loc}`);
        if (el.selector) lines.push(`  selector: ${el.selector}`);
        if (el.className) lines.push(`  class: ${el.className}`);
    }
    lines.push("", "Describe the visual change.");
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
    return () => {
        bridgeListeners.delete(listener);
    };
}
