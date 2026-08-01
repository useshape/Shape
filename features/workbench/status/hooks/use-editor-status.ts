"use client";

import { useEffect, useState } from "react";
import { DEFAULT_EDITOR_STATUS, type EditorStatus } from "../types";

export function useEditorStatus() {
    const [editorStatus, setEditorStatus] = useState<EditorStatus>(DEFAULT_EDITOR_STATUS);
    const [typescriptVersion, setTypescriptVersion] = useState<string | null>(null);

    useEffect(() => {
        const onTs = (e: Event) => {
            const version = (e as CustomEvent<string>).detail;
            if (version) setTypescriptVersion(version);
        };
        window.addEventListener("shape-typescript-version", onTs as EventListener);
        return () => window.removeEventListener("shape-typescript-version", onTs as EventListener);
    }, []);

    useEffect(() => {
        const onUpdate = (event: Event) => {
            const detail = (event as CustomEvent<Partial<EditorStatus>>).detail;
            if (detail) setEditorStatus((prev) => ({ ...prev, ...detail }));
        };
        window.addEventListener("shape-editor-status", onUpdate as EventListener);
        return () => window.removeEventListener("shape-editor-status", onUpdate as EventListener);
    }, []);

    return { editorStatus, typescriptVersion };
}

export function dispatchEditorAction(action: string, detail?: Record<string, unknown>) {
    window.dispatchEvent(new CustomEvent("shape-editor-action", { detail: { action, ...detail } }));
}

export function openStatusPalette(
    placeholder: string,
    actions: { id: string; label: string; icon?: string; run: () => void }[],
) {
    window.dispatchEvent(
        new CustomEvent("shape-command-palette", {
            detail: {
                placeholder,
                actions: actions.map((action) => ({ ...action, shortcut: "" })),
            },
        }),
    );
}
