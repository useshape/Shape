"use client";

import { lazy, Suspense } from "react";

const PreviewPanel = lazy(() => import("@/features/preview/ui/preview-panel"));

export function WorkspacePreview() {
    return (
        <Suspense fallback={<div className="h-full bg-panel" />}>
            <PreviewPanel />
        </Suspense>
    );
}
