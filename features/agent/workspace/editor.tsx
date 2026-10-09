"use client";

import { isBrowserTab } from "@/lib/window/browser-tab";
import { BrowserView } from "@/features/agent/workspace/browser";
import FileViewer from "@/features/editor/ui/main/editor";

export function FileEditor({ path }: { path: string }) {
    if (isBrowserTab(path)) {
        return <BrowserView />;
    }

    return <FileViewer path={path} />;
}
