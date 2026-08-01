"use client";

import { getMonacoOptionsFromSettings } from "@/lib/settings";

type MonacoEditorLike = {
    updateOptions: (options: Record<string, unknown>) => void;
};

const editors = new Set<MonacoEditorLike>();

export function registerMonacoEditor(editor: MonacoEditorLike): () => void {
    editors.add(editor);
    editor.updateOptions(getMonacoOptionsFromSettings());
    return () => {
        editors.delete(editor);
    };
}

export function applyMonacoSettingsToAllEditors(): void {
    const options = getMonacoOptionsFromSettings();
    for (const editor of editors) {
        editor.updateOptions(options);
    }
    if (typeof window !== "undefined") {
        void import("@/lib/ui/monaco-theme").then(({ refreshShapeMonacoTheme }) => {
            refreshShapeMonacoTheme();
        }).catch(() => { /* monaco not loaded yet */ });
        void import("monaco-editor").then((monaco) => {
            monaco.editor?.remeasureFonts?.();
        }).catch(() => { /* monaco not loaded yet */ });
    }
}
