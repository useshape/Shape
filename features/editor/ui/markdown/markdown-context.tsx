"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MarkdownSourceRange } from "./lib/markdown-format";

export type SelectedMarkdownImage = {
    el: HTMLImageElement;
    src: string;
    range: MarkdownSourceRange | null;
};

export type MarkdownPreviewApi = {
    content: string;
    editable: boolean;
    filePath?: string;
    projectPath?: string | null;
    resolveImageUrls: (src: string) => string[];
    selectImage: (el: HTMLImageElement) => void;
    toggleTask: (range: MarkdownSourceRange) => void;
    applyContent: (next: string) => void;
};

const MarkdownPreviewContext = createContext<MarkdownPreviewApi | null>(null);

export function MarkdownPreviewProvider({
    value,
    children,
}: {
    value: MarkdownPreviewApi;
    children: ReactNode;
}) {
    return (
        <MarkdownPreviewContext.Provider value={value}>
            {children}
        </MarkdownPreviewContext.Provider>
    );
}

export function useMarkdownPreview(): MarkdownPreviewApi | null {
    return useContext(MarkdownPreviewContext);
}
