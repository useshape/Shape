"use client";

import { commands } from "@/lib/backend/commands";
import { getSettings, subscribeSettings, updateSettingSection } from "@/lib/settings";

/** Custom skill folders the user added in Settings → Skills. */
export function listCustomSkillFolders(): string[] {
    const folders = getSettings().skills?.folders;
    return Array.isArray(folders) ? folders.filter((folder) => typeof folder === "string" && folder.trim() !== "") : [];
}

/** Persist the custom skill folder list, dropping duplicates and blanks. */
function saveCustomSkillFolders(folders: readonly string[]): void {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const folder of folders) {
        const trimmed = folder.trim();
        const key = trimmed.toLowerCase();
        if (!trimmed || seen.has(key)) continue;
        seen.add(key);
        unique.push(trimmed);
    }
    updateSettingSection("skills", { folders: unique });
}

/** Add a folder to the custom skill folder list. Returns the new list. */
export function addCustomSkillFolder(folder: string): string[] {
    saveCustomSkillFolders([...listCustomSkillFolders(), folder]);
    return listCustomSkillFolders();
}

/** Remove a custom skill folder. Returns the new list. */
export function removeCustomSkillFolder(folder: string): string[] {
    const key = folder.trim().toLowerCase();
    saveCustomSkillFolders(listCustomSkillFolders().filter((item) => item.trim().toLowerCase() !== key));
    return listCustomSkillFolders();
}

/** Subscribe to changes in the custom skill folder list. */
export function subscribeCustomSkillFolders(listener: () => void): () => void {
    return subscribeSettings(listener);
}

/** Resolve the user's home directory once per session. */
let homeDirPromise: Promise<string | null> | null = null;

/** Absolute home directory, or null when it cannot be resolved. Cached. */
export function getHomeDir(): Promise<string | null> {
    if (!homeDirPromise) {
        homeDirPromise = commands
            .homeDir()
            .then((home) => (typeof home === "string" && home.trim() !== "" ? home : null))
            .catch(() => null);
    }
    return homeDirPromise;
}

/** Drop the cached home directory (tests, or after the OS user changes). */
export function resetHomeDirCache(): void {
    homeDirPromise = null;
}
