"use client";

/** Agent window: Monaco is gone — keep no-op exports for any leftover callers. */

type MonacoEditorLike = {
    updateOptions: (options: Record<string, unknown>) => void;
};

const editors = new Set<MonacoEditorLike>();

export function registerMonacoEditor(editor: MonacoEditorLike): () => void {
    editors.add(editor);
    return () => {
        editors.delete(editor);
    };
}

export function applyMonacoSettingsToAllEditors(): void {
    // no-op
}
