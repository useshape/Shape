"use client";

export type ViewMode = "raw" | "split" | "preview";

export interface EditorViewContextType {
    viewModes: Record<string, ViewMode>;
    toggleViewMode: (path: string) => void;
    setViewMode: (path: string, mode: ViewMode) => void;
    getViewMode: (path: string, fallback?: ViewMode) => ViewMode;
}
