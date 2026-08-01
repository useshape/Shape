import { createContext, useContext } from "react";

export interface ExplorerContextType {
    selectedPath: string | null;
    selectedPaths: Set<string>;
    setSelectedPath: (path: string | null) => void;
    /** Click selection: plain / ctrl-toggle / shift-range among visible rows. */
    selectPath: (path: string, mods?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => void;
    clipboard: { type: "copy" | "cut"; paths: string[] } | null;
    setClipboard: (state: { type: "copy" | "cut"; paths: string[] } | null) => void;
    pendingCreate: { type: "file" | "folder"; parentPath: string } | null;
    setPendingCreate: (state: { type: "file" | "folder"; parentPath: string } | null) => void;
    pendingRename: string | null;
    setPendingRename: (path: string | null) => void;
    submitCreate: (name: string, parentPath: string) => Promise<void>;
    submitRename: (newName: string, oldPath: string) => Promise<void>;
    dragOverPath: string | null;
    setDragOverPath: (path: string | null) => void;
    joinPath: (...parts: string[]) => string;
    handleRefresh: (silent?: boolean) => void;
    handleCollapseAll: () => void;
    /** Paths that should stay expanded (e.g. after Reveal in Explorer). */
    forceExpandedPaths: Set<string>;
    /** Path to scroll into view after reveal. */
    revealPath: string | null;
    registerVisiblePath: (path: string) => void;
    unregisterVisiblePath: (path: string) => void;
}

export const ExplorerContext = createContext<ExplorerContextType | null>(null);

export function useExplorerContext() {
    const ctx = useContext(ExplorerContext);
    if (!ctx) throw new Error("Missing ExplorerContext");
    return ctx;
}
