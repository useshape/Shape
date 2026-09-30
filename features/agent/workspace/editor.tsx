"use client";

import { isBrowserTab } from "@/lib/window/browser-tab";
import FileViewer from "@/features/editor/ui/main/editor";
import { EditorDock } from "./editor-dock";

export function FileEditor({ path }: { path: string }) {
    if (isBrowserTab(path)) {
        return (
            <div className="flex h-full items-center justify-center p-4 text-sm text-text-muted">
                The in-app browser was removed.
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">
                <FileViewer path={path} />
            </div>
            <EditorDock path={path} />
        </div>
    );
}
