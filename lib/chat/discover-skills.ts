"use client";

import { commands } from "@/lib/backend/commands";
import { getProjectPath } from "@/lib/backend/project-state";
import { listSkills, skillIdFromName, skillTitle } from "@/lib/chat/skills";

export type DiscoveredSkill = {
    name: string;
    body: string;
    /** Source filename on disk (used for display). */
    fileName: string;
    /** Source directory name relative to project (e.g. ".agents" or ".claude") */
    sourceDir: string;
    /**
     * Project-relative path (e.g. ".agents/guide.md"). Identifies a row for
     * React keys, dismissal storage, and list removal, so equal file names in
     * different directories stay independent.
     */
    relPath: string;
    /** Project the file was found in — dismissals are stored per project. */
    projectPath: string;
    /** "new" — no saved skill uses this slug; "changed" — a saved skill with this slug differs from disk */
    status: "new" | "changed";
};

/**
 * Directories scanned for skill files, with the extensions each one
 * contributes (discovery scope from issue #7: `.agents/*.md`, `.claude/*.mdc`).
 */
const DISCOVERY_DIRS: ReadonlyArray<{ dir: string; extensions: readonly string[] }> = [
    { dir: ".agents", extensions: [".md"] },
    { dir: ".claude", extensions: [".mdc"] },
];

/** Prefix for the per-project localStorage key holding dismissed files. */
const DISMISSED_KEY_PREFIX = "shape-dismissed-discovered:";

/** Get the localStorage key that stores dismissed paths for one project. */
function dismissedKey(projectPath: string): string {
    // Scope by project path so dismissals don't leak between repos
    return DISMISSED_KEY_PREFIX + projectPath.replace(/[\\/]+$/, "").toLowerCase();
}

/** Path separator used by the given project path. */
function projectSep(projectPath: string): string {
    return projectPath.includes("\\") ? "\\" : "/";
}

/** True when `fileName` carries one of the extensions `extensions` lists. */
function hasSupportedExtension(fileName: string, extensions: readonly string[]): boolean {
    const lower = fileName.toLowerCase();
    return extensions.some((extension) => lower.endsWith(extension));
}

/** Read a dismissed-path set from a specific localStorage key. */
function dismissedFilesFromKey(key: string): Set<string> {
    try {
        const raw = window.localStorage.getItem(key);
        return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
        return new Set();
    }
}

/**
 * Project-relative paths (e.g. ".agents/guide.md") dismissed in a project.
 * Dismissing `.agents/guide.md` therefore leaves `.claude/guide.mdc` visible.
 */
function dismissedFiles(projectPath: string): Set<string> {
    if (typeof window === "undefined") return new Set();
    return dismissedFilesFromKey(dismissedKey(projectPath));
}

/** Dismiss a discovered file for the project it was found in. */
export function dismissDiscoveredFile(projectPath: string, relPath: string) {
    if (typeof window === "undefined") return;
    const key = dismissedKey(projectPath);
    const set = dismissedFilesFromKey(key);
    set.add(relPath);
    window.localStorage.setItem(key, JSON.stringify([...set]));
}

let nextScanGen = 0; // generation counter to discard stale concurrent scans

/**
 * Scan `.agents/` and `.claude/` for supported skill files that are either new
 * or changed since import. Skips files the user has dismissed.
 *
 * Files are matched to saved skills by the same slug `addSkill` persists, so a
 * file that would replace an existing skill is reported as "changed" instead
 * of being offered as a fresh import.
 */
export async function discoverSkills(): Promise<DiscoveredSkill[]> {
    const projectPath = getProjectPath();
    if (!projectPath) return [];

    const scanGen = ++nextScanGen;

    const savedBySkillId = new Map<string, string>();
    for (const skill of listSkills()) {
        savedBySkillId.set(skillIdFromName(skill.name), skill.body);
    }

    const dismissed = dismissedFiles(projectPath);
    const sep = projectSep(projectPath);
    const base = projectPath.replace(/[\\/]+$/, "");
    const discovered: DiscoveredSkill[] = [];

    for (const { dir, extensions } of DISCOVERY_DIRS) {
        const dirPath = `${base}${sep}${dir}`;
        try {
            const entries = await commands.lsDir(dirPath);
            for (const entry of entries) {
                if (entry.is_dir) continue;
                const fileName = entry.name;
                if (!hasSupportedExtension(fileName, extensions)) continue;

                // Stop early if a newer scan started — prevents stale results
                if (scanGen !== nextScanGen) return [];

                const relPath = `${dir}/${fileName}`;
                if (dismissed.has(relPath)) continue;

                const filePath = `${dirPath}${sep}${fileName}`;
                try {
                    const body = await commands.readFileFromDisk(filePath);
                    if (!body) continue;

                    const trimmed = body.trim();
                    if (trimmed.length === 0) continue;

                    const existingBody = savedBySkillId.get(skillIdFromName(fileName));
                    if (existingBody === trimmed) continue;

                    discovered.push({
                        name: skillTitle(fileName),
                        body: trimmed,
                        fileName,
                        sourceDir: dir,
                        relPath,
                        projectPath,
                        status: existingBody === undefined ? "new" : "changed",
                    });
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
