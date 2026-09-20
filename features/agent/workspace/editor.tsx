"use client";

import React, { useEffect, useRef, useState } from "react";
import { isBrowserTab } from "@/lib/window/browser-tab";
import { WorkspacePreview } from "./preview";

export function FileEditor({ path }: { path: string }) {
    if (isBrowserTab(path)) {
        return <WorkspacePreview />;
    }

    return <CodeEditor path={path} />;
}

type EditorMod = {
    CodeMirrorEditor: typeof import("@/features/editor/ui/codemirror/editor").CodeMirrorEditor;
    DiffView: typeof import("@/features/editor/ui/diff/diff-view").DiffView;
    useFileContent: typeof import("@/features/editor/ui/main/hooks/use-file-content").useFileContent;
};

function CodeEditor({ path }: { path: string }) {
    const [mod, setMod] = useState<EditorMod | null>(null);

    useEffect(() => {
        let cancelled = false;
        void Promise.all([
            import("@/features/editor/ui/codemirror/editor"),
            import("@/features/editor/ui/diff/diff-view"),
            import("@/features/editor/ui/main/hooks/use-file-content"),
        ]).then(([editor, diff, content]) => {
            if (cancelled) return;
            setMod({
                CodeMirrorEditor: editor.CodeMirrorEditor,
                DiffView: diff.DiffView,
                useFileContent: content.useFileContent,
            });
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!mod) return <div className="h-full bg-panel" />;
    return <FileEditorInner path={path} mod={mod} />;
}

function FileEditorInner({
    path,
    mod,
}: {
    path: string;
    mod: EditorMod;
}) {
    const savedContentRef = useRef("");
    const bufferVersionRef = useRef(0);
    const isFirstLoadRef = useRef(true);
    const isDirtyRef = useRef(false);
    const isDiff = path.startsWith("diff:");

    const { content, setContent, originalContent, error, loading } = mod.useFileContent(
        path,
        false,
        isDiff,
        savedContentRef,
        bufferVersionRef,
    );

    if (error) return <div className="p-4 text-sm text-error">{error}</div>;
    if (loading) return <div className="h-full bg-panel" />;
    if (isDiff) {
        return (
            <mod.DiffView path={path} originalContent={originalContent} content={content} mode="unified" />
        );
    }
    return (
        <mod.CodeMirrorEditor
            path={path}
            content={content}
            setContent={setContent}
            savedContentRef={savedContentRef}
            isDirtyRef={isDirtyRef}
            bufferVersionRef={bufferVersionRef}
            isFirstLoadRef={isFirstLoadRef}
        />
    );
}
