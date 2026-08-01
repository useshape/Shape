"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { EditorViewContextType, ViewMode } from "./types";

const EditorViewContext = createContext<EditorViewContextType | undefined>(undefined);

export function EditorViewProvider({ children }: { children: React.ReactNode }) {
    const [viewModes, setViewModes] = useState<Record<string, ViewMode>>({});

    const toggleViewMode = useCallback((path: string) => {
        setViewModes((prev) => {
            const current = prev[path] || "raw";
            let next: ViewMode = "raw";
            if (current === "raw") next = "split";
            else if (current === "split") next = "preview";
            else next = "raw";
            return { ...prev, [path]: next };
        });
    }, []);

    const setViewMode = useCallback((path: string, mode: ViewMode) => {
        setViewModes((prev) => ({ ...prev, [path]: mode }));
    }, []);

    const getViewMode = useCallback((path: string, fallback: ViewMode = "raw") => {
        return viewModes[path] || fallback;
    }, [viewModes]);

    return (
        <EditorViewContext.Provider value={{ viewModes, toggleViewMode, setViewMode, getViewMode }}>
            {children}
        </EditorViewContext.Provider>
    );
}

export function useEditorView() {
    const context = useContext(EditorViewContext);
    if (!context) {
        throw new Error("useEditorView must be used within an EditorViewProvider");
    }
    return context;
}
