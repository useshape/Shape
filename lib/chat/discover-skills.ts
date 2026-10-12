"use client";

import { commands } from "@/lib/backend/commands";
import { getProjectPath } from "@/lib/backend/project-state";
import { listSkills } from "@/lib/chat/skills";

export type DiscoveredSkill = {
    name: string;
    body: string;
    /** Source filename on disk (used for display and dismissal identity) */
    fileName: string;
    /** Source directory name relative to project (e.g. ".agents" or ".claude") */
    sourceDir: string;
    /** "new" — not yet imported; "changed" — imported but differs from disk */
    status: "new" | "changed";
};

const DIRS = [".agents", ".claude"];
const FILE_RE = /\.(md|mdc|txt)$/i;
/** Separator between fileName and name so dismissal key is scoped per file. */
const DISMISSED_KEY_PREFIX = "shape-dismissed-discovered:";
function dismissedKey(projectPath: string): string {
    // Scope by project path so dismissals don't leak between repos
    return DISMISSED_KEY_PREFIX + projectPath.replace(/[\\/]+$/, "").toLowerCase();
}

function projectSep(projectPath: string): string {
    return projectPath.includes("\\") ? "\\" : "/";
}

function cleanName(filename: string): string {
    return filename.replace(FILE_RE, "").trim();
}

/** Get the project-scoped localStorage key for dismissing discovered files. */
function currentDismissedKey(): string | null {
    const projectPath = getProjectPath();
    if (!projectPath) return null;
    return dismissedKey(projectPath);
}

/** File names the user has dismissed (cached in localStorage). */
function dismissedFiles(projectPath: string): Set<string> {
    if (typeof window === "undefined") return new Set();
    const key = dismissedKey(projectPath);
    try {
        const raw = window.localStorage.getItem(key);
        return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
        return new Set();
    }
}

export function dismissDiscoveredFile(fileName: string) {
    const key = currentDismissedKey();
    if (!key) return;
    const set = dismissedFilesFromKey(key);
    set.add(fileName);
    window.localStorage.setItem(key, JSON.stringify([...set]));
}

export function undiscoverDismissedFile(fileName: string) {
    const key = currentDismissedKey();
    if (!key) return;
    const set = dismissedFilesFromKey(key);
    set.delete(fileName);
    window.localStorage.setItem(key, JSON.stringify([...set]));
}

/** Read dismissed set from a specific localStorage key. */
function dismissedFilesFromKey(key: string): Set<string> {
    try {
        const raw = window.localStorage.getItem(key);
        return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
        return new Set();
    }
}

let nextScanGen = 0; // generation counter to discard stale concurrent scans

/**
 * Scan `.agents/` and `.claude/` for markdown files that are either new
 * or have changed since import. Skips files the user has dismissed.
 */
export async function discoverSkills(): Promise<DiscoveredSkill[]> {
    const projectPath = getProjectPath();
    if (!projectPath) return [];

    const scanGen = ++nextScanGen;

    const existing = listSkills();
    const byName = new Map<string, string>();
    for (const skill of existing) {
        byName.set(skill.name.toLowerCase(), skill.body);
    }

    const dismissed = dismissedFiles(projectPath);
    const sep = projectSep(projectPath);
    const base = projectPath.replace(/[\\/]+$/, "");
    const discovered: DiscoveredSkill[] = [];

    for (const dirName of DIRS) {
        const dirPath = `${base}${sep}${dirName}`;
        try {
            const entries = await commands.lsDir(dirPath);
            for (const entry of entries) {
                if (entry.is_dir) continue;
                if (!FILE_RE.test(entry.name)) continue;

                // Stop early if a newer scan started — prevents stale results
                if (scanGen !== nextScanGen) return [];

                const name = cleanName(entry.name);
                const fileName = entry.name;
                if (dismissed.has(fileName)) continue;

                const filePath = `${dirPath}${sep}${fileName}`;
                try {
                    const body = await commands.readFileFromDisk(filePath);
                    if (!body) continue;

                    const trimmed = body.trim();
                    if (trimmed.length === 0) continue;

                    const key = name.toLowerCase();
                    const existingBody = byName.get(key);

                    if (existingBody === undefined) {
                        discovered.push({ name, body: trimmed, fileName, sourceDir: dirName, status: "new" });
                    } else if (existingBody !== trimmed) {
                        discovered.push({ name, body: trimmed, fileName, sourceDir: dirName, status: "changed" });
                    }
                } catch {
                    /* skip unreadable files */
                }
            }
        } catch {
            /* directory doesn't exist or is unreadable */
        }
    }

    return discovered;
}