"use client";

import { useSyncExternalStore } from "react";
import type { DesignPreviewItem } from "@/features/chat/ui/blocks/gallery";

export type DesignPreviewSession = {
    id: string;
    items: DesignPreviewItem[];
    selectedId?: string;
    /** Concept currently shown in the editor tab (may differ from selected). */
    viewingId?: string;
};

const sessions = new Map<string, DesignPreviewSession>();
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((l) => l());
}

export function upsertDesignPreviewSession(
    id: string,
    items: DesignPreviewItem[],
    options?: { selectedId?: string | null; viewingId?: string },
): DesignPreviewSession {
    const prev = sessions.get(id);
    const next: DesignPreviewSession = {
        id,
        items,
        selectedId:
            options && "selectedId" in options
                ? options.selectedId ?? undefined
                : prev?.selectedId,
        viewingId: options?.viewingId ?? options?.selectedId ?? prev?.viewingId ?? items[0]?.id,
    };
    // viewingId from options.selectedId above can be null when clearing — normalize.
    if (options && "selectedId" in options && options.selectedId == null && !options.viewingId) {
        next.viewingId = prev?.viewingId ?? items[0]?.id;
    }
    sessions.set(id, next);
    emit();
    return next;
}

export function setDesignPreviewSelected(id: string, selectedId: string) {
    const prev = sessions.get(id);
    if (!prev) return;
    sessions.set(id, { ...prev, selectedId });
    emit();
}

export function setDesignPreviewViewing(id: string, viewingId: string) {
    const prev = sessions.get(id);
    if (!prev) return;
    sessions.set(id, { ...prev, viewingId });
    emit();
}

export function removeDesignPreviewSession(id: string) {
    if (!sessions.delete(id)) return;
    emit();
}

export function clearAllDesignPreviewSessions() {
    if (sessions.size === 0) return;
    sessions.clear();
    emit();
}

export function getDesignPreviewSession(id: string): DesignPreviewSession | null {
    return sessions.get(id) ?? null;
}

export function listDesignPreviewSessions(): DesignPreviewSession[] {
    return Array.from(sessions.values());
}

export function subscribeDesignPreviewStore(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useDesignPreviewSession(id: string | null): DesignPreviewSession | null {
    return useSyncExternalStore(
        subscribeDesignPreviewStore,
        () => (id ? sessions.get(id) ?? null : null),
        () => null,
    );
}

/** Stable session id from the preview set (same previews → same tab). */
export function designPreviewSessionId(items: DesignPreviewItem[]): string {
    const key = items
        .map((i) => i.id || i.path)
        .filter(Boolean)
        .join("|");
    if (!key) return `preview-${Date.now()}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
    }
    return `p${Math.abs(hash).toString(36)}`;
}
