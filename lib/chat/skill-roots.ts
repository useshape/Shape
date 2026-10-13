"use client";

import { joinSkillPath, normalizeSkillPath } from "@/lib/chat/skill-paths";

/** Where a skill file was found. */
export type SkillRootScope = "project" | "user" | "custom";

/** How a root is laid out on disk. */
export type SkillRootKind =
    /** `SKILL.md` inside a folder per skill: `<root>/<name>/SKILL.md`. */
    | "skills-dir"
    /** Loose instruction files directly in the root: `<root>/*.md`. */
    | "flat";

/** A directory Shape scans for skill files. */
export type SkillRoot = {
    /** Absolute directory to scan. */
    path: string;
    scope: SkillRootScope;
    kind: SkillRootKind;
    /** Human label for the UI, e.g. `.claude/skills` or `~/.claude/skills`. */
    label: string;
    /** Flat roots only: file extensions accepted inside the root. */
    extensions?: readonly string[];
};

/**
 * Skill folders inside the project, highest precedence first. `.claude/skills`
 * is Claude Code's, `.agents/skills` is the cross-agent location used by Codex
 * and Copilot, `.github/skills` is Copilot's, and `.shape/skills` is Shape's.
 */
const PROJECT_SKILL_DIRS = [".claude/skills", ".agents/skills", ".github/skills", ".shape/skills"] as const;

/** Loose instruction files, kept from issue #7's original scope. */
const PROJECT_FLAT_ROOTS: ReadonlyArray<{ dir: string; extensions: readonly string[] }> = [
    { dir: ".agents", extensions: [".md"] },
    { dir: ".claude", extensions: [".mdc"] },
];

/** User-level skill folders, shared across every project on the machine. */
const USER_SKILL_DIRS = [".claude/skills", ".agents/skills", ".shape/skills"] as const;

/** File name that marks a folder as a skill. */
export const SKILL_FILE_NAME = "SKILL.md";

export type SkillRootInput = {
    projectPath: string | null;
    homeDir: string | null;
    /** Folders the user picked in Settings → Skills, in the order added. */
    customFolders: readonly string[];
};

/**
 * Ordered scan roots, highest precedence first: project skills folders, loose
 * project files, folders the user picked, then user-level folders. A skill
 * found earlier wins when two files would import under the same ID.
 */
export function listSkillRoots({ projectPath, homeDir, customFolders }: SkillRootInput): SkillRoot[] {
    const roots: SkillRoot[] = [];

    if (projectPath) {
        for (const dir of PROJECT_SKILL_DIRS) {
            roots.push({
                path: joinSkillPath(projectPath, dir),
                scope: "project",
                kind: "skills-dir",
                label: dir,
            });
        }
        for (const { dir, extensions } of PROJECT_FLAT_ROOTS) {
            roots.push({
                path: joinSkillPath(projectPath, dir),
                scope: "project",
                kind: "flat",
                label: dir,
                extensions,
            });
        }
    }

    for (const folder of customFolders) {
        const path = normalizeSkillPath(folder.trim());
        if (!path.trim()) continue;
        roots.push({ path, scope: "custom", kind: "skills-dir", label: path });
        // A picked folder may also be a plain folder of markdown files.
        roots.push({ path, scope: "custom", kind: "flat", label: path, extensions: [".md", ".mdc"] });
    }

    if (homeDir) {
        for (const dir of USER_SKILL_DIRS) {
            roots.push({
                path: joinSkillPath(homeDir, dir),
                scope: "user",
                kind: "skills-dir",
                label: `~/${dir}`,
            });
        }
    }

    return roots;
}
