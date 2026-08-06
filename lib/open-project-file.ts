"use client";

import { commands, getProjectPath } from "@/lib/backend";
import { resolveProjectFilePath } from "@/lib/path-utils";
import { notify } from "@/features/notifications";

/** Reveal a directory in the explorer tree (folders have no editor tab). */
async function revealFolder(resolved: string): Promise<boolean> {
    try {
        await commands.lsDir(resolved);
    } catch {
        return false;
    }
    window.dispatchEvent(
        new CustomEvent("shape-reveal-in-explorer", { detail: { path: resolved } }),
    );
    return true;
}

/**
 * Open a path from chat/workflow UI. Files open as editor tabs; folders are
 * revealed in the explorer. Resolves relative paths and surfaces missing
 * paths cleanly.
 */
export async function openProjectFile(filePath: string, displayName?: string): Promise<boolean> {
    const resolved = resolveProjectFilePath(filePath, getProjectPath());
    const name = displayName || resolved.split(/[\\/]/).pop() || resolved;

    // Trailing slash means it can only be a folder (e.g. `apps/docs/`).
    const looksLikeFolder = /[\\/]\s*$/.test(filePath.trim());
    if (looksLikeFolder) {
        if (await revealFolder(resolved)) return true;
        notify.error("Folder not found", `${name} could not be found. It may have been moved or deleted.`);
        return false;
    }

    try {
        await commands.readFile(resolved);
    } catch {
        // Not a readable file - it may be a folder written without a trailing slash.
        if (await revealFolder(resolved)) return true;
        notify.error("File not found", `${name} could not be opened. It may have been moved or deleted.`);
        return false;
    }

    try {
        await commands.openFile(resolved, name);
        return true;
    } catch (e) {
        notify.error("Failed to open", e instanceof Error ? e.message : String(e));
        return false;
    }
}
