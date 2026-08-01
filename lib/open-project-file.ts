"use client";

import { commands, getProjectPath } from "@/lib/backend";
import { resolveProjectFilePath } from "@/lib/path-utils";
import { notify } from "@/features/notifications";

/** Open a path from chat/workflow UI. Resolves relative paths and surfaces missing files cleanly. */
export async function openProjectFile(filePath: string, displayName?: string): Promise<boolean> {
    const resolved = resolveProjectFilePath(filePath, getProjectPath());
    const name = displayName || resolved.split(/[\\/]/).pop() || resolved;

    try {
        await commands.readFile(resolved);
    } catch {
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
