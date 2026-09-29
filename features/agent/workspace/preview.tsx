"use client";

import { BrowserView } from "./browser";

export function WorkspacePreview(props: {
    tabId?: string | null;
    tabIds?: string[];
    onMeta?: (id: string, title: string, url: string, favicon?: string) => void;
    onUseTool?: (kind: "files" | "graph" | "prs") => void;
}) {
    return <BrowserView {...props} />;
}
