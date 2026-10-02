"use client";

import { isBrowserTab } from "@/lib/window/browser-tab";
import FileViewer from "@/features/editor/ui/main/editor";

export function FileEditor({ path }: { path: string }) {
    if (isBrowserTab(path)) {
        return (
            <div className="flex h-full items-center justify-center p-4 text-sm text-text-muted">
                The in-app browser was removed.
            </div>
        );
    }

    return <FileViewer path={path} />;
}
