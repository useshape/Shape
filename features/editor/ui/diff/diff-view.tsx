"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { bracketMatching } from "@codemirror/language";
import { languageForPath } from "@/features/editor/ui/codemirror/lang";
import { shapeEditorChrome } from "@/features/editor/ui/codemirror/theme";
import { cn } from "@/lib/utils";

function baseExtensions(path: string) {
    const lang = languageForPath(path);
    return [
        ...shapeEditorChrome(),
        lineNumbers(),
        bracketMatching(),
        EditorView.editable.of(false),
        EditorView.lineWrapping,
        ...(lang ? [lang] : []),
    ];
}

/** CodeMirror diff — unified (inline) by default; optional split. */
export function DiffView({
    path,
    originalContent,
    content,
    mode = "unified",
    className,
}: {
    path: string;
    originalContent: string;
    content: string;
    mode?: "split" | "unified";
    getLanguage?: (path: string) => string;
    className?: string;
}) {
    const host = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const mergeRef = useRef<MergeView | null>(null);

    useEffect(() => {
        if (!host.current) return;
        viewRef.current?.destroy();
        viewRef.current = null;
        mergeRef.current?.destroy();
        mergeRef.current = null;
        host.current.replaceChildren();

        const original = originalContent ?? "";
        const current = content ?? "";

        if (mode === "split") {
            mergeRef.current = new MergeView({
                parent: host.current,
                orientation: "a-b",
                highlightChanges: true,
                gutter: true,
                collapseUnchanged: { margin: 2, minSize: 4 },
                a: { doc: original, extensions: baseExtensions(path) },
                b: { doc: current, extensions: baseExtensions(path) },
            });
        } else {
            const state = EditorState.create({
                doc: current,
                extensions: [
                    ...baseExtensions(path),
                    unifiedMergeView({
                        original,
                        mergeControls: false,
                        gutter: true,
                        highlightChanges: true,
                        collapseUnchanged: { margin: 2, minSize: 4 },
                    }),
                ],
            });
            viewRef.current = new EditorView({ state, parent: host.current });
        }

        return () => {
            viewRef.current?.destroy();
            viewRef.current = null;
            mergeRef.current?.destroy();
            mergeRef.current = null;
        };
    }, [path, originalContent, content, mode]);

    return (
        <div
            ref={host}
            className={cn("h-full min-h-[160px] overflow-hidden bg-panel", className)}
        />
    );
}

/** @deprecated Use DiffView */
export const SimpleDiffView = DiffView;
